import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

function createTestStorage() {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

const testLocalStorage = createTestStorage();
const testSessionStorage = createTestStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testLocalStorage,
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: testSessionStorage,
});

beforeEach(() => {
  testLocalStorage.clear();
  testSessionStorage.clear();
});
