import type { CliContext } from "../context";
import { logInfo, logOk, logSection, logWarn } from "../output";

/** `dikabuff learn` — auto-learning status. */
export async function learnCommand(ctx: CliContext): Promise<number> {
  logSection("DikaBuff auto-learning");
  if (!ctx.learner) {
    logWarn("learner not available in this context");
    return 1;
  }
  // Run a fresh pass so the status reflects any just-recorded episodes.
  await ctx.learner.learnOnce();
  const status = await ctx.learner.getStatus();

  if (!status.enabled) {
    logWarn("learning is disabled (set learn.enabled=true in config)");
    return 1;
  }

  logInfo(`status: enabled`);
  logInfo(`episodes today: ${status.episodesToday} · total: ${status.episodesTotal}`);
  logInfo(`learned tools: ${status.learnedTools} · patterns pending: ${status.patternsPending}`);
  logInfo(`store: ${status.learnDir}`);
  if (status.lastLearnAt) logInfo(`last learn pass: ${new Date(status.lastLearnAt).toLocaleString()}`);

  if (status.recentTools.length > 0) {
    logOk("\nrecent learned tools:");
    for (const tool of status.recentTools) {
      const steps = tool.steps.map((s) => s.tool).join(" → ");
      logOk(`  • ${tool.name} — ${steps} (${tool.hits}×, ${tool.category})`);
    }
  } else {
    logInfo("\nno learned tools yet — patterns need to repeat across sessions before tools are auto-created");
  }
  return 0;
}
