"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { db, deleteRagDocument } from "@/lib/db";
import { ingestFile, type IngestProgress } from "@/lib/rag/ingest";

export function KnowledgePanel({
  enabled,
  onToggle,
  onClose,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onClose: () => void;
}) {
  const docs = useLiveQuery(
    () => db.ragDocuments.orderBy("createdAt").reverse().toArray(),
    [],
    [],
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      for (const f of Array.from(files)) {
        if (!/\.(md|txt|markdown)$/i.test(f.name)) {
          throw new Error(`${f.name}：仅支持 .md / .txt`);
        }
        await ingestFile(f, setProgress);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`删除「${name}」及其索引？`)) return;
    await deleteRagDocument(id);
  };

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <span className="text-sm font-medium">📎 知识库 (RAG)</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          aria-label="关闭"
        >
          ✕
        </button>
      </header>

      <div className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>本次对话使用检索增强</span>
        </label>
        <div className="mt-1 text-[11px] text-neutral-500">
          开启后每次提问会先检索知识库，把最相关的片段喂给模型
        </div>
      </div>

      <div className="border-b border-neutral-200 p-3 dark:border-neutral-800">
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt"
          multiple
          disabled={!!progress}
          onChange={(e) => onUpload(e.target.files)}
          className="block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-blue-600 file:px-2 file:py-1 file:text-white hover:file:bg-blue-700 disabled:opacity-50"
        />
        {progress && (
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${progress.progress * 100}%` }}
              />
            </div>
            <div className="text-[11px] text-neutral-500">
              {progress.message}
            </div>
          </div>
        )}
        {error && (
          <div className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}
        {!progress && !error && (
          <div className="mt-1 text-[11px] text-neutral-500">
            支持 .md / .txt，首次使用会下载 ~25MB 本地模型
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {docs?.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-neutral-400">
            还没有文档
          </div>
        )}
        {docs?.map((d) => (
          <div
            key={d.id}
            className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
          >
            <div className="flex-1 overflow-hidden">
              <div className="truncate text-sm">{d.name}</div>
              <div className="text-[11px] text-neutral-500">
                {d.chunkCount} 个片段 · {formatSize(d.size)}
              </div>
            </div>
            <button
              onClick={() => onDelete(d.id, d.name)}
              className="opacity-0 transition hover:text-red-500 group-hover:opacity-100"
              aria-label="删除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
