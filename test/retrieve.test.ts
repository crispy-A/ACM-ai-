import { describe, it, expect } from "vitest";
import { cosineSimilarity, retrieveTopK } from "@/lib/rag/retrieve";
import type { RagChunk } from "@/lib/types";

function makeVec(values: number[]): Float32Array {
  return new Float32Array(values);
}

function makeChunk(id: string, text: string, values: number[]): RagChunk {
  const v = makeVec(values);
  return {
    id,
    documentId: "doc1",
    index: 0,
    text,
    embedding: v.buffer as ArrayBuffer,
  };
}

describe("cosineSimilarity", () => {
  it("同向量相似度 = 1", () => {
    const v = makeVec([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it("正交向量相似度 = 0", () => {
    expect(cosineSimilarity(makeVec([1, 0]), makeVec([0, 1]))).toBe(0);
  });

  it("反向向量相似度 = -1", () => {
    expect(cosineSimilarity(makeVec([1, 0]), makeVec([-1, 0]))).toBeCloseTo(-1);
  });

  it("对向量长度不敏感（归一化）", () => {
    const a = makeVec([3, 4]); // |a| = 5
    const b = makeVec([6, 8]); // 同方向 |b| = 10
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it("维度不匹配会抛错", () => {
    expect(() => cosineSimilarity(makeVec([1, 2]), makeVec([1, 2, 3]))).toThrow(
      /dim mismatch/i,
    );
  });

  it("零向量返回 0 不返回 NaN", () => {
    expect(cosineSimilarity(makeVec([0, 0]), makeVec([1, 1]))).toBe(0);
  });
});

describe("retrieveTopK", () => {
  it("按相似度降序返回 top-k", () => {
    const query = makeVec([1, 0]);
    const chunks = [
      makeChunk("c1", "无关", [0, 1]),
      makeChunk("c2", "最相关", [1, 0]),
      makeChunk("c3", "部分相关", [0.7, 0.3]),
    ];
    const hits = retrieveTopK(query, chunks, 2);
    expect(hits.length).toBe(2);
    expect(hits[0].chunkId).toBe("c2");
    expect(hits[1].chunkId).toBe("c3");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("空输入返回空", () => {
    expect(retrieveTopK(makeVec([1, 0]), [], 5)).toEqual([]);
  });

  it("topK 大于可用时返回所有", () => {
    const chunks = [makeChunk("c1", "a", [1, 0]), makeChunk("c2", "b", [0, 1])];
    expect(retrieveTopK(makeVec([1, 0]), chunks, 10).length).toBe(2);
  });
});
