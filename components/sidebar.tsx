"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createConversation,
  db,
  deleteConversation,
  renameConversation,
} from "@/lib/db";

export function Sidebar({ activeId }: { activeId: string | null }) {
  const router = useRouter();
  const conversations = useLiveQuery(
    () => db.conversations.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const onNew = async () => {
    const conv = await createConversation();
    router.push(`/chat/${conv.id}`);
  };

  const onDelete = async (id: string) => {
    if (!confirm("确定删除这个会话？")) return;
    await deleteConversation(id);
    if (id === activeId) router.push("/");
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setDraftTitle(current);
  };

  const commitRename = async (id: string) => {
    const t = draftTitle.trim();
    if (t) await renameConversation(id, t);
    setEditingId(null);
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-100/50 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新建对话
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations?.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-neutral-400">
            还没有对话
          </div>
        )}
        {conversations?.map((c) => {
          const active = c.id === activeId;
          const editing = c.id === editingId;
          return (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                active
                  ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"
                  : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60"
              }`}
            >
              {editing ? (
                <input
                  value={draftTitle}
                  autoFocus
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 rounded bg-white px-1 py-0.5 text-sm outline-none dark:bg-neutral-800"
                />
              ) : (
                <button
                  onClick={() => router.push(`/chat/${c.id}`)}
                  onDoubleClick={() => startRename(c.id, c.title)}
                  className="flex-1 truncate text-left"
                  title="双击重命名"
                >
                  {c.title}
                </button>
              )}
              {!editing && (
                <button
                  onClick={() => onDelete(c.id)}
                  className="opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                  aria-label="删除"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-neutral-200 px-3 py-2 text-[11px] text-neutral-400 dark:border-neutral-800">
        本地存储 · IndexedDB
      </div>
    </aside>
  );
}
