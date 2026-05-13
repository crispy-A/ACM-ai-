"use client";

import { useChat } from "@ai-sdk/react";
import type { Message } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { createConversation, loadMessages, saveMessages } from "@/lib/db";
import { MessageBubble } from "./message-bubble";
import { Sidebar } from "./sidebar";
import { KnowledgePanel } from "./knowledge-panel";
import { seedMessages } from "@/lib/seed";
import { loadAllChunks } from "@/lib/db";
import { embed } from "@/lib/rag/embedder";
import { retrieveTopK } from "@/lib/rag/retrieve";

export function ChatView({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const router = useRouter();

  // RAG
  const [ragEnabled, setRagEnabled] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [ragStatus, setRagStatus] = useState<string | null>(null);
  // 发送前计算好的上下文，通过 prepareRequestBody 传给后端
  const ragContextRef = useRef<string | undefined>(undefined);

  const {
    messages,
    setMessages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop,
    reload,
    error,
    append,
  } = useChat({
    api: "/api/chat",
    maxSteps: 5,
    experimental_prepareRequestBody: ({ messages }) => ({
      messages,
      ragContext: ragContextRef.current,
    }),
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // 切换会话时从 IndexedDB 载入
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const rows = await loadMessages(conversationId);
      if (cancelled) return;
      setMessages(
        rows.map(
          (r) =>
            ({
              id: r.id,
              role: r.role as Message["role"],
              content: r.content,
              ...(r.parts ? { parts: r.parts as Message["parts"] } : {}),
            }) as Message,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, setMessages]);

  // 流式结束后落盘
  const lastPersistedCount = useRef(0);
  useEffect(() => {
    if (!conversationId) return;
    if (isStreaming) return;
    if (messages.length === 0) return;
    if (messages.length === lastPersistedCount.current) return;
    lastPersistedCount.current = messages.length;
    saveMessages(
      conversationId,
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        parts: (m as Message & { parts?: unknown }).parts,
      })),
    );
  }, [messages, isStreaming, conversationId]);

  // ---- 虚拟滚动 ----
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!atBottom) return;
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      align: "end",
      behavior: isStreaming ? "auto" : "smooth",
    });
  }, [messages.length, atBottom, isStreaming]);

  const lastContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    if (!isStreaming) return;
    if (!atBottom) return;
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      align: "end",
      behavior: "auto",
    });
  }, [lastContent, isStreaming, atBottom, messages.length]);

  /**
   * RAG 检索：本地 embedding + cosine top-k。
   * 发送前调用，把拼好的上下文塞进 ragContextRef，
   * 然后 experimental_prepareRequestBody 会把它带上去。
   */
  const prepareRagContext = useCallback(
    async (query: string): Promise<void> => {
      ragContextRef.current = undefined;
      if (!ragEnabled) return;
      const chunks = await loadAllChunks();
      if (chunks.length === 0) {
        setRagStatus("知识库为空");
        setTimeout(() => setRagStatus(null), 1500);
        return;
      }
      setRagStatus("检索知识库...");
      try {
        const q = await embed(query);
        const hits = retrieveTopK(q, chunks, 4);
        if (hits.length === 0) {
          setRagStatus(null);
          return;
        }
        const ctx = hits
          .map(
            (h, i) =>
              `[片段 ${i + 1}, 相似度 ${h.score.toFixed(2)}]\n${h.text}`,
          )
          .join("\n\n");
        ragContextRef.current = ctx;
        setRagStatus(`已注入 ${hits.length} 个片段`);
        setTimeout(() => setRagStatus(null), 2000);
      } catch (e) {
        setRagStatus(
          `检索失败：${e instanceof Error ? e.message : "未知错误"}`,
        );
        setTimeout(() => setRagStatus(null), 3000);
      }
    },
    [ragEnabled],
  );

  // 首条消息自动建会话
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (!conversationId) {
      const title = text.length > 24 ? text.slice(0, 24) + "…" : text;
      const conv = await createConversation(title);
      router.push(`/chat/${conv.id}`);
      sessionStorage.setItem(`pending:${conv.id}`, text);
      if (ragEnabled) sessionStorage.setItem(`pending-rag:${conv.id}`, "1");
      return;
    }
    await prepareRagContext(text);
    handleSubmit(e);
  };

  useEffect(() => {
    if (!conversationId) return;
    const key = `pending:${conversationId}`;
    const pending = sessionStorage.getItem(key);
    if (pending) {
      sessionStorage.removeItem(key);
      const ragKey = `pending-rag:${conversationId}`;
      const ragWas = sessionStorage.getItem(ragKey);
      sessionStorage.removeItem(ragKey);
      (async () => {
        if (ragWas === "1") {
          setRagEnabled(true);
          await prepareRagContext(pending);
        }
        append({ role: "user", content: pending });
      })();
    }
  }, [conversationId, append, prepareRagContext]);

  const renderItem = useCallback(
    (index: number) => {
      const m = messages[index];
      if (!m) return null;
      const streaming = isStreaming && index === messages.length - 1;
      return <MessageBubble message={m} isStreaming={streaming} />;
    },
    [messages, isStreaming],
  );

  const onSeed = async (n: number) => {
    if (!conversationId) {
      alert("请先新建一个会话");
      return;
    }
    await seedMessages(conversationId, n);
    const rows = await loadMessages(conversationId);
    setMessages(
      rows.map(
        (r) =>
          ({
            id: r.id,
            role: r.role as Message["role"],
            content: r.content,
          }) as Message,
      ),
    );
  };

  return (
    <div className="flex h-screen">
      <Sidebar activeId={conversationId} />

      <main className="mx-auto flex h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800">
          <span>
            {conversationId ? "ACM AI Agent" : "新对话"} · Claude Sonnet 4.6 ·
            工具：时间 / 计算器 / 联网搜索
          </span>
          <span className="flex items-center gap-2">
            <button
              onClick={() => setShowKnowledge((v) => !v)}
              className={`rounded px-2 py-0.5 ${
                showKnowledge
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              }`}
              title="打开/关闭知识库面板"
            >
              📎 知识库
            </button>
            {ragEnabled && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                RAG ON
              </span>
            )}
            {process.env.NODE_ENV === "development" && conversationId && (
              <>
                <button
                  onClick={() => onSeed(100)}
                  className="rounded bg-neutral-200 px-2 py-0.5 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  seed 100
                </button>
                <button
                  onClick={() => onSeed(10000)}
                  className="rounded bg-neutral-200 px-2 py-0.5 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  seed 10k
                </button>
              </>
            )}
          </span>
        </header>

        <div className="flex-1 overflow-hidden px-4">
          {messages.length === 0 ? (
            <div className="mt-24 space-y-2 text-center text-neutral-400">
              <div className="text-lg font-medium">有什么想聊的？</div>
              <div className="text-xs">
                试试：「今天几号」「(123+456)*78 等于多少」「Claude
                最近有什么新消息」
              </div>
            </div>
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: "100%" }}
              data={messages}
              computeItemKey={(_, m) => m.id}
              itemContent={(index) => renderItem(index)}
              initialTopMostItemIndex={Math.max(messages.length - 1, 0)}
              followOutput={false}
              atBottomStateChange={setAtBottom}
              atBottomThreshold={80}
              increaseViewportBy={{ top: 400, bottom: 400 }}
            />
          )}

          {error && (
            <div className="px-1 py-2">
              <div className="inline-block rounded-2xl bg-red-100 px-4 py-2.5 text-sm text-red-700">
                出错了：{error.message}
                <button onClick={() => reload()} className="ml-2 underline">
                  重试
                </button>
              </div>
            </div>
          )}
        </div>

        {ragStatus && (
          <div className="border-t border-neutral-200 bg-emerald-50 px-4 py-1 text-xs text-emerald-700 dark:border-neutral-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            {ragStatus}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="sticky bottom-0 flex gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            disabled={isStreaming}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            className="max-h-40 flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-xl bg-neutral-800 px-4 py-2.5 text-sm text-white hover:bg-neutral-700"
            >
              停止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
            >
              发送
            </button>
          )}
        </form>
      </main>

      {showKnowledge && (
        <KnowledgePanel
          enabled={ragEnabled}
          onToggle={setRagEnabled}
          onClose={() => setShowKnowledge(false)}
        />
      )}
    </div>
  );
}
