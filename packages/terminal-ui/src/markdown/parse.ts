/** Block + inline markdown parser (headings, code, lists, quotes, tables, hr, links). */

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; url: string }
  | { kind: "strike"; children: InlineNode[] };

export type BlockNode =
  | { kind: "heading"; level: 1 | 2 | 3; children: InlineNode[] }
  | { kind: "paragraph"; children: InlineNode[] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; items: InlineNode[][] }
  | { kind: "quote"; children: InlineNode[] }
  | { kind: "hr" }
  | { kind: "table"; header: string[]; rows: string[][] };

export function parseMarkdown(md: string): BlockNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fence
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length as 1 | 2 | 3, children: parseInline(heading[2]!) });
      i++;
      continue;
    }

    // Table: consecutive lines starting with |
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1]!)) {
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2; // skip delimiter row
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i]!)) {
        rows.push(lines[i]!.split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // HR
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Quote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        buf.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", children: parseInline(buf.join(" ")) });
      continue;
    }

    // List
    const listMatch = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d+[.)]/.test(listMatch[1]!);
      const items: InlineNode[][] = [parseInline(listMatch[2]!)];
      i++;
      while (i < lines.length) {
        const next = lines[i]!.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!next) break;
        if (ordered !== /^\d+[.)]/.test(next[1]!)) break;
        items.push(parseInline(next[2]!));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (accumulate soft-wrapped lines)
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,3}\s|```|>|\s*([-*+]|\d+[.)])\s+|---+$)/.test(lines[i]!)
    ) {
      buf.push(lines[i]!);
      i++;
    }
    blocks.push({ kind: "paragraph", children: parseInline(buf.join(" ")) });
  }

  return blocks;
}

/** Inline parsing: **bold**, *italic*, `code`, [text](url), ~~strike~~. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|~~([^~]+)~~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[2] !== undefined) nodes.push({ kind: "bold", children: parseInline(m[2]) });
    else if (m[3] !== undefined) nodes.push({ kind: "italic", children: parseInline(m[3]) });
    else if (m[4] !== undefined) nodes.push({ kind: "code", text: m[4] });
    else if (m[5] !== undefined && m[6] !== undefined) nodes.push({ kind: "link", text: m[5], url: m[6] });
    else if (m[7] !== undefined) nodes.push({ kind: "strike", children: parseInline(m[7]) });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ kind: "text", text: text.slice(last) });
  return nodes;
}