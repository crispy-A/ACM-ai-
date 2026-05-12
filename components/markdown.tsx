"use client";

import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === "string" ? children : extractText(children);

  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-neutral-800 bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs text-neutral-400">
        <span>{language || "text"}</span>
        <button
          onClick={onCopy}
          className="rounded px-2 py-0.5 hover:bg-neutral-800"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className={`language-${language} hljs`}>{children}</code>
      </pre>
    </div>
  );
}

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractText((node as any).props?.children);
  }
  return "";
}

export const Markdown = memo(function Markdown({
  content,
}: {
  content: string;
}) {
  return (
    <div className="prose-custom">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code(props) {
            const { className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const isBlock = !!match;
            if (!isBlock) {
              return (
                <code
                  className="rounded bg-neutral-200 px-1 py-0.5 text-[0.9em] dark:bg-neutral-800"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match[1]}>{children}</CodeBlock>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
