import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ansi, type AnsiColor } from "./ansi";
import type { LogEntry, LoggerLike, LogLevel } from "./types";

const SCOPE_COLORS: Record<string, AnsiColor> = {
  config: "cyan",
  memory: "magenta",
  tools: "blue",
  agent: "yellow",
  ui: "cyan",
  provider: "blue",
  plugins: "magenta",
  cli: "green",
  system: "gray",
};

/**
 * Structured logger. Writes ANSI-styled lines to stderr (never stdout, so
 * stdout stays clean for piped data) and optionally appends JSON lines to a
 * rotating log file under ~/.dikabuff/logs/dikabuff.log.
 */
export class Logger implements LoggerLike {
  readonly level: LogLevel;
  readonly scope: string;
  readonly filePath: string | null;

  constructor(opts: { level?: LogLevel; scope?: string; filePath?: string | null } = {}) {
    this.level = opts.level ?? "info";
    this.scope = opts.scope ?? "system";
    this.filePath = opts.filePath ?? null;
  }

  child(scope: string): Logger {
    return new Logger({ level: this.level, scope, filePath: this.filePath });
  }

  debug(message: string, data?: unknown): void {
    this.write("debug", message, data);
  }
  info(message: string, data?: unknown): void {
    this.write("info", message, data);
  }
  warn(message: string, data?: unknown): void {
    this.write("warn", message, data);
  }
  error(message: string, data?: unknown): void {
    this.write("error", message, data);
  }

  private write(level: Exclude<LogLevel, "silent">, message: string, data?: unknown): void {
    const rank: Record<Exclude<LogLevel, "silent">, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    if (this.level === "silent" || rank[level] < rank[this.level]) return;

    const entry: LogEntry = { level, message, timestamp: Date.now(), scope: this.scope, data };
    if (this.filePath) this.appendToFile(entry);
    if (level === "debug" && this.level !== "debug") return;

    const ts = ansi.paint(new Date(entry.timestamp).toISOString().slice(11, 23), "gray");
    const scopeColor = SCOPE_COLORS[this.scope] ?? "white";
    const levelColor: AnsiColor = level === "error" ? "red" : level === "warn" ? "yellow" : "dim";
    const line = `${ts} ${ansi.paint(`[${level.toUpperCase()}]`, levelColor)} ${ansi.paint(
      `[${this.scope}]`,
      scopeColor,
    )} ${message}`;
    process.stderr.write(line + "\n");
    if (data !== undefined && this.level === "debug") {
      process.stderr.write("  " + safeStringify(data).slice(0, 2000) + "\n");
    }
  }

  private appendToFile(entry: LogEntry): void {
    try {
      if (!this.filePath) return;
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      /* never let logging break the app */
    }
  }
}

export function safeStringify(value: unknown, space?: number): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v), space) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Shared global logger instance (after configure() is called). */
let globalLogger: Logger = new Logger({ level: "info" });

export function configureGlobalLogger(opts: { level?: LogLevel; debug?: boolean; file?: boolean; homeDir?: string }): Logger {
  const level: LogLevel = opts.debug ? "debug" : (opts.level ?? "info");
  const filePath = opts.file
    ? path.join(opts.homeDir ?? process.env.HOME ?? process.cwd(), "logs", "dikabuff.log")
    : null;
  globalLogger = new Logger({ level, scope: "system", filePath });
  return globalLogger;
}

export function getLogger(): Logger {
  return globalLogger;
}