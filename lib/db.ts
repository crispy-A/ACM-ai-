import Dexie, { type EntityTable } from "dexie";
import type {
  Conversation,
  RagChunk,
  RagDocument,
  StoredMessage,
} from "./types";

class ChatDB extends Dexie {
  conversations!: EntityTable<Conversation, "id">;
  messages!: EntityTable<StoredMessage, "id">;
  ragDocuments!: EntityTable<RagDocument, "id">;
  ragChunks!: EntityTable<RagChunk, "id">;

  constructor() {
    super("acm-ai-chat");
    this.version(1).stores({
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt, [conversationId+createdAt]",
    });
    this.version(2).stores({
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt, [conversationId+createdAt]",
      ragDocuments: "id, createdAt",
      ragChunks: "id, documentId, [documentId+index]",
    });
  }
}

export const db = new ChatDB();

export async function createConversation(
  title = "新对话",
): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
  };
  await db.conversations.add(conv);
  return conv;
}

export async function renameConversation(id: string, title: string) {
  await db.conversations.update(id, { title, updatedAt: Date.now() });
}

export async function deleteConversation(id: string) {
  await db.transaction("rw", db.conversations, db.messages, async () => {
    await db.conversations.delete(id);
    await db.messages.where("conversationId").equals(id).delete();
  });
}

export async function saveMessages(
  conversationId: string,
  messages: Array<{
    id: string;
    role: string;
    content: string;
    parts?: unknown;
  }>,
) {
  const now = Date.now();
  const rows: StoredMessage[] = messages.map((m, i) => ({
    id: m.id,
    conversationId,
    role: m.role as StoredMessage["role"],
    content: m.content,
    parts: m.parts,
    createdAt: now + i,
  }));
  await db.transaction("rw", db.messages, db.conversations, async () => {
    await db.messages.where("conversationId").equals(conversationId).delete();
    await db.messages.bulkAdd(rows);
    await db.conversations.update(conversationId, { updatedAt: now });
  });
}

export async function loadMessages(
  conversationId: string,
): Promise<StoredMessage[]> {
  return db.messages
    .where("[conversationId+createdAt]")
    .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
    .toArray();
}

// ---------- RAG ----------

export async function addRagDocument(
  doc: Omit<RagDocument, "id" | "createdAt">,
  chunks: Array<Omit<RagChunk, "id" | "documentId">>,
): Promise<string> {
  const docId = crypto.randomUUID();
  const fullDoc: RagDocument = {
    ...doc,
    id: docId,
    createdAt: Date.now(),
  };
  const fullChunks: RagChunk[] = chunks.map((c) => ({
    ...c,
    id: `${docId}-${c.index}`,
    documentId: docId,
  }));
  await db.transaction("rw", db.ragDocuments, db.ragChunks, async () => {
    await db.ragDocuments.add(fullDoc);
    await db.ragChunks.bulkAdd(fullChunks);
  });
  return docId;
}

export async function deleteRagDocument(id: string) {
  await db.transaction("rw", db.ragDocuments, db.ragChunks, async () => {
    await db.ragDocuments.delete(id);
    await db.ragChunks.where("documentId").equals(id).delete();
  });
}

export async function listRagDocuments(): Promise<RagDocument[]> {
  return db.ragDocuments.orderBy("createdAt").reverse().toArray();
}

export async function loadAllChunks(): Promise<RagChunk[]> {
  return db.ragChunks.toArray();
}
