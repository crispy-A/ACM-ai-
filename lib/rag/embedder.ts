"use client";

import type { FeatureExtractionPipeline } from "@xenova/transformers";

// 浏览器里用的模型：all-MiniLM-L6-v2 (384 维)
// 首次加载会从 HuggingFace CDN 拉 ~25MB 的 onnx 权重，IndexedDB 自动缓存
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

export interface LoadProgress {
  /** 0-1 */
  progress: number;
  /** 下载的文件名或阶段描述 */
  stage: string;
}

/**
 * 返回加载好的 pipeline。全局单例，避免重复下载 / 载入模型。
 * 第一次调用会下载模型，通过 onProgress 回调给 UI 进度。
 */
export function getEmbedder(
  onProgress?: (p: LoadProgress) => void,
): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // 浏览器里禁用本地模型查找，强制走 HuggingFace CDN
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      return pipeline("feature-extraction", MODEL_ID, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (p: any) => {
          if (!onProgress) return;
          if (p.status === "progress" && typeof p.progress === "number") {
            onProgress({
              progress: p.progress / 100,
              stage: p.file ?? "加载模型",
            });
          } else if (p.status === "ready") {
            onProgress({ progress: 1, stage: "模型就绪" });
          } else if (p.status === "download") {
            onProgress({ progress: 0, stage: `下载 ${p.file ?? ""}` });
          }
        },
      });
    })();
  }
  return pipelinePromise;
}

/**
 * 把文本编码成 Float32Array（L2-normalized，可以直接做 cosine）。
 */
export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getEmbedder();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  // output.data 是 Float32Array
  return new Float32Array(output.data as Float32Array);
}

/**
 * 批量编码，串行跑（浏览器里并发 embedding 收益很小还更抖）。
 * onItem 会在每个 chunk 编码完成后触发，给 UI 做进度条。
 */
export async function embedMany(
  texts: string[],
  onItem?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    out.push(await embed(texts[i]));
    onItem?.(i + 1, texts.length);
  }
  return out;
}
