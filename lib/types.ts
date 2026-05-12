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
