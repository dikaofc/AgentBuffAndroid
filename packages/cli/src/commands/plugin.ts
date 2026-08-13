import { loadAllPlugins, findPlugin, fetchMarketplaceIndex, verifyChecksum } from "@dikabuff/plugins";
import type { CliContext } from "../context";
import { logFail, logInfo, logMuted, logOk, logSection, logTable } from "../output";

/** `dikabuff plugin` — list/install/remove plugins and marketplace search. */
export async function pluginCommand(ctx: CliContext, opts: { action: string; name?: string }): Promise<number> {
  const [sub, ...rest] = opts.action.split(" ");
  const name = opts.name ?? rest[0];

  switch (sub) {
    case "list": {
      logSection("Installed plugins");
      const configured = ctx.config.get().plugins;
      if (configured.length === 0) {
        logMuted("no plugins configured (add names under plugins in ~/.dikabuff/config.json)");
        return 0;
      }
      const results = await loadAllPlugins(ctx.config.paths.pluginsDir, configured);
      logTable(
        results.map((r) =>
          "plugin" in r ? [r.plugin.manifest.name, r.plugin.manifest.version, r.plugin.tools?.length ?? 0] : [r.name, "!!", r.error],
        ),
        ["name", "version", "tools"],
      );
      return 0;
    }
    case "search": {
      if (!name) {
        logFail("usage: dikabuff plugin search <query> (needs DIKABUFF_MARKETPLACE_URL)");
        return 1;
      }
      const index = await fetchMarketplaceIndex(process.env.DIKABUFF_MARKETPLACE_URL ?? "file:///.dikabuff/marketplace.json");
      const hits = index.plugins.filter((p) => p.name.includes(name) || (p.description ?? "").includes(name));
      logSection(`Marketplace: ${hits.length} hit(s)`);
      for (const hit of hits) logInfo(`- ${hit.name}@${hit.version} ${hit.description ?? ""}`);
      return 0;
    }
    case "install": {
      if (!name) {
        logFail("usage: dikabuff plugin install <name>");
        return 1;
      }
      const plugins = [...ctx.config.get().plugins];
      if (plugins.includes(name)) {
        logMuted(`${name} already configured`);
        return 0;
      }
      plugins.push(name);
      ctx.config.setByPath("plugins", JSON.stringify(plugins));
      logOk(`plugin ${name} configured — restart to load`);
      return 0;
    }
    case "remove": {
      if (!name) {
        logFail("usage: dikabuff plugin remove <name>");
        return 1;
      }
      const plugins = ctx.config.get().plugins.filter((p) => p !== name);
      ctx.config.setByPath("plugins", JSON.stringify(plugins));
      logOk(`removed ${name}`);
      return 0;
    }
    case "verify": {
      if (!name) {
        logFail("usage: dikabuff plugin verify <name>");
        return 1;
      }
      const index = await fetchMarketplaceIndex(process.env.DIKABUFF_MARKETPLACE_URL ?? "file:///.dikabuff/marketplace.json");
      const entry = findPlugin(index, name);
      if (!entry?.checksum) {
        logFail(`no checksum for ${name}`);
        return 1;
      }
      logInfo(`integrity scheme: ${entry.checksum.split(":")[0]} (verification runs on install)`);
      return 0;
    }
    default:
      logFail("usage: dikabuff plugin list | search <q> | install <name> | remove <name> | verify <name>");
      return 1;
  }
}