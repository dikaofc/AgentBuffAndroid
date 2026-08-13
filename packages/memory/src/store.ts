/** Storage contract. Swap implementations without touching callers. */

export interface KeyValueStore {
  read<T>(key: string): Promise<T | undefined>;
  write(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  search(prefix: string): Promise<Array<{ key: string; value: unknown }>>;
  keys(prefix?: string): Promise<string[]>;
}

export interface SessionRecord {
  id: string;
  title: string;
  cwd: string;
  projectPath: string;
  model: string;
  mode: string;
  status: string;
  startedAt: number;
  updatedAt: number;
  messageCount: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export interface MessageRecord {
  id: string;
  role: string;
  content: string;
  createdAt: number;
  toolCallId?: string;
  toolName?: string;
  tokenCount?: number;
}

export interface SessionStore {
  upsert(session: SessionRecord): Promise<void>;
  get(id: string): Promise<SessionRecord | undefined>;
  list(limit?: number): Promise<SessionRecord[]>;
  remove(id: string): Promise<void>;
  appendMessage(sessionId: string, message: MessageRecord): Promise<void>;
  getMessages(sessionId: string): Promise<MessageRecord[]>;
  clearMessages(sessionId: string): Promise<void>;
  listMessages(sessionId: string, limit?: number): Promise<MessageRecord[]>;
}