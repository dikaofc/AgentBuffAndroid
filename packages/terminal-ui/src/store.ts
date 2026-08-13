import type { AgentEvent } from "@dikabuff/shared";
import type { AgentEvents } from "@dikabuff/agent-core";
import { AppViewState, PermissionUi, StatusInfo, SubagentTaskUi, ToolEventUi, UiMessage, initialState } from "./types";

/**
 * UiStore bridges the agent event bus → React state.
 *
 * Design notes:
 *  - Streamed deltas are buffered and flushed every ~16ms so frames render as
 *    whole lines instead of spamming the terminal with tiny updates.
 *  - All transitions are immutable updates consumed via useSyncExternalStore.
 */
export class UiStore {
  private state: AppViewState = initialState();
  private listeners = new Set<() => void>();
  private deltaBuffer = "";
  private flushTimer: NodeJS.Timeout | null = null;
  private toolCounter = 0;
  private status: StatusInfo;

  /**
   * How often buffered stream deltas are flushed to React.
   * 16ms (60fps) is wasted on Termux — full-frame repaints tear/flicker.
   * ~14fps keeps streaming visually smooth without the screen flashing.
   */
  private static readonly STREAM_FLUSH_MS = 70;

  constructor(
    private readonly events: AgentEvents,
    status: StatusInfo,
  ) {
    this.status = status;
    events.onAny((ev) => this.handle(ev));
  }

  getState(): AppViewState {
    return this.state;
  }

  getStatus(): StatusInfo {
    return this.status;
  }

