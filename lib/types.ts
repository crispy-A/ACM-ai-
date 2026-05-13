export type Role = "user" | "assistant" | "system";

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  /**
   * UIMessage.parts 的 JSON 序列化结果。
   * 用于恢复工具调用卡片、reasoning 等结构化信息。
   * 老记录可能没有这个字段，渲染时会 fallback 到 content。
   */
  parts?: unknown;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// ---------- RAG ----------

export interface RagDocument {
  id: string;
  name: string;
  /** 文件类型，md | txt */
  type: string;
  /** 原文件大小（字节） */
  size: number;
  chunkCount: number;
  createdAt: number;
}

export interface RagChunk {
  id: string;
  documentId: string;
  /** 在原文中的 chunk 序号 */
  index: number;
  text: string;
  /**
   * 向量数据，存为 ArrayBuffer（Float32Array 的 buffer）。
   * 比 number[] 节省 ~80% 空间，IndexedDB 读写也更快。
   */
  embedding: ArrayBuffer;
}
