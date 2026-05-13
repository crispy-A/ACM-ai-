"use client";

import { addRagDocument } from "@/lib/db";
import { chunkText } from "./chunk";
import { embedMany } from "./embedder";

export interface IngestProgress {
  phase: "reading" | "chunking" | "embedding" | "saving" | "done";
  /** 0-1 */
  progress: number;
  message: string;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

export async function ingestFile(
  file: File,
  onProgress?: (p: IngestProgress) => void,
): Promise<IngestResult> {
  const emit = (p: IngestProgress) => onProgress?.(p);

  emit({ phase: "reading", progress: 0, message: "读取文件..." });
  const text = await file.text();

  emit({ phase: "chunking", progress: 0.1, message: "切分文本..." });
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error("文件为空或无有效内容");
  }

  emit({
    phase: "embedding",
    progress: 0.2,
    message: `生成向量 (0/${chunks.length})`,
  });
  const vectors = await embedMany(
    chunks.map((c) => c.text),
    (done, total) => {
      emit({
        phase: "embedding",
        progress: 0.2 + 0.7 * (done / total),
        message: `生成向量 (${done}/${total})`,
      });
    },
  );

  emit({ phase: "saving", progress: 0.95, message: "写入本地数据库..." });
  const documentId = await addRagDocument(
    {
      name: file.name,
      type: file.name.endsWith(".md") ? "md" : "txt",
      size: file.size,
      chunkCount: chunks.length,
    },
    chunks.map((c, i) => ({
      index: c.index,
      text: c.text,
      embedding: vectors[i].buffer as ArrayBuffer,
    })),
  );

  emit({ phase: "done", progress: 1, message: "完成" });
  return { documentId, chunkCount: chunks.length };
}
