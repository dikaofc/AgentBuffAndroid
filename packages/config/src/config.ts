import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DikaConfig, ModelPreset, ProviderKind } from "@dikabuff/shared";
import { CONFIG_DIR, VERSION } from "@dikabuff/shared";
import { defaultConfig, DEFAULT_GATEWAY_URL, DEFAULT_MODELS, maskSecrets } from "./defaults";

export interface ConfigPaths {
  homeDir: string;
  configDir: string;
  configFile: string;
  modelsFile: string;
  memoryDir: string;
  sessionsDir: string;
  logsDir: string;
  pluginsDir: string;
}

export function resolveHome(): string {
  return process.env.DIKABUFF_HOME ?? path.join(os.homedir(), CONFIG_DIR);
}

export function resolvePaths(homeDir = resolveHome()): ConfigPaths {
  return {
    homeDir,
    configDir: homeDir,
    configFile: path.join(homeDir, "config.json"),
    modelsFile: path.join(homeDir, "models.json"),
    memoryDir: path.join(homeDir, "memory"),
    sessionsDir: path.join(homeDir, "sessions"),
    logsDir: path.join(homeDir, "logs"),
    pluginsDir: path.join(homeDir, "plugins"),
  };
}

/**
 * Legacy compatibility: the v0.2 single-file CLI used a `config.json` in the
 * project dir with shape `{ providers: { ollama: { baseUrl, apiKey, models } } }`.
 * We absorb it so existing users keep working with the new architecture.
 */
export interface LegacyProviderConfig {
  providers?: Record<string, { baseUrl?: string; apiKey?: string; models?: Array<{ id?: string }> }>;
}

export function absorbLegacyConfig(legacyPath: string, config: DikaConfig): { changed: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!existsSync(legacyPath)) return { changed: false, notes };
  try {
    const raw = JSON.parse(readFileSync(legacyPath, "utf8")) as LegacyProviderConfig;
    const provider = raw.providers?.["ollama"] ?? raw.providers?.["openai"];
    if (provider) {
      // The pre-configured gateway default counts as "not set" so a legacy
      // config with its own gateway still wins the migration.
      if (provider.baseUrl && (!config.baseUrl || config.baseUrl === DEFAULT_GATEWAY_URL)) {
        config.baseUrl = provider.baseUrl;
        notes.push(`Adopted legacy baseUrl ${provider.baseUrl}`);
      }
      if (provider.apiKey && !config.apiKey) {
        config.apiKey = provider.apiKey;
        notes.push("Adopted legacy apiKey");
      }
      const models = provider.models?.map((m) => m.id).filter(Boolean);
      if (models?.length && models[0] !== config.model) {
        config.model = models[0]!;
        config.provider = "ollama";
        notes.push(`Adopted legacy model ${models[0]}`);
      }
      config.legacy = { configPath: legacyPath };
      return { changed: true, notes };
    }
  } catch (err) {
    notes.push(`Legacy config unreadable: ${(err as Error).message}`);
  }
  return { changed: false, notes };
}

export class ConfigManager {
  readonly paths: ConfigPaths;
  private config: DikaConfig;
  private models: ModelPreset[];
  private legacyPath: string | null;

  constructor(homeDir?: string, legacyPath?: string) {
    this.paths = resolvePaths(homeDir);
    this.legacyPath = legacyPath ?? null;
    mkdirSync(this.paths.configDir, { recursive: true });
    this.config = this.load();
    this.models = this.loadModels();
  }

  get(): DikaConfig {
    return this.config;
  }

  getModelPresets(): ModelPreset[] {
    return this.models;
  }

  getThemeId(): string {
    return this.config.theme;
  }

  reload(): DikaConfig {
    return this.load(true);
  }

  private load(force = false): DikaConfig {
    if (!force && this.config) {
      // already loaded from constructor helper path — load() may be called once
      // by `load()` below; keep a guard to avoid double reads.
    }
    const base = defaultConfig(VERSION);
    let merged = base;
    if (existsSync(this.paths.configFile)) {
      try {
        const raw = JSON.parse(readFileSync(this.paths.configFile, "utf8")) as Partial<DikaConfig>;
        merged = deepMerge(base, raw) as DikaConfig;
        // Legacy absorption is a first-run migration ONLY: if the user has
        // explicitly configured a provider/model, their file always wins.
        if (raw.provider === undefined && raw.model === undefined) {
          const candidate = this.legacyPath ?? path.join(process.cwd(), "config.json");
          if (candidate !== this.paths.configFile && existsSync(candidate)) {
            const { notes } = absorbLegacyConfig(candidate, merged);
            for (const note of notes) process.stderr.write(`[config] ${note}\n`);
          }
        }
      } catch (err) {
        process.stderr.write(`[config] corrupt config.json — using defaults (${(err as Error).message})\n`);
      }
    }
    return merged;
  }

