import path from "node:path";
import type { ChatMessage, MemoryGateway } from "@dikabuff/shared";
import type { MessageRecord, SessionStore } from "./store";
import { JsonStore } from "./json-store";
import { SqliteStore } from "./sqlite-store";
import { FileSessionStore } from "./session-store";
import { VectorIndex } from "./vector";

export interface MemoryOptions {
  memoryDir: string;
  sessionsDir: string;
  provider: "json" | "sqlite";
  vector: boolean;
}

/**
 * Central memory facade.
 *
 *  - Short-term: messages per session (MemoryGateway contract used by tools/agent)
 *  - Long-term:   key/value knowledge:
 *      * preferences.<key>        — user preferences
 *      * project.<projectHash>.*  — project knowledge, namespaced per project
 *      * session.<id>             — session summaries
 *  - Vector: optional similarity search over project knowledge notes.
 */
export class MemoryManager implements MemoryGateway {
  private kv: JsonStore | SqliteStore;
  private notes: JsonStore;
  private prefs: JsonStore;
  readonly sessions: SessionStore;
  private vectorIndex: VectorIndex | null = null;

  constructor(private readonly opts: MemoryOptions) {
    const jsonDir = path.join(opts.memoryDir, "json");
    this.kv =
      opts.provider === "sqlite"
        ? new SqliteStore(path.join(opts.memoryDir, "dikabuff.sqlite"))
        : new JsonStore(jsonDir, "kv");
    this.notes = new JsonStore(jsonDir, "notes");
    this.prefs = new JsonStore(jsonDir, "preferences");
    this.sessions = new FileSessionStore(opts.sessionsDir);
    if (opts.vector) this.vectorIndex = new VectorIndex(jsonDir);
  }

  /* ---------------------- short-term (per session) --------------------- */

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const records = await this.sessions.getMessages(sessionId);
    return records.map(toChatMessage);
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const record: MessageRecord = {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      tokenCount: message.tokenCount,
    };
    await this.sessions.appendMessage(sessionId, record);
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.sessions.clearMessages(sessionId);
  }

  /* ----------------------- long-term knowledge ------------------------- */

  async remember(key: string, value: unknown): Promise<void> {
    await this.kv.write(key, value);
  }

  async recall(key: string): Promise<unknown | undefined> {
    return this.kv.read(key);
  }

  async forget(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async search(prefix: string): Promise<Array<{ key: string; value: unknown }>> {
    return this.kv.search(prefix);
  }

  async rememberProjectNote(projectKey: string, note: string, meta?: Record<string, unknown>): Promise<void> {
    const notes = ((await this.notes.read<unknown[]>(projectKey)) ?? []) as unknown[];
    notes.push({ text: note, meta, at: Date.now() });
    await this.notes.write(projectKey, notes.slice(-200));
    await this.vectorIndex?.add(note, { projectKey, at: Date.now() });
  }

  async projectNotes(projectKey: string): Promise<Array<{ text: string; meta?: Record<string, unknown>; at: number }>> {
    return ((await this.notes.read(projectKey)) ?? []) as Array<{ text: string; meta?: Record<string, unknown>; at: number }>;
  }

  async setPreference(key: string, value: unknown): Promise<void> {
    await this.prefs.write(key, value);
  }

  async getPreference<T>(key: string): Promise<T | undefined> {
    return this.prefs.read<T>(key);
  }

  /** Vector similarity search across project notes (best-effort). */
  async semanticSearch(query: string, topK = 5): Promise<Array<{ text: string; score: number }>> {
    if (!this.vectorIndex) return [];
    return this.vectorIndex.query(query, topK);
  }
}

function toChatMessage(record: MessageRecord): ChatMessage {
  return {
    id: record.id,
    role: record.role as ChatMessage["role"],
    content: record.content,
    createdAt: record.createdAt,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    tokenCount: record.tokenCount,
  };
}