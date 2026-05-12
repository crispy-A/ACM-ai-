import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACM AI Agent",
  description: "A personal AI chat agent built with Next.js + Vercel AI SDK",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
