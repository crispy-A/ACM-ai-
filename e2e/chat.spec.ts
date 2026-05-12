import { test, expect } from "@playwright/test";

test.describe("chat flow", () => {
  test("首次进入可发消息并看到 mock 回复", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("有什么想聊的")).toBeVisible();

    const input = page.getByPlaceholder(/输入消息/);
    await input.fill("hello from playwright");
    await input.press("Enter");

    // 应该跳到 /chat/[id]
    await page.waitForURL(/\/chat\/[a-f0-9-]+/i);

    // 用户消息
    await expect(page.getByText("hello from playwright")).toBeVisible();
    // mock 回复
    await expect(page.getByText(/收到你说的/)).toBeVisible({ timeout: 10_000 });
  });

  test("侧边栏显示新建的会话", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/输入消息/).fill("另一条会话");
    await page.getByPlaceholder(/输入消息/).press("Enter");
    await page.waitForURL(/\/chat\//);

    // 侧边栏出现新会话
    const aside = page.locator("aside");
    await expect(aside.getByText("另一条会话")).toBeVisible();
  });

  test("新建对话按钮会跳到新的空会话", async ({ page }) => {
    // 先发一条消息建立会话
    await page.goto("/");
    await page.getByPlaceholder(/输入消息/).fill("第一条");
    await page.getByPlaceholder(/输入消息/).press("Enter");
    await page.waitForURL(/\/chat\/([a-f0-9-]+)/i);
    await expect(page.getByText(/收到你说的/)).toBeVisible({ timeout: 10_000 });
    const firstUrl = page.url();

    // 点侧边栏的新建 → 跳到另一个 /chat/[id]，且没有消息
    await page.getByRole("button", { name: /新建对话/ }).click();
    await page.waitForURL(
      (url) => /\/chat\//.test(url.pathname) && url.href !== firstUrl,
    );
    await expect(page.getByText(/收到你说的/)).toHaveCount(0);
  });
});
