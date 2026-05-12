import type { StoredMessage } from "./types";
import { db } from "./db";

const SAMPLES = [
  "快速排序的平均时间复杂度是多少？",
  `快速排序的平均时间复杂度是 **O(n log n)**，最坏情况下是 O(n²)。

核心思想是分治：

\`\`\`ts
function quickSort(arr: number[]): number[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[0];
  const left = arr.slice(1).filter((x) => x < pivot);
  const right = arr.slice(1).filter((x) => x >= pivot);
  return [...quickSort(left), pivot, ...quickSort(right)];
}
\`\`\`

选取 pivot 的策略对性能影响很大，常见的有三数取中、随机化等。`,
  "React 18 的并发特性是什么？",
  `React 18 引入了 **concurrent rendering**，核心 API：

- \`startTransition\` — 将非紧急更新标记为低优先级
- \`useDeferredValue\` — 延迟响应某个值的变化
- \`useTransition\` — 在过渡期间显示 pending 状态
- Suspense 支持数据获取

这让长时间渲染不再阻塞交互，比如大列表筛选时保持输入框流畅。`,
  "解释一下 TCP 三次握手",
  `三次握手建立连接的过程：

1. 客户端发 SYN，seq=x
2. 服务端回 SYN+ACK，seq=y, ack=x+1
3. 客户端发 ACK，ack=y+1

设计成三次而不是两次，是为了**防止历史连接重新建立**——客户端能确认服务端收到了自己的 SYN。`,
  "帮我写一个节流函数",
  `\`\`\`ts
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args) => {
    const now = Date.now();
    const remain = wait - (now - last);
    if (remain <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remain);
    }
  };
}
\`\`\`

首尾都触发的版本。如果只要首次触发，删掉 \`setTimeout\` 分支即可。`,
];

export async function seedMessages(conversationId: string, count: number) {
  const now = Date.now();
  const rows: StoredMessage[] = [];
  for (let i = 0; i < count; i++) {
    const sampleIdx = i % SAMPLES.length;
    rows.push({
      id: `seed-${conversationId}-${i}-${now}`,
      conversationId,
      role: i % 2 === 0 ? "user" : "assistant",
      content: SAMPLES[sampleIdx],
      createdAt: now + i,
    });
  }
  await db.transaction("rw", db.messages, db.conversations, async () => {
    await db.messages.where("conversationId").equals(conversationId).delete();
    await db.messages.bulkAdd(rows);
    await db.conversations.update(conversationId, { updatedAt: now });
  });
}
