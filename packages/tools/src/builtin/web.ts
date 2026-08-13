import { z } from "zod";
import type { ToolDefinition, ToolResult } from "@dikabuff/shared";
import { WebSearchArgs } from "../schema";

/**
 * `web_search` — search the web for current information.
 *
 * Zero-setup by default: queries DuckDuckGo's HTML endpoint (no API key, no
 * account). When `TAVILY_API_KEY` is set in the environment, results come from
 * the Tavily API instead (better structured results for agent use).
 *
 * Permission: standard / analysis — allowed in every mode (read-only network
 * GET). Results are truncated so long pages can't blow up the context window.
 */
export const webSearchTool: ToolDefinition<z.infer<typeof WebSearchArgs>> = {
  name: "web_search",
  description:
    "Search the web for current information (docs, news, APIs, errors). Returns a list of results with title, URL and snippet. Use when the answer depends on information that is not in the project or your training data.",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      maxResults: { type: "number", description: "Max results (1-8, default 5)" },
    },
    required: ["query"],
  },
  permission: "standard",
  category: "analysis",
  validateSchema: WebSearchArgs,
  async run(args): Promise<ToolResult> {
    const query = args.query.trim();
    const maxResults = Math.min(8, Math.max(1, args.maxResults ?? 5));
    if (!query) return { ok: false, error: "query is required" };

    try {
      const tavilyKey = process.env.TAVILY_API_KEY;
      const results = tavilyKey ? await tavilySearch(query, maxResults, tavilyKey) : await duckDuckGoSearch(query, maxResults);
      if (results.length === 0) {
        return { ok: false, error: `no web results for "${query}"` };
      }
      const output = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
      return { ok: true, output, data: { query, results } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `web_search failed: ${message}` };
    }
  },
};

interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** Keyless fallback: parse DuckDuckGo's HTML results page. */
async function duckDuckGoSearch(query: string, max: number): Promise<WebResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (DikaBuff-Agent/0.2; +https://dikabuff.local)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const out: WebResult[] = [];
  // DDG renders one <a class="result__a"> per result, followed by
  // <a class="result__snippet">. Parse with a lightweight regex split.
  const blocks = html.split(/class="result__body"/).slice(1);
  for (const block of blocks) {
    const title = firstMatch(block, /class="result__a"[^>]*>(.*?)<\/a>/s) ?? firstMatch(block, /class="result__a"[^>]*href="([^"]+)"/) ?? "";
    const href = firstMatch(block, /class="result__a"[^>]*href="([^"]+)"/) ?? "";
    const snippet = firstMatch(block, /class="result__snippet"[^>]*>(.*?)<\/a>/s) ?? "";
    const clean = (s: string): string => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const url = decodeDdgUrl(href);
    if (title || url) {
      out.push({ title: clean(title), url, snippet: clean(snippet).slice(0, 300) });
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Optional keyed backend: Tavily Search API. */
async function tavilySearch(query: string, max: number, apiKey: string): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: max, search_depth: "basic" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).slice(0, max).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 300),
  }));
}

function firstMatch(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m?.[1]?.trim() || m?.[0]?.trim() || undefined;
}

/** DDG wraps result links as /l/?uddg=<encoded>. Extract the real URL. */
function decodeDdgUrl(href: string): string {
  try {
    const uddg = href.match(/uddg=([^&]+)/)?.[1];
    if (uddg) return decodeURIComponent(uddg);
  } catch { /* fall through */ }
  if (href.startsWith("http")) return href;
  return "";
}
