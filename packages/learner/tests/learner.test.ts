import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnConfig, ToolContext, ToolDefinition, ToolResult } from "@dikabuff/shared";
import { Learner, type LearnEventBus, type LearnRegistryLike } from "../src/learner";
import { detectPatterns, representativeArgs, toolNameForPattern } from "../src/patterns";
import { runSteps } from "../src/macro";
import type { LearnEpisode } from "../src/types";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dk-learn-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const CONFIG: LearnConfig = {
  enabled: true,
  minPatternHits: 2,
  maxSteps: 3,
  maxTools: 20,
  maxEpisodesPerDay: 200,
};

/** Minimal registry with a couple of fake tools for pattern/step tests. */
function fakeRegistry(): LearnRegistryLike & { tools: ToolDefinition[] } {
  const tools: ToolDefinition[] = [
    { name: "read_file", description: "read", schema: { type: "object", properties: {} }, permission: "safe", category: "filesystem", run: async () => ({ ok: true, output: "file content" }) },
    { name: "search_files", description: "search", schema: { type: "object", properties: {} }, permission: "safe", category: "analysis", run: async () => ({ ok: true, output: "hits" }) },
    { name: "git_status", description: "git", schema: { type: "object", properties: {} }, permission: "safe", category: "development", run: async () => ({ ok: true, output: "clean" }) },
  ];
  return {
    tools,
    get: (n: string) => tools.find((t) => t.name === n),
    has: (n: string) => tools.some((t) => t.name === n),
    register: (t: ToolDefinition) => {
      tools.push(t);
    },
  };
}

/** Dummy event bus that records the listener for manual dispatch. */
function fakeBus(): { bus: LearnEventBus; emit(ev: Record<string, unknown>): void } {
  let listener: ((ev: any) => void) | null = null;
  return {
    bus: {
      onAny: (l: (ev: any) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      },
    },
    emit: (ev) => listener?.(ev),
  };
}

