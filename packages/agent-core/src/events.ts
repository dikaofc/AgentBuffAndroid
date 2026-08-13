import { EventEmitter } from "node:events";
import type { AgentEvent, AgentEventType } from "@dikabuff/shared";

/** Typed event bus for agent→UI/CLI communication. */
export class AgentEvents extends EventEmitter {
  override on(event: AgentEventType, listener: (ev: AgentEvent) => void): this {
    return super.on(event, listener);
  }
  override once(event: AgentEventType, listener: (ev: AgentEvent) => void): this {
    return super.once(event, listener);
  }
  override off(event: AgentEventType, listener: (ev: AgentEvent) => void): this {
    return super.off(event, listener);
  }

  /** Subscribe to every event. */
  onAny(listener: (ev: AgentEvent) => void): () => void {
    this.on("__any__" as never, listener as never);
    return () => this.off("__any__" as never, listener as never);
  }

  emitEvent(ev: AgentEvent): void {
    try {
      this.emit("__any__" as never, ev);
      // Node's EventEmitter throws on emit('error') when no listener is
      // attached — only dispatch typed events that actually have listeners.
      if (this.listenerCount(ev.type) > 0) this.emit(ev.type, ev);
    } catch (err) {
      // A UI listener must never crash the agent.
      process.stderr.write(`[agent] listener error on ${ev.type}: ${(err as Error).message}\n`);
    }
  }
}