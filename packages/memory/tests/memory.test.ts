import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryManager } from "../src/index";
import { newId, newSessionId } from "@dikabuff/shared";

let dir: string;
let memory: MemoryManager;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "dikabuff-memory-"));
  memory = new MemoryManager({
    memoryDir: path.join(dir, "memory"),
    sessionsDir: path.join(dir, "sessions"),
    provider: "json",
    vector: true,
  });
});

describe("MemoryManager", () => {
  it("stores and recalls short-term messages", async () => {
    const sessionId = newSessionId();
    await memory.appendMessage(sessionId, { id: newId(), role: "user", content: "hello", createdAt: Date.now() });
    await memory.appendMessage(sessionId, { id: newId(), role: "assistant", content: "hi", createdAt: Date.now() });
    const msgs = await memory.getMessages(sessionId);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.content).toBe("hi");
    await memory.clearSession(sessionId);
    expect(await memory.getMessages(sessionId)).toHaveLength(0);
  });

  it("namespaces long-term knowledge per key", async () => {
    await memory.remember("project.abc.owner", "dika");
    expect(await memory.recall("project.abc.owner")).toBe("dika");
    await memory.forget("project.abc.owner");
    expect(await memory.recall("project.abc.owner")).toBeUndefined();
  });

  it("builds a vector index over project notes", async () => {
    await memory.rememberProjectNote("proj1", "The auth middleware uses JWT with RSA");
    await memory.rememberProjectNote("proj1", "Database is PostgreSQL via Prisma");
    const results = await memory.semanticSearch("jwt authentication middleware", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.text).toContain("auth middleware");
    await memory.rememberProjectNote("proj2", "different project note about css");
    const narrowed = await memory.semanticSearch("jwt", 5);
    expect(narrowed[0]!.text).toContain("auth");
  });
});