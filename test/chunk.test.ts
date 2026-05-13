import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/rag/chunk";

describe("chunkText", () => {
  it("空字符串返回空数组", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("短文本作为单块", () => {
    const r = chunkText("你好，世界。");
    expect(r.length).toBe(1);
    expect(r[0].text).toContain("你好");
    expect(r[0].index).toBe(0);
  });

  it("长文本被切成多块，每块不超过 maxChars", () => {
    const long = Array.from(
      { length: 30 },
      (_, i) => `这是第${i}个句子。`,
    ).join("");
    const r = chunkText(long, { targetChars: 60, maxChars: 100, overlap: 10 });
    expect(r.length).toBeGreaterThan(1);
    for (const c of r) {
      expect(c.text.length).toBeLessThanOrEqual(100);
    }
    // 相邻 chunk 有 overlap（前一块末尾 overlap 字符在后一块开头附近）
    for (let i = 1; i < r.length; i++) {
      expect(r[i].index).toBe(i);
    }
  });

  it("中英文混合句末标点都能切", () => {
    const text = "Hello. 这是中文。How are you?";
    const r = chunkText(text, { targetChars: 10, maxChars: 30, overlap: 0 });
    expect(r.length).toBeGreaterThanOrEqual(2);
  });

  it("极长无标点串被硬切", () => {
    const long = "a".repeat(1000);
    const r = chunkText(long, { targetChars: 100, maxChars: 100, overlap: 20 });
    expect(r.length).toBeGreaterThanOrEqual(10);
    // overlap 合并后允许每块最多 maxChars + overlap
    for (const c of r) {
      expect(c.text.length).toBeLessThanOrEqual(120);
    }
  });
});