function dayN(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function makeEpisode(tools: string[], day = dayN(0), ok = true): LearnEpisode {
  return {
    id: Math.random().toString(36).slice(2),
    at: new Date(day + "T10:00:00Z").getTime(),
    day,
    prompt: "task",
    cwd: "/proj",
    ok,
    turns: 2,
    toolCalls: tools.map((t) => ({ tool: t, ok, args: t === "search_files" ? { pattern: "TODO" } : {} })),
    durationMs: 500,
  };
}

describe("pattern detection", () => {
  it("finds repeated successful sequences across episodes", () => {
    const eps = [makeEpisode(["search_files", "read_file"]), makeEpisode(["search_files", "read_file"]), makeEpisode(["git_status"])];
    const patterns = detectPatterns(eps, { minHits: 2 });
    expect(patterns.length).toBe(1);
    expect(patterns[0]!.signature).toBe("search_files>read_file");
    expect(patterns[0]!.hits).toBe(2);
  });

  it("does not count a sequence twice within the same episode", () => {
    const eps = [makeEpisode(["search_files", "read_file", "search_files", "read_file"]), makeEpisode(["git_status"])];
    const patterns = detectPatterns(eps, { minHits: 2 });
    expect(patterns.length).toBe(0); // only one episode has it
  });

  it("ignores failed tool calls", () => {
    const ok1 = makeEpisode(["search_files", "read_file"]);
    const fail = makeEpisode(["search_files", "read_file"], dayN(0), false);
    const patterns = detectPatterns([ok1, fail], { minHits: 2 });
    expect(patterns.length).toBe(0);
  });
});

describe("representative args", () => {
  it("keeps short stable args and blanks session-specific blobs", () => {
    const calls = [
      { tool: "search_files", ok: true, args: { pattern: "TODO", path: "/very/long/absolute/path/that/exceeds/the/fourty/eight/char/limit/here" } },
    ];
    const args = representativeArgs(calls, "search_files");
    expect(args.pattern).toBe("TODO");
    expect(args.path).toBeUndefined();
  });
});

describe("tool naming", () => {
  it("generates unique names", () => {
    const taken = new Set<string>();
    const p = { signature: "a>b", tools: ["a", "b"], hits: 2, lastSeen: 1 };
    expect(toolNameForPattern(p, taken)).toBe("learn_a_b");
    taken.add("learn_a_b");
    expect(toolNameForPattern(p, taken)).toBe("learn_a_b_2");
  });
});

describe("macro steps", () => {
  const ctx: ToolContext = {
    cwd: "/x",
    sessionId: "s",
    mode: "code",
    memory: {} as never,
    environment: {},
    log: {} as never,
    emit: () => {},
    ask: async () => null,
    runTool: async (name: string): Promise<ToolResult> => (name === "boom" ? { ok: false, error: "boom failed" } : { ok: true, output: `out:${name}` }),
  };

  it("runs steps in order and concatenates output", async () => {
    const result = await runSteps(
      [
        { tool: "read_file", args: {} },
        { tool: "search_files", args: {} },
      ],
      ctx,
      "learn_x",
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("out:read_file");
    expect(result.output).toContain("out:search_files");
  });

  it("stops at the first failing step", async () => {
    const result = await runSteps(
      [
        { tool: "read_file", args: {} },
        { tool: "boom", args: {} },
        { tool: "search_files", args: {} },
      ],
      ctx,
      "learn_x",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom failed");
  });

  it("guards against recursion", async () => {
    const result = await runSteps([{ tool: "learn_x", args: {} }], ctx, "learn_x");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Recursion guard");
  });
});

describe("learner end-to-end", () => {
  it("records episodes and auto-creates + persists a learned tool", async () => {
    const registry = fakeRegistry();
    const learner = new Learner({
      learnDir: dir,
      registry,
      config: CONFIG,
      logger: { debug: () => {}, info: () => {} },
      cwd: "/proj",
    });
    const { bus, emit } = fakeBus();
    learner.attach(bus);

    // Two recorded runs, each using search_files → read_file (successful).
    for (let i = 0; i < 2; i++) {
      emit({ type: "message:start", timestamp: 1 });
      emit({ type: "tool:start", toolName: "search_files", toolArgs: { pattern: "TODO" }, timestamp: 2 });
      emit({ type: "tool:done", toolName: "search_files", timestamp: 3 });
      emit({ type: "tool:start", toolName: "read_file", toolArgs: { path: "x.ts" }, timestamp: 4 });
      emit({ type: "tool:done", toolName: "read_file", timestamp: 5 });
      emit({ type: "done", timestamp: Date.now(), meta: { prompt: "find todos", turns: 2, durationMs: 100 } });
    }
    await learner.learnOnce();

    await learner.learnOnce();

    const tools = learner.store.loadTools();
    expect(tools.length).toBeGreaterThanOrEqual(1);
    const learned = tools.find((t) => t.signature === "search_files>read_file");
    expect(learned).toBeDefined();
    expect(learned!.steps.map((s) => s.tool)).toEqual(["search_files", "read_file"]);
    // Auto-registered on the live registry.
    expect(registry.has(learned!.name)).toBe(true);

    // Status reflects it.
    const status = await learner.getStatus();
    expect(status.learnedTools).toBeGreaterThanOrEqual(1);
    expect(status.recentTools.some((t) => t.name === learned!.name)).toBe(true);
  });

  it("does not duplicate tools across passes", async () => {
    const registry = fakeRegistry();
    const learner = new Learner({
      learnDir: dir,
      registry,
      config: CONFIG,
      logger: { debug: () => {}, info: () => {} },
      cwd: "/proj",
    });
    await learner.store.appendEpisode(makeEpisode(["search_files", "read_file"], dayN(1)));
    await learner.store.appendEpisode(makeEpisode(["search_files", "read_file"], dayN(0)));

    await learner.learnOnce();
    const count1 = learner.store.loadTools().length;

    await learner.learnOnce();
    const count2 = learner.store.loadTools().length;

    expect(count1).toBe(count2);
    expect(count1).toBeGreaterThanOrEqual(1);
  });

  it("reloads saved tools on a fresh instance (persistence across sessions)", async () => {
    const registry = fakeRegistry();
    const learner = new Learner({
      learnDir: dir,
      registry,
      config: CONFIG,
      logger: { debug: () => {}, info: () => {} },
      cwd: "/proj",
    });
    await learner.store.appendEpisode(makeEpisode(["git_status", "read_file"], dayN(1)));
    await learner.store.appendEpisode(makeEpisode(["git_status", "read_file"], dayN(0)));
    await learner.learnOnce();
    const saved = learner.store.loadTools();
    expect(saved.length).toBeGreaterThanOrEqual(1);

    // New process: fresh registry + fresh learner on same dir.
    const registry2 = fakeRegistry();
    const learner2 = new Learner({
      learnDir: dir,
      registry: registry2,
      config: CONFIG,
      logger: { debug: () => {}, info: () => {} },
      cwd: "/proj",
    });
    expect(registry2.has(saved[0]!.name)).toBe(true);
  });

  it("respects disabled config", async () => {
    const registry = fakeRegistry();
    const learner = new Learner({
      learnDir: dir,
      registry,
      config: { ...CONFIG, enabled: false },
      logger: { debug: () => {}, info: () => {} },
      cwd: "/proj",
    });
    const { bus, emit } = fakeBus();
    learner.attach(bus);
    emit({ type: "message:start", timestamp: 1 });
    emit({ type: "done", timestamp: 2, meta: { prompt: "x" } });
    await learner.learnOnce();
    expect(learner.store.loadTools().length).toBe(0);
  });
});
