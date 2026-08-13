/** Minimal zero-dependency ANSI styling utilities (used outside Ink too). */

const OPEN = "\u001b[";
const CLOSE = `${OPEN}0m`;

export type AnsiColor =
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white"
  | "gray" | "dim" | "bold" | "italic" | "underline" | "inverse";

const CODES: Record<Exclude<AnsiColor, "gray">, number> = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  dim: 2, bold: 1, italic: 3, underline: 4, inverse: 7,
};
const GRAY = 90;

export function paint(text: string, ...colors: AnsiColor[]): string {
  if (!text) return text;
  const seqs = colors.map((c) => `${OPEN}${c === "gray" ? GRAY : CODES[c]}m`).join("");
  return `${seqs}${text}${CLOSE}`;
}

export const ansi = {
  open: OPEN,
  close: CLOSE,
  paint,
  strip(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\u001b\[[0-9;]*m/g, "");
  },
  /** ANSI-aware text width. */
  width(text: string): number {
    let w = 0;
    for (const ch of this.strip(text)) w += ch.charCodeAt(0) > 0x2fff ? 2 : 1;
    return w;
  },
};

/** True when stdout is an interactive TTY. */
export function isTTY(stream: NodeJS.WriteStream = process.stdout): boolean {
  return Boolean(stream.isTTY);
}

export const RESET = CLOSE;