import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ToolRegistry, registerBuiltinTools } from "../src/index";
import type { ToolContext } from "@dikabuff/shared";

let dir: string;
let ctx: ToolContext;

function makeCtx(cwd: string): ToolContext {
  return {
    cwd,
    sessionId: "test",
    mode: "code",
    memory: {
      getMessages: async () => [],
      appendMessage: async () => {},
      clearSession: async () => {},
      remember: async () => {},
      recall: async () => undefined,
      forget: async () => {},
      search: async () => [],
    },
    environment: {},
    log: { debug() {}, info() {}, warn() {}, error() {} },
    emit: () => {},
    ask: async () => "y",
  };
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "dikabuff-tools-"));
  ctx = makeCtx(dir);
});

describe("builtin tools", () => {
  it("read/write/edit file round-trip", async () => {
    const reg = new ToolRegistry();
    registerBuiltinTools(reg);
    const target = path.join(dir, "hello.txt");

    const written = await reg.execute("write_file", { path: target, content: "line1\nline2\nline3\n" }, ctx, { force: true });
    expect(written.ok).toBe(true);

    const read = await reg.execute("read_file", { path: "hello.txt" }, ctx, { force: true });
    expect(read.ok).toBe(true);
    expect(read.output).toContain("line2");

    const edited = await reg.execute("edit_file", { path: "hello.txt", oldText: "line2", newText: "LINE2" }, ctx, { force: true });
    expect(edited.ok).toBe(true);
    const reread = await reg.execute("read_file", { path: target }, ctx, { force: true });
    expect(reread.output).toContain("LINE2");
  });

  it("edit_file fails cleanly when oldText is missing", async () => {
    const reg = new ToolRegistry();
    registerBuiltinTools(reg);
    writeFileSync(path.join(dir, "a.txt"), "content");
    const res = await reg.execute("edit_file", { path: "a.txt", oldText: "nope", newText: "x" }, ctx, { force: true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("not found");
  });

  it("project_scan discovers files and package.json", async () => {
    const reg = new ToolRegistry();
    registerBuiltinTools(reg);
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "demo", dependencies: { a: "1.0.0" } }));
    writeFileSync(path.join(dir, "src", "index.ts"), "export const x = 1;");

    const res = await reg.execute("project_scan", {}, ctx, { force: true });
    expect(res.ok).toBe(true);
    expect((res.data as any).totalFiles).toBeGreaterThanOrEqual(2);
    expect(res.output).toContain("demo");
  });

  it("declines simulate permission denial when policy says deny", async () => {
    const reg = new ToolRegistry();
    registerBuiltinTools(reg);
    const withPolicy = ToolRegistry.withPolicy(ctx, {
      categories: { filesystem: "deny" },
      tools: {},
      autoApprove: [],
    });
    const res = await reg.execute("delete_file", { path: "nope.txt" }, withPolicy, { force: false });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Permission denied");
  });
});

describe("permission modes", () => {
  let reg: ToolRegistry;
  let target: string;

  beforeEach(() => {
    reg = new ToolRegistry();
    registerBuiltinTools(reg);
    target = path.join(dir, "perm.txt");
    writeFileSync(target, "content");
  });

  it("plan mode denies mutating filesystem tools", async () => {
    const withPolicy = ToolRegistry.withPolicy(ctx, { categories: {}, tools: {}, autoApprove: [] }, "plan");
    const res = await reg.execute("write_file", { path: target, content: "x" }, withPolicy, { force: false });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Permission denied");
  });

  it("plan mode still allows read tools", async () => {
    const withPolicy = ToolRegistry.withPolicy(ctx, { categories: {}, tools: {}, autoApprove: [] }, "plan");
    const res = await reg.execute("read_file", { path: target }, withPolicy, { force: false });
    expect(res.ok).toBe(true);
  });

  it("acceptEdits auto-approves file edits", async () => {
    const withPolicy = ToolRegistry.withPolicy(ctx, { categories: {}, tools: {}, autoApprove: [] }, "acceptEdits");
    const res = await reg.execute("edit_file", { path: target, oldText: "content", newText: "changed" }, withPolicy, { force: false });
    expect(res.ok).toBe(true);
  });

  it("bypassPermissions approves dangerous tools", async () => {
    const withPolicy = ToolRegistry.withPolicy(ctx, { categories: {}, tools: {}, autoApprove: [] }, "bypassPermissions");
    const res = await reg.execute("delete_file", { path: target }, withPolicy, { force: false });
    expect(res.ok).toBe(true);
  });

  it("default mode asks for sensitive tools (denied headless)", async () => {
    const withPolicy = ToolRegistry.withPolicy(ctx, { categories: {}, tools: {}, autoApprove: [] }, "default");
    const res = await reg.execute("write_file", { path: target, content: "x" }, withPolicy, { force: false });
    expect(res.ok).toBe(false);
  });
});