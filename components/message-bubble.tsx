"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import type { Message } from "ai";
import { ToolInvocationCard } from "./tool-invocation-card";

// 按需加载：react-markdown + remark-gfm + rehype-highlight + highlight.js css
// 首屏不加载，首条 AI 回复到来才拉取，显著降低 First Load JS
const Markdown = dynamic(
  () => import("./markdown").then((m) => ({ default: m.Markdown })),
  {
    ssr: false,
    loading: () => (
      <div className="text-neutral-400">加载 markdown 渲染器...</div>
    ),
  },
);

function PlainText({ text }: { text: string }) {
  // 流式时 token 很碎，先用纯文本呈现，完整后走 markdown
  return <div className="whitespace-pre-wrap">{text}</div>;
}

function AssistantParts({
  parts,
  isStreaming,
}: {
  parts: Array<Record<string, unknown>>;
  isStreaming: boolean;
}) {
  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        const type = part.type as string;
        if (type === "text") {
          const text = (part.text as string) ?? "";
          return isStreaming ? (
            <PlainText key={i} text={text} />
          ) : (
            <Markdown key={i} content={text} />
          );
        }
        if (type === "tool-invocation") {
          const invocation = part.toolInvocation as Parameters<
            typeof ToolInvocationCard
          >[0]["invocation"];
          return <ToolInvocationCard key={i} invocation={invocation} />;
        }
        if (type === "reasoning") {
          return (
            <div
              key={i}
              className="rounded border-l-2 border-neutral-300 bg-neutral-50 px-2 py-1 text-xs italic text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900"
            >
              {(part.reasoning as string) ?? ""}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

interface BubbleProps {
  message: Message;
  isStreaming: boolean;
}

function MessageBubbleImpl({ message, isStreaming }: BubbleProps) {
  const isUser = message.role === "user";
  const parts = (message as Message & { parts?: unknown }).parts as
    | Array<Record<string, unknown>>
    | undefined;

  return (
    <div className={`flex px-1 py-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "whitespace-pre-wrap bg-blue-600 text-white"
            : "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
        }`}
      >
        {isUser ? (
          message.content
        ) : parts && parts.length > 0 ? (
          <AssistantParts parts={parts} isStreaming={isStreaming} />
        ) : isStreaming ? (
          <PlainText text={message.content} />
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  );
}

/**
 * 只在消息内容或流式状态真正变化时才重渲。
 * 流式时整个数组引用每个 token 都变，但仅最后一条的 content 变，
 * 这个 memo 保证前面的消息被完全跳过。
 */
export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false;
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  const a = (prev.message as Message & { parts?: unknown }).parts;
  const b = (next.message as Message & { parts?: unknown }).parts;
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
});
