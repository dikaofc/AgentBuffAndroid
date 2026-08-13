#!/usr/bin/env node
/**
 * docs generator — builds docs/README.md index + cross-doc link checker.
 * Usage: node scripts/gen-docs.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const docsDir = new URL("../docs/", import.meta.url).pathname;
const files = readdirSync(docsDir).filter((f) => f.endsWith(".md") && f !== "README.md").sort();

const entries = files.map((f) => {
  const text = readFileSync(join(docsDir, f), "utf8");
  const title = text.split("\n").find((l) => l.startsWith("# "))?.replace(/^# /, "") ?? basename(f, ".md");
  const desc = text
    .split("\n")
    .find((l) => l.startsWith("> "))
    ?.replace(/^> /, "") ?? "—";
  return { file: f, title, desc, size: Buffer.byteLength(text) };
});

const toc = `# DikaBuff Documentation

Gateway to every design document in the repository.

| Document | Description | Size |
|---|---|---|
${entries.map((e) => `| [${e.title}](${e.file}) | ${e.desc} | ${(e.size / 1024).toFixed(1)} KB |`).join("\n")}

## Reading order

1. **ARCHITECTURE.md** — the full system blueprint (the 8 required sections).
2. **UX.md** — terminal UX flow and interaction model.
3. **DATABASE.md** — memory, sessions, and vector index storage design.
4. **API.md** — public interfaces: tools, providers, plugins, CLI.
5. **ROADMAP.md** — phased development plan.
`;

writeFileSync(join(docsDir, "README.md"), toc);

// Link checker: every [text](./x.md) or [text](x.md) in docs must resolve.
let broken = 0;
for (const f of files) {
  const text = readFileSync(join(docsDir, f), "utf8");
  const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+\.md)\)/g)].map((m) => m[1]);
  for (const link of links) {
    const target = link.replace(/^\.\//, "").split("#")[0];
    if (target === f) continue;
    if (!files.includes(target)) {
      console.error(`[gen-docs] broken link in ${f}: ${link}`);
      broken++;
    }
  }
}
if (broken > 0) {
  console.error(`[gen-docs] ${broken} broken link(s)`);
  process.exitCode = 1;
} else {
  console.log(`[gen-docs] docs/README.md written (${entries.length} documents, links OK)`);
}