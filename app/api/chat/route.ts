import { createAnthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  type UIMessage,
  convertToCoreMessages,
  formatDataStreamPart,
} from "ai";
import { tools } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL, // 不填则走官方 https://api.anthropic.com/v1
});

const SYSTEM_PROMPT = `你是一个乐于助人、直接、简洁的中文 AI 助手。
- 回答技术问题时给出可运行的代码示例
- 不确定的事情就说不确定，不要编造
- 代码用 markdown 代码块，并标明语言

你可以调用以下工具：
- get_current_time: 当用户问"现在几点 / 今天几号 / 星期几"时使用
- calculator: 涉及数值计算时使用，不要自己心算
- web_search: 遇到时效性问题（最新新闻、版本号、最近事件）时使用

工具调用后，基于返回结果自然地用中文回答用户，不要复述 JSON。`;

export async function POST(req: Request) {
  const {
    messages,
    ragContext,
  }: { messages: UIMessage[]; ragContext?: string } = await req.json();

  // 测试环境下返回伪造数据流，避免消耗 API 配额
  if (process.env.MOCK_LLM === "1") {
    return mockStream(messages);
  }

  const system = ragContext
    ? `${SYSTEM_PROMPT}\n\n---\n以下是用户本地知识库中与当前问题最相关的片段，请基于它们回答。如片段与问题无关，请如实说明没有检索到相关信息，然后凭常识作答：\n\n${ragContext}`
    : SYSTEM_PROMPT;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system,
    messages: convertToCoreMessages(messages),
    tools,
    maxSteps: 5,
    toolCallStreaming: true,
  });

  return result.toDataStreamResponse();
}

function mockStream(messages: UIMessage[]): Response {
  const last = messages[messages.length - 1];
  const lastText =
    typeof last?.content === "string" ? last.content : "(no text)";
  const reply = `收到你说的：「${lastText}」。这是 mock 回复。`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          formatDataStreamPart("start_step", { messageId: "mock-1" }),
        ),
      );
      for (const ch of reply) {
        controller.enqueue(encoder.encode(formatDataStreamPart("text", ch)));
        await new Promise((r) => setTimeout(r, 2));
      }
      controller.enqueue(
        encoder.encode(
          formatDataStreamPart("finish_step", {
            isContinued: false,
            finishReason: "stop",
            usage: { promptTokens: 1, completionTokens: 1 },
          }),
        ),
      );
      controller.enqueue(
        encoder.encode(
          formatDataStreamPart("finish_message", {
            finishReason: "stop",
            usage: { promptTokens: 1, completionTokens: 1 },
          }),
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-vercel-ai-data-stream": "v1",
    },
  });
}
