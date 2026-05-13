import type { RagChunk } from "@/lib/types";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  text: string;
  score: number;
}

/**
 * 在一堆 chunk 里做 cosine 检索，返回前 topK。
 *
 * 向量在 IndexedDB 里是 ArrayBuffer 存的，读出来再转 Float32Array，
 * 比 number[] 省内存和传输时间。
 */
export function retrieveTopK(
  queryEmbedding: Float32Array,
  chunks: RagChunk[],
  topK = 4,
): RetrievedChunk[] {
  const scored: RetrievedChunk[] = [];
  for (const c of chunks) {
    const vec = new Float32Array(c.embedding);
    const score = cosineSimilarity(queryEmbedding, vec);
    scored.push({
      chunkId: c.id,
      documentId: c.documentId,
      text: c.text,
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * 向量已经 L2-normalized 时，cosine = dot product。
 * sentence-transformers 默认 mean_pool + L2-norm 已归一化，但这里
 * 保留完整实现以对非归一化向量也能用。
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
