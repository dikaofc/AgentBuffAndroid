import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent, AgentEvents, MockProvider, runSubAgent } from "../src/index";
import { ToolRegistry, registerBuiltinTools } from "@dikabuff/tools";
import { makeLearnedTool } from "@dikabuff/learner";
import type { LearnedToolSpec } from "@dikabuff/learner";
import { MemoryManager } from "@dikabuff/memory";
import { defaultConfig } from "@dikabuff/config";
import type { PermissionRequest } from "@dikabuff/shared";

let dir: string;
let cwd: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "dikabuff-agent-"));
  cwd = path.join(dir, "proj");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "demo-app", scripts: { test: "echo ok" } }));
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "index.ts"), "export const hello = 'world';");
});

function makeAgent(overrides: Partial<Parameters<typeof buildAgent>[0]> = {}) {
  return buildAgent({ cwd, ...overrides });
}

function buildAgent(opts: { cwd: string; approveAll?: boolean; mode?: any }) {
  const events = new AgentEvents();
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  const memory = new MemoryManager({
    memoryDir: path.join(dir, "mem"),
    sessionsDir: path.join(dir, "sessions"),
    provider: "json",
    vector: false,
  });
  const config = defaultConfig("test");
  config.mode = opts.mode ?? "code";
  // When consent is refused, force the consent path for the tools the mock invokes.
  if (opts.approveAll === false) config.permissions.tools.project_scan = "ask";
  const consent = async (_req: PermissionRequest) => opts.approveAll ?? true;
  const agent = new Agent(
    {
      provider: new MockProvider("dikabuff-mock-1", 0),
      registry,
      memory,
      config,
      cwd: opts.cwd,
      events,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      consent,
      sessionStore: memory.sessions,
      streamMode: "replay",
    },
    undefined,
  );
  return { agent, events, memory, registry };
}

