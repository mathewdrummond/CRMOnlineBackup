import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

function createFetchResponse(body = { status: "ok" }) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createFetchErrorResponse(status, body) {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

async function flushRuntimeWork() {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
  await Promise.resolve();
}

describe("localApiClient runtime lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    Object.defineProperty(window, "localStorage", {
      value: createStorageMock(),
      configurable: true,
    });
    global.fetch = vi.fn().mockResolvedValue(createFetchResponse());
  });

  afterEach(async () => {
    try {
      const apiModule = await import("./localApiClient.js");
      apiModule.stopApiRuntime();
    } catch {
      // Ignore module cleanup failures after resetModules.
    }

    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete global.fetch;
  });

  test("does not start the heartbeat on import", async () => {
    window.localStorage.setItem("crmApi-api-status", JSON.stringify({
      connected: false,
      queueCount: 0,
      lastError: "offline",
      lastSuccessfulAt: null,
    }));

    await import("./localApiClient.js");
    await vi.advanceTimersByTimeAsync(15000);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("starts and stops the heartbeat through explicit runtime control", async () => {
    window.localStorage.setItem("crmApi-api-status", JSON.stringify({
      connected: false,
      queueCount: 0,
      lastError: "offline",
      lastSuccessfulAt: null,
    }));
    global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const apiModule = await import("./localApiClient.js");
    const cleanup = apiModule.startApiRuntime();

    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    global.fetch.mockClear();
    await vi.advanceTimersByTimeAsync(15000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    cleanup();
    global.fetch.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("blocks test-auth login when the build flag is disabled", async () => {
    const apiModule = await import("./localApiClient.js");

    await expect(apiModule.crmApi.auth.loginAsTestUser("admin@example.test", "admin")).rejects.toMatchObject({
      payload: { code: "test_auth_disabled" },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches the current row_version before updating a record that is not cached", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse({
        id: "contact-1",
        first_name: "Current",
        row_version: 3,
      }))
      .mockResolvedValueOnce(createFetchResponse({
        id: "contact-1",
        first_name: "Updated",
        row_version: 4,
      }));

    const apiModule = await import("./localApiClient.js");

    await expect(apiModule.crmApi.entities.Contact.update("contact-1", {
      first_name: "Updated",
    })).resolves.toMatchObject({
      id: "contact-1",
      first_name: "Updated",
      row_version: 4,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain("/api/entities/Contact/contact-1");
    expect(global.fetch.mock.calls[1][0]).toContain("/api/entities/Contact/contact-1");
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toMatchObject({
      first_name: "Updated",
      row_version: 3,
    });
  });

  test("does not queue an offline update when the current row_version is unknown", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const apiModule = await import("./localApiClient.js");

    await expect(apiModule.crmApi.entities.Contact.update("contact-1", {
      first_name: "Offline",
    })).rejects.toMatchObject({
      payload: { code: "row_version_required" },
    });

    expect(JSON.parse(window.localStorage.getItem("crmApi-mutation-queue") || "[]")).toHaveLength(0);
  });

  test("does not queue an offline delete when the current row_version is unknown", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const apiModule = await import("./localApiClient.js");

    await expect(apiModule.crmApi.entities.Contact.delete("contact-1")).rejects.toMatchObject({
      payload: { code: "row_version_required" },
    });

    expect(JSON.parse(window.localStorage.getItem("crmApi-mutation-queue") || "[]")).toHaveLength(0);
  });

  test("rejects malformed row_version payloads before sending updates", async () => {
    const apiModule = await import("./localApiClient.js");

    await expect(apiModule.crmApi.entities.Contact.update("contact-1", {
      first_name: "Updated",
      row_version: "3",
    })).rejects.toMatchObject({
      payload: { code: "invalid_entity_payload" },
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("drops a queued offline update on row_version conflict and refreshes the cached record", async () => {
    window.localStorage.setItem("crmApi-cache-entity:Contact", JSON.stringify([
      {
        id: "contact-1",
        first_name: "Offline Edit",
        row_version: 2,
        _pending_sync: true,
      },
    ]));
    window.localStorage.setItem("crmApi-mutation-queue", JSON.stringify([
      {
        type: "update",
        entity: "Contact",
        recordId: "contact-1",
        payload: {
          first_name: "Offline Edit",
          row_version: 1,
        },
        queuedAt: "2026-04-01T00:00:00.000Z",
      },
    ]));

    const currentRecord = {
      id: "contact-1",
      first_name: "Server Version",
      row_version: 2,
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse({ status: "ok" }))
      .mockResolvedValueOnce(createFetchErrorResponse(409, {
        code: "row_version_conflict",
        error: "Record changed elsewhere.",
        current_record: currentRecord,
      }));

    const apiModule = await import("./localApiClient.js");
    const cleanup = apiModule.startApiRuntime();
    await flushRuntimeWork();
    cleanup();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain("/api/entities/Contact/contact-1");
    expect(global.fetch.mock.calls[1][1].method).toBe("PUT");
    expect(JSON.parse(window.localStorage.getItem("crmApi-mutation-queue") || "[]")).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem("crmApi-cache-entity:Contact") || "[]")).toEqual([
      expect.objectContaining(currentRecord),
    ]);
    expect(apiModule.getApiStatus().queueCount).toBe(0);
  });

  test("drops a queued offline delete on row_version conflict and restores the current server record", async () => {
    window.localStorage.setItem("crmApi-cache-entity:Contact", JSON.stringify([]));
    window.localStorage.setItem("crmApi-mutation-queue", JSON.stringify([
      {
        type: "delete",
        entity: "Contact",
        recordId: "contact-1",
        payload: {
          row_version: 1,
        },
        queuedAt: "2026-04-01T00:00:00.000Z",
      },
    ]));

    const currentRecord = {
      id: "contact-1",
      first_name: "Restored Server Version",
      row_version: 2,
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse({ status: "ok" }))
      .mockResolvedValueOnce(createFetchErrorResponse(409, {
        code: "row_version_conflict",
        error: "Record changed elsewhere.",
        current_record: currentRecord,
      }));

    const apiModule = await import("./localApiClient.js");
    const cleanup = apiModule.startApiRuntime();
    await flushRuntimeWork();
    cleanup();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain("/api/entities/Contact/contact-1?row_version=1");
    expect(global.fetch.mock.calls[1][1].method).toBe("DELETE");
    expect(JSON.parse(window.localStorage.getItem("crmApi-mutation-queue") || "[]")).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem("crmApi-cache-entity:Contact") || "[]")).toEqual([
      expect.objectContaining(currentRecord),
    ]);
    expect(apiModule.getApiStatus().queueCount).toBe(0);
  });
});
