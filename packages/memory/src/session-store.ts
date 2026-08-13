import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { safeStringify } from "@dikabuff/shared";
import type { MessageRecord, SessionRecord, SessionStore } from "./store";

/**
 * File-per-directory session storage:
 *   sessions/
 *     <id>.json          — session metadata
 *     <id>.messages.json — message history
 */
export class FileSessionStore implements SessionStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private metaFile(id: string) {
    return path.join(this.dir, `${id}.json`);
  }
  private messagesFile(id: string) {
    return path.join(this.dir, `${id}.messages.json`);
  }

  async upsert(session: SessionRecord): Promise<void> {
    writeFileSync(this.metaFile(session.id), safeStringify(session), "utf8");
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    try {
      return JSON.parse(readFileSync(this.metaFile(id), "utf8")) as SessionRecord;
    } catch {
      return undefined;
    }
  }

  async list(limit = 50): Promise<SessionRecord[]> {
    const out: SessionRecord[] = [];
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.includes(".messages.")) continue;
      const session = await this.get(entry.name.replace(/\.json$/, ""));
      if (session) out.push(session);
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out.slice(0, limit);
  }

  async remove(id: string): Promise<void> {
    rmSync(this.metaFile(id), { force: true });
    rmSync(this.messagesFile(id), { force: true });
    rmSync(path.join(this.dir, `${id}.messages.json`), { force: true });
  }

  async appendMessage(sessionId: string, message: MessageRecord): Promise<void> {
    const all = await this.getMessages(sessionId);
    all.push(message);
    writeFileSync(this.messagesFile(sessionId), safeStringify(all), "utf8");
  }

  async getMessages(sessionId: string): Promise<MessageRecord[]> {
    const file = this.messagesFile(sessionId);
    if (!existsSync(file)) return [];
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      return Array.isArray(raw) ? (raw as MessageRecord[]) : [];
    } catch {
      return [];
    }
  }

  async clearMessages(sessionId: string): Promise<void> {
    writeFileSync(this.messagesFile(sessionId), "[]", "utf8");
  }

  async listMessages(sessionId: string, limit = 200): Promise<MessageRecord[]> {
    const all = await this.getMessages(sessionId);
    return all.slice(-limit);
  }
}