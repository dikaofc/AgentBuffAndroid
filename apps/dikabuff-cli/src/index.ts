import { createContainer } from "./container";
import { buildProgram } from "@dikabuff/cli";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // Pre-scan global flags before commander parses (logging configured early).
  if (argv.includes("--debug") || argv.includes("-d")) process.env.DIKABUFF_DEBUG = "1";

  // `--home` must reach the Container, which is built before commander parses.
  let homeDir: string | undefined;
  const homeIdx = argv.indexOf("--home");
  if (homeIdx !== -1 && argv[homeIdx + 1]) homeDir = argv[homeIdx + 1]!;
  const eq = argv.find((a) => a.startsWith("--home="));
  if (eq) homeDir = eq.slice("--home=".length);

  const container = createContainer({ homeDir });
  const program = buildProgram(container);

  // Crash reporting: never let an uncaught error print a raw stack in prod mode.
  process.on("uncaughtException", (err) => {
    if ((err as NodeJS.ErrnoException).code === "EPIPE") process.exit(0); // piped output closed (e.g. `| head`)
    process.stderr.write(`\n[${"fatal"}] ${err.stack ?? err.message}\n`);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`\n[unhandled rejection] ${String(reason)}\n`);
    process.exit(1);
  });

  await program.parseAsync(process.argv);
}

void main();