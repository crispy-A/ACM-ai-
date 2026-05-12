import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolInvocationCard } from "@/components/tool-invocation-card";
import type { ToolInvocation } from "ai";

const makeCalc = (state: "call" | "result"): ToolInvocation =>
  state === "result"
    ? {
        state: "result",
        toolCallId: "t1",
        toolName: "calculator",
        args: { expression: "1+1" },
        result: { expression: "1+1", value: 2 },
      }
    : {
        state: "call",
        toolCallId: "t1",
        toolName: "calculator",
        args: { expression: "1+1" },
      };

describe("ToolInvocationCard", () => {
  it("渲染工具名和参数预览", () => {
    render(<ToolInvocationCard invocation={makeCalc("result")} />);
    expect(screen.getByText("计算器")).toBeInTheDocument();
    expect(screen.getByText("1+1")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
  });

  it("call 状态显示 '调用中'", () => {
    render(<ToolInvocationCard invocation={makeCalc("call")} />);
    expect(screen.getByText("调用中...")).toBeInTheDocument();
  });

  it("点击可展开查看结果 JSON", () => {
    render(<ToolInvocationCard invocation={makeCalc("result")} />);
    // 折叠态没有 "结果" 标题
    expect(screen.queryByText("结果")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("计算器"));
    expect(screen.getByText("结果")).toBeInTheDocument();
    expect(screen.getByText("参数")).toBeInTheDocument();
  });

  it("web_search 特殊渲染结果列表", () => {
    const invocation: ToolInvocation = {
      state: "result",
      toolCallId: "t2",
      toolName: "web_search",
      args: { query: "react 19" },
      result: {
        query: "react 19",
        answer: "React 19 是...",
        results: [
          {
            title: "React v19 Release",
            url: "https://react.dev",
            snippet: "New features ...",
          },
        ],
      },
    };
    render(<ToolInvocationCard invocation={invocation} />);
    fireEvent.click(screen.getByText("联网搜索"));
    expect(screen.getByText("React v19 Release")).toBeInTheDocument();
    expect(screen.getByText(/React 19 是/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /React v19/i });
    expect(link).toHaveAttribute("href", "https://react.dev");
  });
});
