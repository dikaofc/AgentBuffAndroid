import type { CliContext } from "../context";
import { logFail, logInfo, logMuted, logOk, logSection, logWarn } from "../output";

type RegistryResult = { status: "ok"; version: string } | { status: "not-found" } | { status: "unreachable" };

/**
 * `dikabuff update` — self-update check.
 *
 * DikaBuff is installed from source via `install.sh`, not published to the npm
 * registry by default. The registry package name can be overridden with the
 * `DIKABUFF_UPDATE_PACKAGE` env var so downstream publishes/forks can enable
 * real registry-based update checks.
 */
export async function updateCommand(ctx: CliContext, opts: { channel?: string }): Promise<number> {
  logSection("DikaBuff update");
  const channel = opts.channel ?? ctx.config.get().update.channel;
  const current = await currentVersion();
  logInfo(`current: ${current}`);

  const pkg = process.env.DIKABUFF_UPDATE_PACKAGE ?? "dikabuff";
  const remote = await latestVersion(pkg, channel);

  if (remote.status === "unreachable") {
    logFail("could not reach the npm registry — check your network and try again.");
    return 1;
  }
  if (remote.status === "not-found") {
    logWarn(`"${pkg}" is not published on the npm registry — nothing to compare against.`);
    logInfo("DikaBuff updates from source: run  sh install.sh --full  inside the repository.");
    logMuted(`(publish it as npm "${pkg}", or set DIKABUFF_UPDATE_PACKAGE to enable registry checks)`);
    return 0;
  }

  logInfo(`latest (${channel}): ${remote.version}`);
  if (remote.version === current) {
    logOk("you are up to date");
    return 0;
  }
  logInfo("a newer version is available.");
  logInfo("DikaBuff updates from source: run  sh install.sh --full  inside the repository.");
  if (pkg !== "dikabuff") logMuted(`registry install: npm install -g ${pkg}@latest (or pnpm/bun equivalent)`);
  return 0;
}

async function currentVersion(): Promise<string> {
  try {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function latestVersion(pkg: string, channel: string): Promise<RegistryResult> {
  try {
    const res = await fetch(`https://registry.npmjs.org/-/package/${pkg}/dist-tags`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) return { status: "unreachable" };
    const tags = (await res.json()) as Record<string, string>;
    const version = tags[channel] ?? tags["latest"];
    // Registry reachable but no matching dist-tag (e.g. never published a tag).
    return version ? { status: "ok", version } : { status: "not-found" };
  } catch {
    return { status: "unreachable" };
  }
}
