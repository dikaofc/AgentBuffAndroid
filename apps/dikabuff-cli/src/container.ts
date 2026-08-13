import path from "node:path";
import { ConfigManager } from "@dikabuff/config";
import type { ModelPreset } from "@dikabuff/config";
import { MemoryManager } from "@dikabuff/memory";
import { ToolRegistry, registerBuiltinTools } from "@dikabuff/tools";
import { Agent, AgentEvents, createProvider } from "@dikabuff/agent-core";
import { Learner } from "@dikabuff/learner";
import { loadAllPlugins } from "@dikabuff/plugins";
import { launchApp, UiStore } from "@dikabuff/terminal-ui";
import type { RuntimeAdapter, StatusInfo, UiMessage, SessionListEntry, UsageInfo } from "@dikabuff/terminal-ui";
import { configureGlobalLogger } from "@dikabuff/shared";
import type { AgentMode, PermissionRequest, SessionInfo } from "@dikabuff/shared";
import type { CliContext } from "@dikabuff/cli";

export interface ContainerOptions {
  cwd?: string;
  homeDir?: string;
  /** Legacy single-file provider config (project config.json) — discovered automatically when omitted. */
  legacyPath?: string;
}

/**
 * Dependency-injection container (wiring only — no business logic).
 * Order: config → logging → memory → tools → plugins → provider → agent → UI.
 */
export class Container implements CliContext {
  readonly config: ConfigManager;
  readonly memory: MemoryManager;
  readonly registry = new ToolRegistry();
  readonly learner: Learner;
  readonly cwd: string;
  readonly logger: { info(m: string): void; error(m: string): void; debug(m: string): void; warn(m: string): void };

  private interactive: InteractiveSession | null = null;

  constructor(cwd: string, homeDir?: string, legacyPath?: string) {
    this.cwd = cwd;
    this.config = new ConfigManager(homeDir, legacyPath);
    this.config.init();

    const debug = process.env.DIKABUFF_DEBUG === "1";
    configureGlobalLogger({
      level: this.config.get().logging.level,
      debug: debug || this.config.get().debug,
      file: this.config.get().logging.file,
      homeDir: this.config.paths.configDir,
    });
    this.logger = {
      info: (m) => process.stderr.write(m + "\n"),
      error: (m) => process.stderr.write(m + "\n"),
      debug: (m) => debug && process.stderr.write(m + "\n"),
      warn: (m) => process.stderr.write(m + "\n"),
    };

    this.memory = new MemoryManager({
      memoryDir: this.config.paths.memoryDir,
      sessionsDir: this.config.paths.sessionsDir,
      provider: this.config.get().memory.provider,
      vector: this.config.get().memory.vector,
    });

    registerBuiltinTools(this.registry);

    // Auto-learning: loads tools learned in previous sessions, then runs a
    // learning pass (daily stats + pattern detection + auto-create/save) on
    // every start — fire-and-forget so startup stays instant.
    this.learner = new Learner({
      learnDir: path.join(this.config.paths.configDir, "learn"),
      registry: this.registry,
      config: this.config.get().learn ?? {
        enabled: true,
        minPatternHits: 2,
        maxSteps: 3,
        maxTools: 20,
        maxEpisodesPerDay: 200,
      },
      logger: {
        debug: (m) => this.logger.debug(m),
        info: (m) => this.logger.info(m),
      },
      cwd,
    });
    void this.learner.learnOnce().catch(() => {});

    void this.loadPlugins();
  }

  get presets(): ModelPreset[] {
    return this.config.getModelPresets();
  }

  getProvider(): ReturnType<typeof createProvider> {
    return createProvider(this.config.get(), this.presets);
  }

  sessions(): Promise<SessionListEntry[]> {
    return this.memory.sessions.list(20).then((records) =>
      records.map((r) => ({
        id: r.id,
        title: r.title,
        cwd: r.cwd,
        model: r.model,
        mode: r.mode as AgentMode,
        updatedAt: r.updatedAt,
        messageCount: r.messageCount,
      })),
    );
  }

  updateSelf(_channel?: string): Promise<string> {
    return Promise.resolve(
      "Use your package manager: npm install -g dikabuff@latest (self-update plumbing is wired via `dikabuff update`).",
    );
  }

  /* ------------------------------ plugins ------------------------------ */

