import { describe, it, expect, beforeEach } from "vitest";
import {
  createConversation,
  deleteConversation,
  loadMessages,
  renameConversation,
  saveMessages,
  db,
} from "@/lib/db";

beforeEach(async () => {
  // 每个用例前清空
  await db.conversations.clear();
  await db.messages.clear();
});

describe("conversations CRUD", () => {
  it("创建会话时填充 id/title/时间戳", async () => {
    const c = await createConversation("你好");
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(c.title).toBe("你好");
    expect(c.createdAt).toBeLessThanOrEqual(Date.now());
    expect(c.updatedAt).toBe(c.createdAt);
  });

  it("重命名会更新 title 和 updatedAt", async () => {
    const c = await createConversation("old");
    await new Promise((r) => setTimeout(r, 2));
    await renameConversation(c.id, "new");
    const row = await db.conversations.get(c.id);
    expect(row?.title).toBe("new");
    expect(row!.updatedAt).toBeGreaterThan(c.updatedAt);
  });

  it("删除会话会连带删除它的消息", async () => {
    const c = await createConversation("x");
    await saveMessages(c.id, [
      { id: "m1", role: "user", content: "hi" },
      { id: "m2", role: "assistant", content: "hello" },
    ]);
    await deleteConversation(c.id);
    expect(await db.conversations.get(c.id)).toBeUndefined();
    expect((await loadMessages(c.id)).length).toBe(0);
  });
});

describe("messages persistence", () => {
  it("saveMessages 覆盖旧记录而不是追加", async () => {
    const c = await createConversation("x");
    await saveMessages(c.id, [{ id: "m1", role: "user", content: "v1" }]);
    await saveMessages(c.id, [
      { id: "m1", role: "user", content: "v2" },
      { id: "m2", role: "assistant", content: "hi" },
    ]);
    const rows = await loadMessages(c.id);
    expect(rows.length).toBe(2);
    expect(rows[0].content).toBe("v2");
  });

  it("loadMessages 按 createdAt 返回", async () => {
    const c = await createConversation("x");
    await saveMessages(c.id, [
      { id: "a", role: "user", content: "1" },
      { id: "b", role: "assistant", content: "2" },
      { id: "c", role: "user", content: "3" },
    ]);
    const rows = await loadMessages(c.id);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("不同会话的消息互不影响", async () => {
    const c1 = await createConversation("a");
    const c2 = await createConversation("b");
    await saveMessages(c1.id, [{ id: "x", role: "user", content: "in c1" }]);
    await saveMessages(c2.id, [{ id: "y", role: "user", content: "in c2" }]);
    expect((await loadMessages(c1.id))[0].content).toBe("in c1");
    expect((await loadMessages(c2.id))[0].content).toBe("in c2");
  });

  it("保留 parts 字段并可恢复", async () => {
    const c = await createConversation("x");
    const parts = [
      { type: "text", text: "答案是 42" },
      {
        type: "tool-invocation",
        toolInvocation: { state: "result", toolName: "calculator" },
      },
    ];
    await saveMessages(c.id, [
      { id: "m1", role: "assistant", content: "答案是 42", parts },
    ]);
    const [row] = await loadMessages(c.id);
    expect(row.parts).toEqual(parts);
  });
});
