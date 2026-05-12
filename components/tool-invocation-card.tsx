"use client";

import { useState } from "react";
import type { ToolInvocation } from "ai";

const TOOL_LABELS: Record<string, { emoji: string; name: string }> = {
  get_current_time: { emoji: "🕒", name: "查询时间" },
  calculator: { emoji: "🧮", name: "计算器" },
  web_search: { emoji: "🔎", name: "联网搜索" },
};

function argsPreview(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  // 优先展示常见字段
  for (const key of ["query", "expression", "timezone"]) {
    if (key in obj && typeof obj[key] === "string") {
      const v = obj[key] as string;
      return v.length > 40 ? v.slice(0, 40) + "…" : v;
    }
  }
  return JSON.stringify(obj);
}

export function ToolInvocationCard({
  invocation,
}: {
  invocation: ToolInvocation;
}) {
  const [open, setOpen] = useState(false);

  const meta = TOOL_LABELS[invocation.toolName] ?? {
    emoji: "🔧",
    name: invocation.toolName,
  };

  const state = invocation.state;
  const statusText =
    state === "partial-call"
      ? "准备参数..."
      : state === "call"
        ? "调用中..."
        : "已完成";

  const statusColor =
    state === "result"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-amber-700 dark:text-amber-400";

  return (
    <div className="my-2 rounded-lg border border-neutral-200 bg-neutral-50 text-xs dark:border-neutral-700 dark:bg-neutral-900">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <span>{meta.emoji}</span>
        <span className="font-medium text-neutral-700 dark:text-neutral-200">
          {meta.name}
        </span>
        <span className="truncate text-neutral-500">
          {argsPreview(invocation.args)}
        </span>
        <span className={`ml-auto shrink-0 ${statusColor}`}>{statusText}</span>
        <span className="text-neutral-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
              参数
            </div>
            <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] leading-relaxed dark:bg-neutral-950">
              {JSON.stringify(invocation.args ?? {}, null, 2)}
            </pre>
          </div>

          {state === "result" && (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                结果
              </div>
              <ToolResultView
                toolName={invocation.toolName}
                result={(invocation as { result: unknown }).result}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolResultView({
  toolName,
  result,
}: {
  toolName: string;
  result: unknown;
}) {
  if (
    toolName === "web_search" &&
    result &&
    typeof result === "object" &&
    "results" in result
  ) {
    const r = result as {
      answer?: string | null;
      results?: Array<{ title: string; url: string; snippet: string }>;
      error?: string;
    };
    if (r.error) {
      return <div className="text-red-600">{r.error}</div>;
    }
    return (
      <div className="space-y-2">
        {r.answer && (
          <div className="rounded bg-blue-50 p-2 text-neutral-700 dark:bg-blue-950/40 dark:text-neutral-200">
            <span className="font-medium">摘要：</span>
            {r.answer}
          </div>
        )}
        <ul className="space-y-1.5">
          {r.results?.map((item, i) => (
            <li key={i} className="leading-snug">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {item.title}
              </a>
              <div className="text-neutral-500">{item.snippet}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] leading-relaxed dark:bg-neutral-950">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}
