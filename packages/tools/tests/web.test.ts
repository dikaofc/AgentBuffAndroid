import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@dikabuff/shared";
import { webSearchTool } from "../src/builtin/web";
import { askUserTool } from "../src/builtin/ask";

const ctx: ToolContext = {
  cwd: "/proj",
  sessionId: "s1",
  mode: "code",
  memory: {} as never,
  environment: {},
  log: {} as never,
  emit: () => {},
  ask: async () => "42",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web_search", () => {
  it("parses DuckDuckGo HTML results (keyless path)", async () => {
    const html = `
      <div class="result__body">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=x">Example Docs</a>
        <a class="result__snippet">How to use the Example API with <b>curl</b>.</a>
      </div>
      <div class="result__body">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fblog&rut=y">Example Blog</a>
        <a class="result__snippet">A deep dive into examples.</a>
      </div>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => html }));
    delete process.env.TAVILY_API_KEY;

    const result = await webSearchTool.run({ query: "example docs" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Example Docs");
    expect(result.output).toContain("https://example.com/docs");
    expect(result.output).toContain("How to use the Example API");
    const data = result.data as { results: Array<{ title: string; url: string }> };
    expect(data.results.length).toBe(2);
  });

  it("uses Tavily when TAVILY_API_KEY is set", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { title: "Tavily Result", url: "https://tavily.com/doc", content: "Tavily search snippet" },
          ],
        }),
      }),
    );
    const result = await webSearchTool.run({ query: "tavily test" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("Tavily Result");
    expect(result.output).toContain("tavily.com");
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(String(call[0])).toContain("api.tavily.com");
  });

  it("returns an error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    delete process.env.TAVILY_API_KEY;
    const result = await webSearchTool.run({ query: "anything" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("web_search failed");
  });

  it("returns an error when there are no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>nothing here</html>" }));
    delete process.env.TAVILY_API_KEY;
    const result = await webSearchTool.run({ query: "no results here" }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no web results");
  });
});

describe("ask_user", () => {
  it("returns the user's typed answer", async () => {
    const result = await askUserTool.run({ question: "which port?" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("42");
  });

  it("reports a decline as ok with declined meta", async () => {
    const declinedCtx: ToolContext = { ...ctx, ask: async () => null };
    const result = await askUserTool.run({ question: "are you sure?" }, declinedCtx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("declined");
    expect(result.meta?.declined).toBe(true);
  });
});
