import { THEME_IDS } from "@dikabuff/config";
import type { CliContext } from "../context";
import { logFail, logInfo, logMuted, logOk, logSection, logTable } from "../output";

/** `dikabuff config` — get/set/list config + theme switcher. */
export async function configCommand(ctx: CliContext, opts: { action: string; key?: string; value?: string }): Promise<number> {
  const [sub, ...rest] = opts.action.split(" ");

  switch (sub) {
    case "get": {
      const key = opts.key ?? rest[0];
      const value = key ? ctx.config.getByPath(key, true) : ctx.config.list();
      logInfo(JSON.stringify(value, null, 2));
      return 0;
    }
    case "set": {
      const key = opts.key ?? rest[0];
      const value = opts.value ?? rest.slice(1).join(" ");
      if (!key || !value) {
        logFail("usage: dikabuff config set <key> <value>");
        return 1;
      }
      ctx.config.setByPath(key, value);
      logOk(`${key} = ${value}`);
      return 0;
    }
    case "theme": {
      const theme = opts.value ?? rest[0] ?? opts.key;
      if (!theme) {
        logSection("Themes");
        for (const id of THEME_IDS) {
          logInfo(` ${ctx.config.get().theme === id ? "●" : "○"} ${id}`);
        }
        logMuted("usage: dikabuff config theme <name>");
        return 0;
      }
      if (!THEME_IDS.includes(theme as never)) {
        logFail(`unknown theme "${theme}" — available: ${THEME_IDS.join(", ")}`);
        return 1;
      }
      ctx.config.setByPath("theme", theme);
      logOk(`theme → ${theme}`);
      return 0;
    }
    case "list":
      logTable(Object.entries(ctx.config.list()).map(([k, v]) => [k, safe(v)]), ["key", "value"]);
      return 0;
    case "models": {
      logSection("Models");
      logTable(
        ctx.config.getModelPresets().map((m) => [m.id, m.provider, m.contextWindow ?? "", m.supportsTools ? "tools" : ""]),
        ["id", "provider", "context", "features"],
      );
      return 0;
    }
    default:
      logFail("usage: dikabuff config get|set|theme|list|models");
      return 1;
  }
}

function safe(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v).slice(0, 44) + "…" : String(v);
}