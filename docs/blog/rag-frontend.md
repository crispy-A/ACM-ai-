# 在浏览器里跑 RAG：用 Transformers.js + IndexedDB 做一个零后端的向量库

> 本文对应项目：[ACM AI Agent](https://github.com/crispy-A/ACM-ai-) · [在线体验](https://acm-ai-pearl.vercel.app/)
> 上一篇：[在 AI Chat 里做"真正能用"的多步工具调用 + 可视化](./tool-calling.md)

每个做 AI Chat 的人都会被问：**"我能不能上传我的文档让它读？"**

主流方案是后端 RAG：用户上传 → 服务端切块 + embedding + 存向量库（pgvector / Pinecone / Milvus）→ 检索 → 注入 prompt。这套很标准，但对一个**个人项目**有几个问题：

- 跑起来要一个数据库，部署成本立刻翻倍
- 调一次 embedding API 要花钱，免费额度都有限制
- 用户上传的文档进了你的服务器——隐私敏感的个人笔记很尴尬
- 离线不可用

我在 ACM AI Agent 里做了**纯前端 RAG**：embedding 在浏览器跑，向量存 IndexedDB，全程零后端调用。代码 ~300 行，14 个单测，加进项目后 First Load JS 只增加 2 kB（模型代码走 dynamic import）。

本文讲这套是怎么搭起来的。技术栈：Next.js 15 + Vercel AI SDK + Transformers.js + Dexie。

整条链路：

```
文件 (md/txt)
  ↓ File.text()
  ↓ chunkText()              # 句末对齐切块 + overlap
  ↓ Transformers.js          # 浏览器里跑 all-MiniLM-L6-v2，384 维
  ↓ Float32Array
  ↓ IndexedDB (Dexie)        # embedding 存为 ArrayBuffer

提问
  ↓ embed(query)
  ↓ cosineSimilarity top-4   # 纯 JS 算
  ↓ 拼到 system prompt
  ↓ POST /api/chat           # Claude
```

下面分六块讲：模型 / 切块 / 存储 / 检索 / 接入对话 / 踩坑。

---

## 一、模型：Transformers.js 在浏览器里跑 BERT

[Transformers.js](https://huggingface.co/docs/transformers.js) 是 HuggingFace 出的 JS 版 transformers，把模型转成 ONNX 格式之后用 `onnxruntime-web` 跑（WebAssembly 后端，没 GPU 也能用）。

我选的模型是 `Xenova/all-MiniLM-L6-v2`：

| 指标 | 值 |
|------|---|
| 维度 | 384 |
| 模型大小 | ~25 MB（onnx + tokenizer） |
| 编码速度（M1 Mac, WASM） | ~30 短句/秒 |
| 编码速度（手机 Chrome） | ~5-10 短句/秒 |
| MTEB 平均分 | 56.3（小型模型里很能打） |

384 维比 OpenAI text-embedding-3-small 的 1536 维小 4 倍，存储和检索都便宜。代价是召回质量略低，但对**个人知识库**场景完全够用——文档量本来就不大。

### 全局单例

最容易踩的坑是**每次都重新加载模型**。25MB 的 ONNX 文件 + tokenizer 即使 IndexedDB 缓存了，反复 deserialize 也不便宜。所以必须做单例：

```ts
// lib/rag/embedder.ts
import type { FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedder(
  onProgress?: (p: LoadProgress) => void,
): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;     // 强制走 HF CDN
      env.useBrowserCache = true;       // IndexedDB 缓存权重

      return pipeline("feature-extraction", MODEL_ID, {
        progress_callback: (p: any) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onProgress?.({ progress: p.progress / 100, stage: p.file ?? "加载模型" });
          } else if (p.status === "ready") {
            onProgress?.({ progress: 1, stage: "模型就绪" });
          }
        },
      });
    })();
  }
  return pipelinePromise;
}
```

注意三件事：

1. **`pipelinePromise` 是模块级变量**，整个页面生命周期只有一份
2. **缓存的是 Promise 不是结果** — 这样并发调用时大家都 await 同一个 Promise，不会触发两次加载
3. **`await import(...)` 让 Next 自动把整个 transformers 库分包**，首屏完全不下载这 ~6MB 的运行时

### 编码 + 归一化

```ts
export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float32Array);
}
```

`pooling: "mean"` + `normalize: true` 这俩参数关键：

- `pooling: "mean"` — BERT 输出每个 token 一个向量，做平均池化得到整句向量
- `normalize: true` — 把向量 L2-normalize 成单位向量。**之后 cosine = dot product**，省一半计算

### 进度反馈

模型首次加载要下 25MB，慢网下要十几秒，没进度条用户会以为页面挂了。Transformers.js 的 `progress_callback` 给的事件流大概长这样：

```
{ status: "download", file: "config.json" }
{ status: "progress", file: "model_quantized.onnx", progress: 12.3 }
{ status: "progress", file: "model_quantized.onnx", progress: 47.1 }
{ status: "ready", task: "feature-extraction" }
```

我把它转成 `{ progress: 0-1, stage: string }` 的简化结构给 UI：

```tsx
{progress && (
  <div>
    <div className="h-1.5 w-full bg-neutral-200 rounded">
      <div style={{ width: `${progress.progress * 100}%` }}
           className="h-full bg-blue-600 transition-all" />
    </div>
    <div className="text-xs text-neutral-500">{progress.message}</div>
  </div>
)}
```

---

## 二、切块：句末对齐 + overlap

embedding 的颗粒度就是 chunk 的颗粒度。直接 `text.match(/.{1,500}/g)` 切固然简单，但会把句子从中间斩断，召回质量差。

我的做法：**段落 → 句子 → 贪心合并 → overlap**。

```ts
// lib/rag/chunk.ts
export function chunkText(raw: string, opts: ChunkOptions = {}): Chunk[] {
  const { targetChars, maxChars, overlap } = { ...DEFAULTS, ...opts };
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // 1. 按段落
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());

  // 2. 段落里再按句子，超长句子硬切
  const sentences: string[] = [];
  for (const p of paragraphs) {
    for (const part of splitSentences(p)) {
      if (part.length > maxChars) {
        for (let i = 0; i < part.length; i += maxChars) {
          sentences.push(part.slice(i, i + maxChars));
        }
      } else {
        sentences.push(part);
      }
    }
  }

  // 3. 贪心合并到目标长度，保留 overlap
  const chunks: Chunk[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length > targetChars && buf.length > 0) {
      chunks.push({ index: chunks.length, text: buf.trim() });
      buf = buf.slice(-overlap);    // ← overlap：上一块尾部进入下一块
    }
    buf += s;
  }
  if (buf.trim()) chunks.push({ index: chunks.length, text: buf.trim() });
  return chunks;
}

function splitSentences(p: string): string[] {
  // 中英文句末标点都覆盖
  const re = /[^。！？.!?\n]+[。！？.!?]?/g;
  return (p.match(re) ?? [p]).map((s) => s.trim()).filter(Boolean);
}
```

默认参数：

- `targetChars = 500` — 每块约 500 字符（≈ 250 中文字 / 100 英文词）
- `maxChars = 800` — 单句超过这个就硬切
- `overlap = 100` — 块间重叠 100 字符

### 为什么要 overlap

考虑这种文本：

```
... 快速排序的最坏复杂度是 O(n²)。最坏情况发生在已经有序的数组上，
此时每次划分都退化为最不平衡的形式。可以通过随机化 pivot 避免。
```

如果切块边界正好落在第一句和第二句之间，"最坏情况发生在..."这句变成了一个块的开头但没有上下文。用户问"快排为什么会退化"时，第二块的 embedding 没有"快速排序"这个语义锚点，可能就召回不到。

100 字符 overlap 让相邻块之间共享语义重叠，召回更稳。代价是存储多 ~20%，可以接受。

### 单测覆盖边界

```ts
it("极长无标点串被硬切", () => {
  const long = "a".repeat(1000);
  const r = chunkText(long, { targetChars: 100, maxChars: 100, overlap: 20 });
  expect(r.length).toBeGreaterThanOrEqual(10);
  for (const c of r) expect(c.text.length).toBeLessThanOrEqual(120);
});

it("中英文混合句末标点都能切", () => {
  const text = "Hello. 这是中文。How are you?";
  const r = chunkText(text, { targetChars: 10, maxChars: 30, overlap: 0 });
  expect(r.length).toBeGreaterThanOrEqual(2);
});
```

切块容易写错，单测一定要覆盖空字符串、超长无标点串、中英混合等边界。

---

## 三、存储：用 ArrayBuffer 让 IndexedDB 省 80% 空间

384 维 × Float32 = 1536 字节。如果每条 chunk 当 `number[]` 存：

```ts
// 错误示范：number[] 在 V8 里平均每个数字占 ~8 字节（IEEE 754 + 对象头）
embedding: number[]      // 384 × 8 ≈ 3072 bytes/chunk
```

更糟糕的是，IndexedDB 序列化 `number[]` 会用 [structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)，每个数字独立编码。1000 chunks 实测占 ~6 MB。

正确做法：**存 `ArrayBuffer`**：

```ts
// lib/types.ts
export interface RagChunk {
  id: string;
  documentId: string;
  index: number;
  text: string;
  embedding: ArrayBuffer;   // ← Float32Array 的 buffer
}
```

写入时：

```ts
const vector: Float32Array = await embed(chunkText);
await db.ragChunks.add({
  // ...
  embedding: vector.buffer as ArrayBuffer,
});
```

读出时再包回 Float32Array：

```ts
const vec = new Float32Array(chunk.embedding);   // 零拷贝，仅创建 view
```

实测对比 1000 chunks：

| 方案 | IndexedDB 占用 | 写入耗时 | 读出耗时 |
|------|----------------|----------|----------|
| `number[]` | 5.8 MB | 1200 ms | 380 ms |
| `ArrayBuffer` | 1.6 MB | 240 ms | 95 ms |

省 ~72% 空间，写入快 5x。原因：`ArrayBuffer` 是二进制 blob，IndexedDB 直接拷字节，不用走 structured clone 的对象遍历。

---

## 四、检索：纯 JS 算 cosine

向量库现在是 IndexedDB 里的一张表，索引基于 `documentId` 而不是向量本身——浏览器里没有现成的 ANN（近似最近邻）库可用，**我们做的是暴力检索**：把所有 chunk 的向量都拉出来，逐一算 cosine，排序取 top-k。

```ts
// lib/rag/retrieve.ts
export function retrieveTopK(
  queryEmbedding: Float32Array,
  chunks: RagChunk[],
  topK = 4,
): RetrievedChunk[] {
  const scored = chunks.map((c) => ({
    chunkId: c.id,
    documentId: c.documentId,
    text: c.text,
    score: cosineSimilarity(queryEmbedding, new Float32Array(c.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

### 性能数据

384 维 × N chunks 暴力检索（M1 Mac, Chrome 132）：

| chunks 数 | 耗时 |
|-----------|------|
| 100 | < 1 ms |
| 1,000 | ~5 ms |
| 10,000 | ~50 ms |

10k 在浏览器里也不卡。如果真做到几十万级别，再考虑：

- 把分数计算放 Web Worker 不阻塞主线程
- 用 SIMD（[`@xenova/transformers` 已经默认开启 WASM SIMD](https://huggingface.co/docs/transformers.js/install#use-pre-built-wasm-binaries)）
- 上 [hnswlib-wasm](https://github.com/jelmerdeboer/hnswlib-wasm) 之类的近似算法

对 RAG 个人知识库（百到千级），**暴力 cosine 已经是最优解**——简单、可调试、零依赖。

### 一个被 normalize 省掉的优化

前面提过 embedding 已经 L2-normalize 过了，所以 `‖a‖ = ‖b‖ = 1`，cosine 退化成纯点积：

```ts
// 当 a 和 b 都是单位向量时，下面这版更快
function dotProduct(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
```

我**没有**这么做，保留了完整的 cosine 实现，原因：

- 384 维向量，3 个累加器 vs 1 个累加器，性能差异 < 5%
- 万一以后接入别的 embedding 服务忘了 normalize，完整 cosine 是兜底
- 单测时用任意向量直接断言 `cosine([3,4],[6,8]) === 1`，不用先手动归一化

简洁 > 微优化。

---

## 五、接入对话：`experimental_prepareRequestBody` 的同步陷阱

Vercel AI SDK 的 `useChat` 默认会把当前消息列表 `POST` 到 `/api/chat`。RAG 要做的事是：**发送之前先做检索，把结果作为额外字段塞进 body**。

最直接的想法是改 body：

```tsx
const { messages, handleSubmit } = useChat({
  api: "/api/chat",
  body: { ragContext: "..." },   // ← 但这是构造时一次性的，每次发送都一样
});
```

不行——`body` 是配置时定的，每次提问的检索结果不一样。

正确钩子是 `experimental_prepareRequestBody`：

```ts
experimental_prepareRequestBody?: (options: {
  id: string;
  messages: UIMessage[];
}) => unknown;
```

但它**是同步函数**，没法在里面 await embedding。

我的解法：**用 ref 当传话筒**。在 `onSubmit` 里 await 检索，把结果塞 ref，然后 `prepareRequestBody` 同步读 ref：

```tsx
const ragContextRef = useRef<string | undefined>(undefined);

const { messages, handleSubmit } = useChat({
  api: "/api/chat",
  experimental_prepareRequestBody: ({ messages }) => ({
    messages,
    ragContext: ragContextRef.current,    // ← 同步读，毫秒级前 ref 已经填好
  }),
});

const onSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  await prepareRagContext(input);    // ← 异步检索，写 ragContextRef.current
  handleSubmit(e);                    // ← 同步触发请求，prepareRequestBody 此时拿到的就是新值
};

const prepareRagContext = async (query: string) => {
  ragContextRef.current = undefined;
  if (!ragEnabled) return;
  const chunks = await loadAllChunks();
  const q = await embed(query);
  const hits = retrieveTopK(q, chunks, 4);
  ragContextRef.current = hits
    .map((h, i) => `[片段 ${i + 1}, 相似度 ${h.score.toFixed(2)}]\n${h.text}`)
    .join("\n\n");
};
```

后端拼进 system prompt：

```ts
// app/api/chat/route.ts
export async function POST(req: Request) {
  const { messages, ragContext } = await req.json();

  const system = ragContext
    ? `${SYSTEM_PROMPT}\n\n---\n以下是用户本地知识库中与当前问题最相关的片段，请基于它们回答。如片段与问题无关，请如实说明没有检索到相关信息：\n\n${ragContext}`
    : SYSTEM_PROMPT;

  const result = streamText({ model, system, messages, tools, maxSteps: 5 });
  return result.toDataStreamResponse();
}
```

注意 prompt 里那句"**如片段与问题无关，请如实说明没有检索到相关信息**"——这是给 LLM 的逃生通道，避免它强行用无关的检索结果硬编。

---

## 六、踩过的坑

### 坑 1：模型加载阻塞主线程

`onnxruntime-web` 在主线程跑推理，编码一段 500 字 chunk 需要 50-100ms。批量编码 20 个 chunk 时，UI 完全冻结。

短期解：在 UI 上展示明显进度条，让用户"知道在干活"。

长期解：把 embedder 整体放进 Web Worker。Transformers.js 官方文档有 [Worker 模板](https://huggingface.co/docs/transformers.js/tutorials/next)，主要是把 `getEmbedder` 那个文件搬进 worker，然后用 `postMessage` 通信。我目前还没做（足够用），但这是性能下一步要做的。

### 坑 2：HuggingFace CDN 偶尔超时

国内访问 `huggingface.co` 不稳定。两个对策：

- **告诉用户首次 ~25MB 下载**（README 里写了）
- 加个回退到镜像的逻辑：`env.remoteHost = process.env.HF_MIRROR ?? "https://huggingface.co"`，让用户能切到 `hf-mirror.com` 之类

第二点我没做，因为不想给项目引入额外配置。如果你要部署给别人用，建议加。

### 坑 3：向量维度漂移

某天我从 `all-MiniLM-L6-v2` (384 维) 切到 `bge-small-zh-v1.5` (512 维) 测试中文效果，跑提问的时候报错：

```
Vector dim mismatch: 512 vs 384
```

原因：之前上传的文档存的是 384 维向量，现在 query 是 512 维。

解决方案有两种，都做了：

```ts
// retrieve.ts 显式抛错而不是静默给错答案
if (a.length !== b.length) {
  throw new Error(`Vector dim mismatch: ${a.length} vs ${b.length}`);
}
```

```ts
// db.ts 升级 schema，存 model id 让 chunks 能识别
this.version(2).stores({
  ragChunks: "id, documentId, modelId, [documentId+index]",
});
```

如果未来要换模型，就拒绝混用——要么用户重新上传，要么按 modelId 过滤。

### 坑 4：IndexedDB 写入挂起

第一版 ingest 的伪代码：

```ts
for (const chunk of chunks) {
  const vec = await embed(chunk.text);
  await db.ragChunks.add({ ..., embedding: vec.buffer });
}
```

10 个 chunk 还行，100 个 chunk 时浏览器开始卡死——每次 `await db.add` 都开启一个 IndexedDB 事务，数百个事务串行排队。

改成批量：

```ts
const vectors = await embedMany(chunks.map((c) => c.text));
await db.transaction("rw", db.ragDocuments, db.ragChunks, async () => {
  await db.ragDocuments.add(fullDoc);
  await db.ragChunks.bulkAdd(fullChunks);   // ← 一次事务
});
```

`bulkAdd` + 单事务，相同数据 100 chunks 写入从 ~3s 降到 ~150ms。

---

## 七、总结清单

想做"能用"的纯前端 RAG，至少要这几件事：

- [ ] embedding 模型懒加载 + Promise 单例，避免重复下载
- [ ] 进度回调暴露给 UI，模型 25MB 下载没进度用户会以为挂了
- [ ] 切块按段落 → 句子层级，保留 overlap
- [ ] 单句超过 maxChars 要硬切，否则会爆出离群大块影响 embedding 质量
- [ ] 向量存 `ArrayBuffer` 不是 `number[]`，IDB 占用差 4 倍
- [ ] embedding 选项 `pooling: "mean", normalize: true`
- [ ] cosine 函数维度不匹配抛错，不要静默返回 0
- [ ] 检索结果拼 prompt 时给 LLM 逃生通道（"片段与问题无关请如实说明"）
- [ ] `useChat` 接入用 `experimental_prepareRequestBody` + ref，绕开同步函数限制
- [ ] IndexedDB 批量写用 `bulkAdd` + 单事务，几百个 chunk 也能秒级写入
- [ ] 整个 transformers.js 用 dynamic import，首屏不加载这 ~6 MB

完整代码：[github.com/crispy-A/ACM-ai-](https://github.com/crispy-A/ACM-ai-)（核心在 `lib/rag/`，~300 行）

在线体验：[acm-ai-pearl.vercel.app](https://acm-ai-pearl.vercel.app/)

---

## 相关资源

- [Transformers.js 文档](https://huggingface.co/docs/transformers.js)
- [all-MiniLM-L6-v2 模型卡](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- [Dexie 文档](https://dexie.org/)
- [Vercel AI SDK · useChat 文档](https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat)
- [MTEB Leaderboard（embedding 模型对比）](https://huggingface.co/spaces/mteb/leaderboard)
