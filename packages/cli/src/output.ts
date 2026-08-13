import { paint } from "@dikabuff/shared";

/** Pretty printers for non-interactive command output. */

export function logSection(title: string): void {
  process.stdout.write(`\n${paint("┌─ " + title + " " + "─".repeat(Math.max(0, 40 - title.length)), "cyan")}\n`);
}

export function logOk(line: string): void {
  process.stdout.write(`${paint("✓", "green")} ${line}\n`);
}

export function logWarn(line: string): void {
  process.stdout.write(`${paint("⚠", "yellow")} ${line}\n`);
}

export function logFail(line: string): void {
  process.stdout.write(`${paint("✗", "red")} ${line}\n`);
}

export function logInfo(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function logMuted(line: string): void {
  process.stdout.write(`${paint(line, "gray")}\n`);
}

export function logTable(rows: Array<Array<string | number>>, headers?: string[]): void {
  const widths: number[] = [];
  const all = headers ? [headers, ...rows] : rows;
  for (const row of all) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, String(cell).length);
    });
  }
  if (headers) renderRow(headers, widths, true);
  for (const row of rows) renderRow(row, widths, false);
}

function renderRow(row: Array<string | number>, widths: number[], header: boolean): void {
  const cells = row.map((cell, i) => String(cell).padEnd((widths[i] ?? 0) + 2));
  process.stdout.write(`${header ? paint(cells.join(""), "bold", "cyan") : cells.join("").trimEnd()}\n`);
}