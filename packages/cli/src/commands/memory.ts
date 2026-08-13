import type { CliContext } from "../context";
import { logFail, logInfo, logMuted, logOk, logSection, logTable } from "../output";

/** `dikabuff memory` — inspect & manage long-term memory. */
export async function memoryCommand(ctx: CliContext, opts: { action: string; key?: string }): Promise<number> {
  const [sub, ...rest] = opts.action.split(" ");
  switch (sub) {
    case "list": {
      logSection("Memory keys");
      const keys = await ctx.memory.search("");
      if (keys.length === 0) {
        logMuted("no memories stored yet");
        return 0;
      }
      logTable(keys.map((k) => [k.key, (k.value as any)?.text ?? JSON.stringify(k.value).slice(0, 60)]), ["key", "value"]);
      return 0;
    }
    case "forget": {
      if (!opts.key) {
        logFail("usage: dikabuff memory forget <key>");
        return 1;
      }
      await ctx.memory.forget(opts.key);
      logOk(`forgot ${opts.key}`);
      return 0;
    }
    case "remember": {
      const key = opts.key ?? rest[0];
      const value = rest.slice(1).join(" ");
      if (!key || !value) {
        logFail("usage: dikabuff memory remember <key> <value…>");
        return 1;
      }
      await ctx.memory.remember(key, value);
      logOk(`remembered ${key}`);
      return 0;
    }
    case "notes": {
      logSection("Project notes");
      const notes = await ctx.memory.projectNotes("project." + projectKeyOf(ctx.cwd));
      for (const n of notes.slice(-10)) logInfo(`- ${n.text} (${new Date(n.at).toLocaleString()})`);
      return 0;
    }
    default:
      logFail("usage: dikabuff memory list | forget <key> | remember <key> <value> | notes");
      return 1;
  }
}

function projectKeyOf(cwd: string): string {
  const hash = [...cwd].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(36);
  return hash;
}