  private async loadPlugins(): Promise<void> {
    const names = this.config.get().plugins;
    if (names.length === 0) return;
    const results = await loadAllPlugins(this.config.paths.pluginsDir, names);
    let added = 0;
    for (const result of results) {
      if ("plugin" in result) {
        for (const tool of result.plugin.tools ?? []) {
          try {
            this.registry.register(tool);
            added++;
          } catch (err) {
            this.logger.error(`plugin ${result.plugin.manifest.name}: ${(err as Error).message}`);
          }
        }
      } else {
        this.logger.error(`plugin ${result.name}: ${result.error}`);
      }
    }
    if (added > 0) this.logger.debug(`registered ${added} plugin tool(s)`);
  }

  /* ---------------------------- interactive ---------------------------- */

  async launchInteractive(opts?: { message?: string; yes?: boolean }): Promise<number> {
    if (opts?.message) {
      // One-shot: reuse the headless runner, then print the answer.
      const { runAgentTurn } = await import("@dikabuff/cli");
      const { answer } = await runAgentTurn(this, { prompt: opts.message, yes: opts.yes, headless: true });
      process.stdout.write("\n" + answer + "\n");
      return 0;
    }
    if (!process.stdin.isTTY) {
      // The Ink UI needs a real terminal (raw mode). Degrade gracefully when piped.
      process.stderr.write(
        "(interactive mode requires a TTY — pipe a message instead, e.g. `dikabuff chat \"your request\"`)\n",
      );
      return 1;
    }
    return this.runInteractiveApp();
  }

  private runInteractiveApp(): number {
    const session = this.interactive ?? new InteractiveSession(this);
    this.interactive = session;

    const runtime: RuntimeAdapter = {
      getStatus: () => session.store.getStatus(),
      getState: () => session.store.getState(),
      subscribe: (cb) => session.store.subscribe(cb),
      submit: (prompt) => session.submit(prompt, this),
      respondPermission: (granted) => session.respond(granted),
      respondAsk: (answer) => session.respondAsk(answer),
      runReview: () => session.runReview(this),
      requestDiff: () => session.requestDiff(this),
      cycleModel: () => session.cycleModel(this),
      setModel: (id) => session.setModel(id, this),
      toggleSidebar: () => session.store.setSidebar(!session.store.getState().sidebarOpen),
      switchMode: (mode) => session.switchMode(mode, this),
      resumeSession: (id) => session.resume(id, this),
      newSession: () => session.newSession(this),
      clearConversation: () => session.clearConversation(this),
      compactConversation: () => session.compactConversation(this),
      getUsage: () => session.getUsage(this),
      setTheme: (theme) => session.setTheme(theme, this),
      setPermissionMode: (mode) => session.setPermissionMode(mode, this),
      getStatusInfo: () => session.getStatusInfo(this),
      getMemoryNotes: () => session.getMemoryNotes(this),
      getDoctorInfo: () => session.getDoctorInfo(this),
      getLearnInfo: () => session.getLearnInfo(this),
      sessions: () => this.sessions(),
      quit: () => process.stdout.write(""),
    };

    launchApp({
      runtime,
      models: this.presets.map((m) => ({ id: m.id, label: m.label })),
      status: {
        model: session.agent.session.model,
        mode: session.agent.session.mode,
        theme: this.config.get().theme,
        cwd: this.cwd,
        sessionTitle: session.agent.session.title,
        sessionId: session.agent.session.id,
        permissionMode: this.config.get().permissionMode,
        mock: this.config.get().provider === "mock",
        noApiKey: this.config.get().provider !== "mock" && !this.config.get().apiKey,
      },
      onExit: () => (this.interactive = null),
    });
    return 0;
  }
}

/** Build the container for the current working directory. */
export function createContainer(opts: ContainerOptions = {}): Container {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  return new Container(cwd, opts.homeDir, opts.legacyPath);
}

/* --------------------------- interactive glue -------------------------- */

class InteractiveSession {
  readonly store: UiStore;
  readonly events = new AgentEvents();
  agent: Agent;
  encoding: { resolve: (granted: boolean) => void } | null = null;

  constructor(host: Container, session?: SessionInfo) {
    this.store = new UiStore(this.events, hostStatus(host, session));
    this.agent = this.makeAgent(host, session);
    // Every run in this session feeds the learner (episode recording).
    host.learner.attach(this.events);
  }

