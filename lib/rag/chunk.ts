/**
 * 简单但够用的文本切块器：
 * - 优先按段落（\n\n）分，再按句子（。！？. ! ?）分
 * - 每块目标 ~500 字符，上限 800 字符（防止单个长段落爆块）
 * - 块间保留 100 字符 overlap，减少语义被切断时的信息丢失
 *
 * 如果一个句子本身就超过 maxChars，会被硬切成多个块。
 */
export interface ChunkOptions {
  targetChars?: number;
  maxChars?: number;
  overlap?: number;
}

export interface Chunk {
  index: number;
  text: string;
}

const DEFAULTS: Required<ChunkOptions> = {
  targetChars: 500,
  maxChars: 800,
  overlap: 100,
};

export function chunkText(raw: string, opts: ChunkOptions = {}): Chunk[] {
  const { targetChars, maxChars, overlap } = { ...DEFAULTS, ...opts };
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // 1. 按段落切
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  // 2. 把段落进一步按句子切碎，保证没有单元素超过 maxChars
  const sentences: string[] = [];
  for (const p of paragraphs) {
    const parts = splitSentences(p);
    for (const part of parts) {
      if (part.length > maxChars) {
        // 极长句子硬切
        for (let i = 0; i < part.length; i += maxChars) {
          sentences.push(part.slice(i, i + maxChars));
        }
      } else {
        sentences.push(part);
      }
    }
  }

  // 3. 贪心合并到目标长度
  const chunks: Chunk[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length > targetChars && buf.length > 0) {
      chunks.push({ index: chunks.length, text: buf.trim() });
      // 保留 overlap：从上一个 chunk 尾部切 overlap 个字符作为下一个 chunk 的开头
      buf = buf.slice(-overlap);
    }
    buf += s;
  }
  if (buf.trim()) chunks.push({ index: chunks.length, text: buf.trim() });

  return chunks;
}

function splitSentences(p: string): string[] {
  // 匹配中英文句末标点，保留标点
  const re = /[^。！？.!?\n]+[。！？.!?]?/g;
  const matches = p.match(re);
  if (!matches) return [p];
  return matches.map((s) => s.trim()).filter(Boolean);
}
