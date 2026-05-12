import { tool } from "ai";
import { z } from "zod";

// ---------- 本地工具 ----------

export const getCurrentTime = tool({
  description:
    "获取当前的日期和时间。当用户询问时间、日期、星期、今天是几号等问题时使用。",
  parameters: z.object({
    timezone: z
      .string()
      .optional()
      .describe("IANA 时区，如 Asia/Shanghai、UTC；不传则使用服务器本地时区"),
  }),
  execute: async ({ timezone }) => {
    const now = new Date();
    try {
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      });
      return {
        iso: now.toISOString(),
        formatted: formatter.format(now),
        timezone: timezone ?? "server-local",
      };
    } catch {
      return {
        iso: now.toISOString(),
        formatted: now.toString(),
        timezone: "server-local (invalid tz given)",
      };
    }
  },
});

// 简单安全的数学表达式求值：只允许数字、运算符和括号
function safeEval(expr: string): number {
  if (!/^[\d+\-*/().\s%]+$/.test(expr)) {
    throw new Error("表达式包含非法字符");
  }
  const fn = new Function(`"use strict"; return (${expr});`);
  const result = fn();
  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error("结果不是有效数字");
  }
  return result;
}

export const calculator = tool({
  description:
    "计算数学表达式。支持 + - * / % 和括号。不要用来计算有单位的量或文本。",
  parameters: z.object({
    expression: z
      .string()
      .describe("形如 (1+2)*3 的纯数学表达式，只包含数字、+-*/%、括号"),
  }),
  execute: async ({ expression }) => {
    try {
      const value = safeEval(expression);
      return { expression, value };
    } catch (e) {
      return {
        expression,
        error: e instanceof Error ? e.message : "计算失败",
      };
    }
  },
});

// ---------- 联网搜索（Tavily）----------

export const webSearch = tool({
  description:
    "联网搜索最新信息。当问题涉及实时新闻、最近事件、版本号、人物动态等模型知识截止后的信息时使用。",
  parameters: z.object({
    query: z.string().describe("搜索查询词"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("返回结果数量，1-10"),
  }),
  execute: async ({ query, max_results }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        error:
          "缺少 TAVILY_API_KEY 环境变量，请在 .env.local 配置。注册地址：https://tavily.com/",
      };
    }

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results,
          search_depth: "basic",
          include_answer: true,
        }),
      });

      if (!res.ok) {
        return { error: `Tavily API ${res.status}: ${await res.text()}` };
      }

      const data = (await res.json()) as {
        answer?: string;
        results?: Array<{
          title: string;
          url: string;
          content: string;
          score?: number;
        }>;
      };

      return {
        query,
        answer: data.answer ?? null,
        results:
          data.results?.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.slice(0, 400) ?? "",
          })) ?? [],
      };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "搜索失败",
      };
    }
  },
});

export const tools = {
  get_current_time: getCurrentTime,
  calculator,
  web_search: webSearch,
};
