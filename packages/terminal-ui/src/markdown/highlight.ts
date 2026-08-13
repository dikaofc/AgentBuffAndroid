/** Lightweight, zero-dep syntax highlighting producing styled spans. */

export type TokenColor = "keyword" | "string" | "comment" | "number" | "function" | "type" | "plain" | "punctuation";

export interface CodeSpan {
  text: string;
  color: TokenColor;
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "extends",
  "import", "export", "from", "default", "async", "await", "try", "catch", "finally", "throw",
  "new", "this", "typeof", "instanceof", "in", "of", "switch", "case", "break", "continue",
  "interface", "type", "enum", "namespace", "implements", "public", "private", "protected",
  "static", "readonly", "abstract", "def", "pass", "lambda", "with", "yield", "match", "struct", "fn", "let", "mut",
]);

const TYPES = new Set([
  "string", "number", "boolean", "void", "unknown", "any", "never", "object", "int", "float",
  "str", "bool", "list", "dict", "tuple", "set", "Optional", "Result", "Error",
]);

export function highlight(lang: string, code: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  const tokenRe =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b|([^\sA-Za-z0-9_$]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(code))) {
    if (m.index > last) spans.push({ text: code.slice(last, m.index), color: "plain" });
    if (m[1] !== undefined) spans.push({ text: m[1], color: "comment" });
    else if (m[2] !== undefined) spans.push({ text: m[2], color: "string" });
    else if (m[3] !== undefined) spans.push({ text: m[3], color: "number" });
    else if (m[4] !== undefined) {
      const word = m[4];
      if (lang !== "bash" && (KEYWORDS.has(word) || word === "true" || word === "false" || word === "null" || word === "undefined")) {
        spans.push({ text: word, color: "keyword" });
      } else if (TYPES.has(word)) {
        spans.push({ text: word, color: "type" });
      } else {
        spans.push({ text: word, color: "plain" });
      }
    } else if (m[5] !== undefined) {
      spans.push({ text: m[5], color: "punctuation" });
    }
    last = tokenRe.lastIndex;
  }
  if (last < code.length) spans.push({ text: code.slice(last), color: "plain" });
  return spans;
}