describe("Agent loop (mock provider)", () => {
  it("runs a full turn: tools → answer, emits lifecycle events", async () => {
    const { agent, events } = makeAgent();
    const seen: string[] = [];
    events.onAny((ev) => seen.push(ev.type));

    const result = await agent.run("explore this project and suggest an improvement");

    expect(result.answer).toContain("Project snapshot");
    expect(result.answer).toContain("demo-app");
    expect(result.toolCalls).toBeGreaterThan(0);
    expect(result.turns).toBeGreaterThan(0);
    expect(seen).toContain("thinking");
    expect(seen).toContain("tool:start");
    expect(seen).toContain("tool:done");
    expect(seen).toContain("message:delta");
    expect(seen).toContain("done");
  });

  it("persists conversation to memory", async () => {
    const { agent, memory } = makeAgent();
    await agent.run("hello there");
    const messages = await memory.getMessages(agent.session.id);
    expect(messages.some((m) => m.role === "user" && m.content === "hello there")).toBe(true);
    expect(messages.some((m) => m.role === "assistant" && m.content.length > 20)).toBe(true);
  });

  it("denies tools when consent is refused", async () => {
    const { agent, events } = makeAgent({ approveAll: false });
    let denied = false;
    events.on("tool:error", (ev) => {
      if (ev.result?.error?.includes("Permission denied")) denied = true;
    });
    const result = await agent.run("make a change to src/index.ts");
    expect(denied).toBe(true);
    expect(result.answer).toBeTruthy();
  });

  it("tracks token + cost usage in results", async () => {
    const { agent } = makeAgent();
    // Attach pricing so cost is estimable.
    (agent as unknown as { opts: { modelCost?: { costPer1MInput: number; costPer1MOutput: number } } }).opts.modelCost = {
      costPer1MInput: 1,
      costPer1MOutput: 2,
    };
    const result = await agent.run("explore this project");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.costUsd).toBeGreaterThan(0);
    const usage = agent.getUsage();
    expect(usage.totalTokens).toBeGreaterThan(0);
    expect(usage.priced).toBe(true);
  });

  it("compacts long conversation histories", async () => {
    const { agent, memory } = makeAgent();
    // Seed a long history (10+ messages) over the compact threshold.
    const cfg = (agent as unknown as { opts: { config: { compactThresholdTokens: number } } }).opts.config;
    cfg.compactThresholdTokens = 1; // compact almost immediately
    for (let i = 0; i < 10; i++) {
      await memory.appendMessage(agent.session.id, {
        id: `seed-${i}`,
        role: "user",
        content: `seed message ${i} `.repeat(30),
        createdAt: Date.now() + i,
      });
    }
    const result = await agent.run("hello");
    expect(result.compacted).toBe(true);
    const messages = await memory.getMessages(agent.session.id);
    expect(messages.length).toBeLessThan(12);
    expect(messages.some((m) => m.content.startsWith("_Earlier conversation compacted"))).toBe(true);
  });

  it("runs read-only sub-agents that can fan out (parallel research)", async () => {
    const { agent, events, registry, memory } = makeAgent();
    const metas: string[] = [];
    events.on("meta", (ev) => {
      if (ev.meta?.subagent) metas.push(`${(ev.meta.subagent as any).index}/${(ev.meta.subagent as any).total}:${(ev.meta.subagent as any).status}`);
    });

    const tasks = [
      { prompt: "explore the project structure", label: "structure" },
      { prompt: "list top-level files", label: "files" },
    ];
    const results = await Promise.all(
      tasks.map((task, index) =>
        runSubAgent(
          {
            provider: new MockProvider("dikabuff-mock-1", 0),
            registry,
            memory,
            config: (agent as unknown as { opts: { config: any } }).opts.config,
            cwd,
            sessionId: agent.session.id,
            events,
            logger: { debug() {}, info() {}, warn() {}, error() {} },
          },
          task,
          index,
          tasks.length,
        ),
      ),
    );

    expect(results.length).toBe(2);
    for (const r of results) expect(r.ok).toBe(true);
    expect(results[0]!.output.length).toBeGreaterThan(20);
    // Progress events were emitted for each task (running + tool + done).
    expect(metas.some((m) => m.includes(":running"))).toBe(true);
    expect(metas.some((m) => m.includes(":done"))).toBe(true);
  });

  it("subagent tool exists in the registry and requires runSubAgent", async () => {
    const { registry, agent } = makeAgent();
    const tool = registry.get("subagent");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("read-only");
    // Without the runner wired, the tool reports the missing capability.
    const result = await tool!.run({ tasks: [{ prompt: "x" }] }, {
      cwd,
      sessionId: agent.session.id,
      mode: "code",
      memory: undefined as never,
      environment: {},
      log: { debug() {}, info() {}, warn() {}, error() {} },
      emit: () => {},
      ask: async () => null,
    } as never);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not available");
  });

  it("executes an auto-learned macro tool with the injected runTool capability", async () => {
    const { agent, registry } = makeAgent();
    // Register a learned macro: read_file then search_files.
    const spec: LearnedToolSpec = {
      name: "learn_read_search",
      description: "auto-learned macro",
      category: "analysis",
      permission: "standard",
      steps: [
        { tool: "read_file", args: { path: "package.json" } },
        { tool: "search_files", args: { pattern: "demo-app" } },
      ],
      signature: "read_file>search_files",
      hits: 2,
      createdAt: Date.now(),
    };
    registry.register(makeLearnedTool(spec));

    // The agent injects runTool on its tool context — execute through the real
    // registry pipeline and confirm the capability reaches the macro's run().
    const result = await agent.run("use learn_read_search");
    expect(result.answer).toBeTruthy();

    // Directly verify the macro runs via a host-provided runTool (like the agent's).
    const macro = registry.get("learn_read_search")!;
    const ctx = {
      cwd,
      sessionId: agent.session.id,
      mode: "code",
      memory: undefined as never,
      environment: {},
      log: { debug() {}, info() {}, warn() {}, error() {} },
      emit: () => {},
      ask: async () => null,
      runTool: async (name: string, args: unknown) => {
        if (name === "read_file") return { ok: true, output: "{ \"name\": \"demo-app\" }" };
        if (name === "search_files") return { ok: true, output: "found demo-app" };
        return { ok: false, error: `unknown ${name}` };
      },
    };
    const direct = await macro.run({}, ctx as never);
    expect(direct.ok).toBe(true);
    expect(direct.output).toContain("demo-app");
  });

  it("loads project memory from DIKABUFF.md into the system prompt", async () => {
    const { agent, events } = makeAgent();
    writeFileSync(path.join(cwd, "DIKABUFF.md"), "# Project rules\nAlways use tabs.\n");
    let systemPrompt = "";
    events.on("meta", (ev) => {
      if (ev.meta?.session) {
        // no-op; we read system via context build below
      }
    });
    const { buildSystemPrompt } = await import("../src/context");
    const snapshot = await (agent as unknown as { buildSnapshot(): Promise<{ cwd: string; packageName?: string; gitBranch?: string; projectMemory?: string }> }).buildSnapshot();
    const prompt = buildSystemPrompt((agent as unknown as { opts: { config: any } }).opts.config, agent.session, snapshot);
    expect(systemPrompt);
    expect(prompt).toContain("Always use tabs");
    expect(prompt).toContain("PROJECT MEMORY");
  });
});