  save(): void {
    mkdirSync(this.paths.configDir, { recursive: true });
    writeFileSync(this.paths.configFile, JSON.stringify(this.config, null, 2) + "\n", "utf8");
  }

  /** Initialize the home directory with a fresh config file (idempotent). */
  init(): { created: boolean; dirs: string[] } {
    const dirs = [
      this.paths.configDir,
      this.paths.memoryDir,
      this.paths.sessionsDir,
      this.paths.logsDir,
      this.paths.pluginsDir,
      path.join(this.paths.memoryDir, "json"),
    ];
    for (const dir of dirs) mkdirSync(dir, { recursive: true });
    let created = false;
    if (!existsSync(this.paths.configFile)) {
      this.save();
      created = true;
    }
    if (!existsSync(this.paths.modelsFile)) {
      writeFileSync(this.paths.modelsFile, JSON.stringify(DEFAULT_MODELS, null, 2) + "\n", "utf8");
    }
    return { created, dirs };
  }

  setByPath(dotPath: string, rawValue: string): string {
    const value = coerce(rawValue);
    const keys = dotPath.split(".");
    let target: Record<string, unknown> = this.config as unknown as Record<string, unknown>;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      const next = target[key];
      if (next === undefined || next === null || typeof next !== "object") {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }
    target[keys[keys.length - 1]!] = value;
    this.save();
    return dotPath;
  }

  getByPath(dotPath: string, masked = true): unknown {
    let value: unknown = this.config;
    for (const key of dotPath.split(".")) {
      if (value && typeof value === "object") value = (value as Record<string, unknown>)[key];
      else return undefined;
    }
    return masked ? maskSecrets(value) : value;
  }

  list(): Record<string, unknown> {
    return maskSecrets(this.config) as Record<string, unknown>;
  }

  /** Full list of preset models, merged with any legacy gateway models. */
  private loadModels(): ModelPreset[] {
    const presets = [...DEFAULT_MODELS];
    if (existsSync(this.paths.modelsFile)) {
      try {
        const raw = JSON.parse(readFileSync(this.paths.modelsFile, "utf8")) as ModelPreset[];
        if (Array.isArray(raw)) presets.push(...raw);
      } catch {
        /* ignore */
      }
    }
    // Dedupe by id (later wins on baseUrl field only).
    const byId = new Map<string, ModelPreset>();
    for (const preset of presets) {
      const existing = byId.get(preset.id);
      if (existing) {
        byId.set(preset.id, { ...existing, ...preset, baseUrl: preset.baseUrl ?? existing.baseUrl });
      } else {
        byId.set(preset.id, preset);
      }
    }
    return [...byId.values()];
  }

  addModel(preset: ModelPreset): void {
    const current = this.models.filter((m) => m.id !== preset.id);
    current.push(preset);
    this.models = current;
    mkdirSync(this.paths.configDir, { recursive: true });
    writeFileSync(this.paths.modelsFile, JSON.stringify(this.models, null, 2) + "\n", "utf8");
  }

  removeModel(id: string): boolean {
    const before = this.models.length;
    this.models = this.models.filter((m) => m.id !== id);
    if (this.models.length === before) return false;
    writeFileSync(this.paths.modelsFile, JSON.stringify(this.models, null, 2) + "\n", "utf8");
    return true;
  }

  /** Copy the legacy single-file CLI into examples/ for reference. */
  static archiveLegacyScript(source: string, target: string): void {
    if (existsSync(source)) copyFileSync(source, target);
  }
}

function deepMerge<T>(base: T, override: Record<string, unknown>): T {
  if (Array.isArray(base) || Array.isArray(override)) {
    return (override ?? base) as T;
  }
  if (base && typeof base === "object" && override && typeof override === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override)) {
      const baseValue = (base as Record<string, unknown>)[key];
      out[key] =
        baseValue && typeof baseValue === "object" && value && typeof value === "object" && !Array.isArray(value)
          ? deepMerge(baseValue, value as Record<string, unknown>)
          : value;
    }
    return out as T;
  }
  return (override as T) ?? base;
}

function coerce(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      return JSON.parse(raw);
    } catch { /* keep string */ }
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch { /* keep string */ }
  }
  if (/^[A-Za-z0-9_.:\/-]+$/.test(raw) && !raw.includes(" ")) return raw; // keep ids/paths unquoted
  return raw;
}

export type { ProviderKind };