  private makeAgent(host: Container, session?: SessionInfo): Agent {
    const preset = host.presets.find((p) => p.id === host.config.get().model);
    return new Agent(
      {
        provider: host.getProvider(),
        registry: host.registry,
        memory: host.memory,
        config: host.config.get(),
        cwd: host.cwd,
        events: this.events,
        logger: host.logger,
        consent: (req) => this.askConsent(req),
        askUser: (prompt, options) => this.askUser(prompt, options),
        sessionStore: host.memory.sessions,
        streamMode: "replay",
        modelCost: preset ? { costPer1MInput: preset.costPer1MInput, costPer1MOutput: preset.costPer1MOutput } : undefined,
      },
      session,
    );
  }

  private askConsent(_req: PermissionRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 90_000);
      this.encoding = {
        resolve: (granted) => {
          clearTimeout(timer);
          resolve(granted);
        },
      };
    });
  }

  respond(granted: boolean): void {
    if (this.encoding) {
      this.encoding.resolve(granted);
      this.encoding = null;
    }
  }

  /* --------------------------- ask user ------------------------------ */

  private askEncoding: { prompt: string; resolve: (answer: string | null) => void } | null = null;

  /** Agent → UI free-text question (ask_user tool). Resolves when the user answers or rejects. */
  private askUser(prompt: string, options?: { timeoutMs?: number }): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.askEncoding?.prompt === prompt) {
          this.askEncoding = null;
          this.store.clearAsk();
          resolve(null);
        }
      }, options?.timeoutMs ?? 180_000);
      this.askEncoding = {
        prompt,
        resolve: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
      };
      this.store.setAsk(prompt);
    });
  }

  /** UI → agent: deliver the typed answer (null = rejected). */
  respondAsk(answer: string | null): void {
    if (this.askEncoding) {
      const resolve = this.askEncoding.resolve;
      this.askEncoding = null;
      this.store.clearAsk();
      resolve(answer);
    }
  }

  /** `/review` — run a code review of the working tree in this session. */
  async runReview(host: Container): Promise<void> {
    const { runAgentTurn } = await import("@dikabuff/cli");
    try {
      const { answer } = await runAgentTurn(host, {
        prompt: "Review the current working tree changes. Report bugs, security concerns, style issues, and missing tests with severity tags.",
        mode: "review",
        headless: true,
      });
      this.store.addAssistantText(`## Code review\n\n${answer}`);
    } catch (err) {
      this.store.applyError((err as Error).message);
    }
  }

  async requestDiff(host: Container): Promise<void> {
    const req = this.store.getState().permission;
    const tool = host.registry.get("git_diff");
    if (!tool) return;
    const result = await tool.run(
      { path: req?.args.path ? String(req.args.path) : undefined },
      {
        cwd: host.cwd,
        sessionId: this.agent.session.id,
        mode: this.agent.session.mode,
        memory: host.memory,
        environment: process.env as Record<string, string>,
        log: host.logger,
        emit: () => {},
        ask: async () => null,
      },
    );
    this.store.setDiff(req?.args.path ? String(req.args.path) : "working tree", result.output ?? result.error ?? "no diff");
  }

  async submit(prompt: string, host: Container): Promise<void> {
    this.store.addUserMessage(prompt);
    try {
      await this.agent.run(prompt);
    } catch (err) {
      this.store.applyError((err as Error).message);
    }
  }

  async cycleModel(host: Container): Promise<void> {
    const presets = host.presets;
    const current = host.config.get().model;
    const idx = presets.findIndex((p) => p.id === current);
    const next = presets[(idx + 1) % presets.length] ?? presets[0];
    if (!next) return;
    host.config.setByPath("model", next.id);
    host.config.setByPath("provider", next.provider);
    this.agent = this.makeAgent(host, this.agent.session);
    this.store.setStatus({ model: next.id });
  }

  async setModel(id: string, host: Container): Promise<void> {
    const presets = host.presets;
    const next = presets.find((p) => p.id === id);
    if (!next) return;
    host.config.setByPath("model", next.id);
    host.config.setByPath("provider", next.provider);
    this.agent = this.makeAgent(host, this.agent.session);
    this.store.setStatus({ model: next.id });
  }

  async switchMode(mode: AgentMode, host: Container): Promise<void> {
    host.config.setByPath("mode", mode);
    this.agent.session.mode = mode;
    this.store.setStatus({ mode });
  }

  async clearConversation(host: Container): Promise<void> {
    await host.memory.clearSession(this.agent.session.id);
    this.store.setMessages([]);
  }

  async compactConversation(host: Container): Promise<void> {
    await this.agent.compact();
    const messages = await host.memory.getMessages(this.agent.session.id);
    this.store.setMessages(
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, streaming: false, createdAt: m.createdAt })),
    );
  }

  async getUsage(host: Container): Promise<UsageInfo> {
    const usage = this.agent.getUsage();
    return { ...usage, model: this.agent.session.model };
  }

  async setTheme(theme: string, host: Container): Promise<void> {
    host.config.setByPath("theme", theme);
    this.store.setStatus({ theme });
  }

  async setPermissionMode(mode: string, host: Container): Promise<void> {
    host.config.setByPath("permissionMode", mode);
    this.store.setStatus({ permissionMode: mode });
  }

  async getStatusInfo(host: Container): Promise<string> {
    const s = this.agent.session;
    const cfg = host.config.get();
    const usage = this.agent.getUsage();
    return `session ${s.id.slice(0, 8)} · ${s.title || "untitled"} · model ${s.model} · mode ${s.mode} · permissions ${cfg.permissionMode} · theme ${cfg.theme} · tokens ${usage.totalTokens.toLocaleString()} · ${s.status}`;
  }

  async getMemoryNotes(host: Container): Promise<string> {
    const projectKey = `project.${hashString(host.cwd)}`;
    const notes = await host.memory.projectNotes(projectKey);
    if (!notes.length) return "";
    return notes
      .slice(-5)
      .map((n) => `• ${n.text.slice(0, 120)}`)
      .join("\n");
  }

  async getDoctorInfo(host: Container): Promise<string> {
    const cfg = host.config.get();
    const provider = cfg.provider === "mock" ? "mock (offline demo)" : `${cfg.provider} / ${cfg.model}${cfg.baseUrl ? ` @ ${cfg.baseUrl}` : ""}${cfg.apiKey ? " (key set)" : " (no key)"}`;
    return `config: ${host.config.paths.configDir} · provider: ${provider} · memory: ${cfg.memory.provider} · theme: ${cfg.theme} · permissions: ${cfg.permissionMode} · mode: ${cfg.mode}`;
  }

  async getLearnInfo(host: Container): Promise<string> {
    const status = await host.learner.getStatus();
    if (!status.enabled) return "learning is disabled (set learn.enabled=true to enable)";
    const lines = [
      `learning: on · episodes today ${status.episodesToday} · total ${status.episodesTotal} · learned tools ${status.learnedTools} · patterns pending ${status.patternsPending}`,
    ];
    if (status.recentTools.length > 0) {
      lines.push("recent learned tools:");
      for (const t of status.recentTools) {
        lines.push(`  • ${t.name} — ${t.steps.map((s) => s.tool).join(" → ")} (${t.hits}×)`);
      }
    }
    if (status.lastLearnAt) lines.push(`last learn pass: ${new Date(status.lastLearnAt).toLocaleTimeString()}`);
    return lines.join("\n");
  }

  async resume(id: string, host: Container): Promise<void> {
    const record = await host.memory.sessions.get(id);
    if (!record) return;
    const messages = await host.memory.getMessages(id);
    const uiMessages: UiMessage[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, streaming: false, createdAt: m.createdAt }));
    const session: SessionInfo = {
      id: record.id,
      title: record.title,
      cwd: record.cwd,
      projectPath: record.cwd,
      model: record.model,
      mode: record.mode as AgentMode,
      status: "active",
      startedAt: record.startedAt,
      updatedAt: Date.now(),
      messageCount: record.messageCount,
      tokenCount: 0,
    };
    this.agent = this.makeAgent(host, session);
    this.store.setMessages(uiMessages);
    this.store.setStatus({ model: record.model, mode: session.mode, sessionId: session.id, sessionTitle: session.title });
  }

  async newSession(host: Container): Promise<void> {
    this.agent = this.makeAgent(host, undefined);
    this.store.reset();
    this.store.setStatus({ sessionId: this.agent.session.id, sessionTitle: this.agent.session.title });
  }
}

function hostStatus(host: Container, session?: SessionInfo): StatusInfo {
  return {
    model: session?.model ?? host.config.get().model,
    mode: session?.mode ?? host.config.get().mode,
    theme: host.config.get().theme,
    cwd: host.cwd,
    sessionTitle: session?.title ?? "",
    sessionId: session?.id,
    permissionMode: host.config.get().permissionMode,
    mock: host.config.get().provider === "mock",
    noApiKey: host.config.get().provider !== "mock" && !host.config.get().apiKey,
  };
}

/** Stable short hash for project memory keys (dependency-free). */
function hashString(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}