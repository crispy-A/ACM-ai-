import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// 每个用例前用一个新的 IDBFactory 保证测试之间不串
beforeEach(async () => {
  const mod = await import("fake-indexeddb");
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB =
    new mod.IDBFactory();
});