  setStatus(patch: Partial<StatusInfo>): void {
    this.status = { ...this.status, ...patch };
    this.notify();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  dispose(): void {
    this.flushNow();
  }

  /* ----------------------------- mutators ----------------------------- */

  setSidebar(open: boolean): void {
    this.update((s) => ({ ...s, sidebarOpen: open }));
  }

  applyError(error: string): void {
    this.update((s) => ({ ...s, phase: "error", error }));
  }

  /** Show the user's message immediately (before the agent streams). */
  addUserMessage(text: string): void {
    this.update((s) => ({
      ...s,
      phase: "thinking",
      showStartScreen: false,
      subagentTasks: [],
      messages: [
        ...s.messages.filter((m) => !m.streaming),
        { id: `msg_user_${Date.now()}`, role: "user", content: text, streaming: false, createdAt: Date.now() },
      ],
    }));
  }

  /** Append an assistant message directly (e.g. /review output). */
  addAssistantText(content: string): void {
    this.update((s) => ({
      ...s,
      phase: "idle",
      showStartScreen: false,
      activity: undefined,
      messages: [
        ...s.messages.filter((m) => !m.streaming),
        { id: `msg_assist_${Date.now()}`, role: "assistant", content, streaming: false, createdAt: Date.now() },
      ],
    }));
  }

  /** Replace history after resume/new-session. */
  setMessages(messages: UiMessage[]): void {
    this.update((s) => ({
      ...s,
      messages,
      showStartScreen: messages.length === 0,
      toolEvents: [],
      subagentTasks: [],
      phase: "idle",
    }));
  }

  reset(): void {
    const current = this.state;
    this.state = { ...initialState(), sidebarOpen: current.sidebarOpen };
    this.notify();
  }

  setDiff(title: string, content: string): void {
    this.update((s) => ({ ...s, diff: { title, content } }));
  }

  clearDiff(): void {
    this.update((s) => ({ ...s, diff: undefined }));
  }

  /* --------------------------- event handlers ------------------------- */

  private handle(ev: AgentEvent): void {
    switch (ev.type) {
      case "meta":
        if (ev.meta?.session) this.syncSessionStatus(ev.meta.session as any);
        if (ev.meta?.subagent) this.onSubagentProgress(ev.meta.subagent as SubagentTaskUi & { status: string });
        break;
      case "thinking":
        // Live activity line: surface what the AI is doing right now.
        if (ev.step) {
          this.update((s) => ({ ...s, activity: ev.step }));
        }
        break;
      case "tool:start":
        this.onToolStart(ev.toolName ?? "tool");
        break;
      case "tool:done":
        this.onToolDone(ev.toolName ?? "tool", ev.result?.meta?.durationMs as number | undefined);
        break;
      case "tool:error":
        this.onToolError(ev.toolName ?? "tool");
        break;
      case "permission:request":
        if (ev.permission) this.onPermission(ev.permission as PermissionUi);
        break;
      case "permission:response":
        this.clearPermission();
        break;
      case "message:start":
        this.onMessageStart();
        break;
      case "message:delta":
        this.bufferDelta(ev.delta ?? "");
        break;
      case "message:done":
        this.onMessageDone(ev.content ?? "");
        break;
      case "error":
        this.onAgentError(ev.error);
        break;
      case "done":
        this.onDone();
        break;
    }
  }

  private syncSessionStatus(session: { id: string; title: string; model: string; mode: any }): void {
    this.setStatus({
      sessionId: session.id,
      sessionTitle: session.title,
      model: session.model,
      mode: session.mode,
    });
  }

  private onToolStart(name: string): void {
    const tool: ToolEventUi = { id: ++this.toolCounter, name, status: "running" };
    this.update((s) => ({
      ...s,
      toolEvents: [...s.toolEvents, tool],
    }));
  }

  private onToolDone(name: string, durationMs?: number): void {
    this.update((s) => ({
      ...s,
      toolEvents: s.toolEvents.map((t) => (t.id === s.toolEvents.length && t.name === name && t.status === "running" ? { ...t, status: "ok" as const, durationMs } : t)),
    }));
  }

  private onToolError(name: string): void {
    this.update((s) => ({
      ...s,
      toolEvents: s.toolEvents.map((t) => (t.id === s.toolEvents.length && t.name === name && t.status === "running" ? { ...t, status: "error" as const } : t)),
    }));
  }

  private onSubagentProgress(task: SubagentTaskUi & { status: string }): void {
    const next: SubagentTaskUi = {
      index: task.index,
      total: task.total,
      label: task.label,
      status: (task.status as SubagentTaskUi["status"]) || "running",
      detail: task.detail,
    };
    this.update((s) => {
      const existing = s.subagentTasks.findIndex((t) => t.index === next.index);
      const subagentTasks =
        existing === -1 ? [...s.subagentTasks, next] : s.subagentTasks.map((t, i) => (i === existing ? next : t));
      return { ...s, subagentTasks };
    });
  }

  private onPermission(permission: PermissionUi): void {
    this.update((s) => ({ ...s, permission, phase: "awaiting-permission" }));
  }

  private clearPermission(): void {
    this.update((s) => ({ ...s, permission: undefined, phase: s.messages.some((m) => m.streaming) ? "streaming" : "thinking" }));
  }

  private onMessageStart(): void {
    this.update((s) => ({
      ...s,
      phase: "streaming",
      activity: undefined,
      showStartScreen: false,
      messages: [
        ...s.messages.filter((m) => !m.streaming),
        { id: `msg_${Date.now()}`, role: "assistant", content: "", streaming: true, createdAt: Date.now() },
      ],
    }));
  }

  private bufferDelta(delta: string): void {
    this.deltaBuffer += delta;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushNow(), UiStore.STREAM_FLUSH_MS);
    }
  }

  private flushNow(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.deltaBuffer) return;
    const chunk = this.deltaBuffer;
    this.deltaBuffer = "";
    this.update((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.streaming) {
        messages[messages.length - 1] = { ...last, content: last.content + chunk };
      }
      return { ...s, messages };
    });
  }

  private onMessageDone(content: string): void {
    this.update((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (last && last.streaming) {
        messages[messages.length - 1] = { ...last, content: content || last.content, streaming: false };
      }
      return { ...s, messages, phase: "idle" };
    });
  }

  private onAgentError(error?: Error): void {
    this.update((s) => ({
      ...s,
      phase: "error",
      error: error?.message ?? "Unknown error",
      messages: [
        ...s.messages.filter((m) => !m.streaming),
      ],
    }));
  }

  private onDone(): void {
    this.update((s) => ({ ...s, phase: "idle", activity: undefined }));
  }

  /** Show a pending agent question (ask_user tool). */
  setAsk(prompt: string): void {
    this.update((s) => ({ ...s, ask: { id: `ask_${Date.now()}`, prompt }, phase: "awaiting-permission" }));
  }

  /** Clear the pending question (answered or rejected). */
  clearAsk(): void {
    this.update((s) => ({ ...s, ask: undefined, phase: s.messages.some((m) => m.streaming) ? "streaming" : "thinking" }));
  }

  /* ----------------------------- plumbing ----------------------------- */

  private update(recipe: (s: AppViewState) => AppViewState): void {
    this.state = recipe(this.state);
    this.notify();
  }

  private notify(): void {
    for (const cb of this.listeners) cb();
  }
}

export type { UiMessage };