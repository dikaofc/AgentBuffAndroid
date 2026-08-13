import type { CliContext } from "../context";
import { logFail, logInfo, logOk, logSection, logWarn } from "../output";

/** `dikabuff doctor` — configuration & connectivity diagnostics. */
export async function doctorCommand(ctx: CliContext): Promise<number> {
  logSection("DikaBuff doctor");
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const cfg = ctx.config.get();

  checks.push({ name: "config dir", ok: true, detail: ctx.config.paths.configDir });
  try {
    await ctx.memory.remember("doctor.probe", { at: Date.now() });
    checks.push({ name: "memory store", ok: true, detail: "read/write ok" });
  } catch (err) {
    checks.push({ name: "memory store", ok: false, detail: (err as Error).message });
  }

  if (cfg.provider === "mock") {
    checks.push({ name: "provider", ok: true, detail: "mock (offline demo) — configure a real model for production use" });
  } else {
    checks.push({
      name: "provider",
      ok: true,
      detail: `${cfg.provider} / ${cfg.model}${cfg.baseUrl ? ` @ ${cfg.baseUrl}` : ""}${cfg.apiKey ? " (key set)" : " (no key)"}`,
    });
    if (!cfg.apiKey) checks.push({ name: "api key", ok: false, detail: "missing apiKey in ~/.dikabuff/config.json" });
  }

  const model = ctx.config.getModelPresets().find((m) => m.id === cfg.model);
  if (!model) checks.push({ name: "model preset", ok: false, detail: `${cfg.model} not found in models.json` });
  else checks.push({ name: "model preset", ok: true, detail: model.id });

  for (const check of checks) {
    if (check.ok) logOk(`${check.name}: ${check.detail ?? ""}`);
    else logFail(`${check.name}: ${check.detail ?? ""}`);
  }
  const ok = checks.every((c) => c.ok);
  logInfo(ok ? "\nall systems nominal" : "\nfix the issues above, then re-run `dikabuff doctor`");
  return ok ? 0 : 1;
}