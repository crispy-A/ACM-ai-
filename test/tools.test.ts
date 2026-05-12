import { describe, it, expect, vi } from "vitest";
import { tools } from "@/lib/ai/tools";

describe("calculator tool", () => {
  const exec = tools.calculator.execute!;
  const ctx = { toolCallId: "t", messages: [] } as never;

  it("计算基本四则运算", async () => {
    const r = await exec({ expression: "1+2*3" }, ctx);
    expect(r).toEqual({ expression: "1+2*3", value: 7 });
  });

  it("支持括号和优先级", async () => {
    const r = await exec({ expression: "(123+456)*78" }, ctx);
    expect(r).toEqual({ expression: "(123+456)*78", value: 45162 });
  });

  it("小数计算", async () => {
    const r = await exec({ expression: "0.1+0.2" }, ctx);
    const value = (r as { value?: number }).value;
    expect(value).toBeDefined();
    expect(Math.abs((value as number) - 0.3)).toBeLessThan(1e-9);
  });

  it("拒绝包含字母的表达式（防注入）", async () => {
    const r = await exec({ expression: "alert(1)" }, ctx);
    expect("error" in r).toBe(true);
  });

  it("拒绝 process.env 之类的敏感访问", async () => {
    const r = await exec(
      { expression: "process.env.SECRET" },
      ctx,
    );
    expect("error" in r).toBe(true);
  });

  it("除零结果被判为非有效数字", async () => {
    const r = await exec({ expression: "1/0" }, ctx);
    expect("error" in r).toBe(true);
  });
});

describe("get_current_time tool", () => {
  const exec = tools.get_current_time.execute!;
  const ctx = { toolCallId: "t", messages: [] } as never;

  it("返回 ISO 时间和本地格式化", async () => {
    const r = await exec({}, ctx);
    expect(r.iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof r.formatted).toBe("string");
  });

  it("支持指定时区", async () => {
    const r = await exec({ timezone: "UTC" }, ctx);
    expect(r.timezone).toBe("UTC");
  });

  it("非法时区回退到本地时间", async () => {
    const r = await exec({ timezone: "Not/A_Zone" }, ctx);
    expect(r.timezone).toContain("server-local");
  });
});

describe("web_search tool", () => {
  const exec = tools.web_search.execute!;
  const ctx = { toolCallId: "t", messages: [] } as never;
  const ORIGINAL = process.env.TAVILY_API_KEY;

  it("未配置 key 时返回友好提示而不是抛错", async () => {
    delete process.env.TAVILY_API_KEY;
    const r = await exec({ query: "test", max_results: 3 }, ctx);
    expect("error" in r && r.error).toContain("TAVILY_API_KEY");
    process.env.TAVILY_API_KEY = ORIGINAL;
  });

  it("成功响应被正确解析", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: "一个摘要",
        results: [
          {
            title: "标题",
            url: "https://example.com",
            content: "内容".repeat(500),
            score: 0.9,
          },
        ],
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const r = await exec({ query: "hello", max_results: 5 }, ctx);
    expect("results" in r && r.results?.[0].title).toBe("标题");
    expect("results" in r && r.results?.[0].snippet.length).toBeLessThanOrEqual(400);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" }),
    );

    process.env.TAVILY_API_KEY = ORIGINAL;
  });

  it("HTTP 错误被转成 error 字段", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    }) as unknown as typeof fetch;
    const r = await exec({ query: "x", max_results: 3 }, ctx);
    expect("error" in r && r.error).toContain("500");
    process.env.TAVILY_API_KEY = ORIGINAL;
  });
});
