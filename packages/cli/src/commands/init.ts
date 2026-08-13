import type { CliContext } from "../context";
import { logInfo, logOk, logWarn, logSection } from "../output";

export async function initCommand(ctx: CliContext): Promise<void> {
  const { created, dirs } = ctx.config.init();
  logSection("DikaBuff initialization");
  for (const dir of dirs) logOk(`directory ${dir}`);
  if (created) {
    logOk("wrote ~/.dikabuff/config.json (defaults)");
  } else {
    logWarn("config.json already exists — untouched");
  }
  const cfg = ctx.config.get();
  logInfo(`\nprovider: ${cfg.provider}`);
  logInfo(`model:    ${cfg.model}`);
  logInfo(`theme:    ${cfg.theme}`);
  if (cfg.baseUrl) logInfo(`baseUrl:  ${cfg.baseUrl}`);
  logInfo("\nNext: set your model credentials in ~/.dikabuff/config.json, then run `dikabuff`.");
}