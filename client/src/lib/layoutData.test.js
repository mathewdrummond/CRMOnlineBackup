import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const entityMocks = {
  Job: { peek: vi.fn(), list: vi.fn() },
  Quote: { peek: vi.fn(), list: vi.fn() },
  Contact: { peek: vi.fn(), list: vi.fn() },
  Lead: { peek: vi.fn(), list: vi.fn() },
  Company: { peek: vi.fn(), list: vi.fn() },
  LeadTask: { peek: vi.fn(), list: vi.fn() },
  JobOperation: { peek: vi.fn(), list: vi.fn() },
};

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    entities: entityMocks,
  },
}));

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe("layoutData helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(entityMocks).forEach((entity) => {
      entity.peek.mockReset();
      entity.list.mockReset();
      entity.peek.mockReturnValue([]);
      entity.list.mockResolvedValue([]);
    });
  });

  afterEach(async () => {
    const module = await import("./layoutData.js");
    module.resetLayoutDataCache();
    vi.useRealTimers();
  });

  test("builds search snapshots from cached entity data and respects module toggles", async () => {
    entityMocks.Job.peek.mockReturnValue([{ id: "job-1" }]);
    entityMocks.Company.peek.mockReturnValue([{ id: "company-1" }]);
    entityMocks.Lead.peek.mockReturnValue([{ id: "lead-1" }]);

    const { getLayoutSearchSnapshot } = await import("./layoutData.js");
    const snapshot = getLayoutSearchSnapshot({
      contactsEnabled: false,
      leadsEnabled: true,
      quotesEnabled: false,
      suppliersEnabled: true,
    });

    expect(snapshot).toEqual({
      jobs: [{ id: "job-1" }],
      quotes: [],
      contacts: [],
      leads: [{ id: "lead-1" }],
      companies: [{ id: "company-1" }],
    });
    expect(entityMocks.Quote.peek).not.toHaveBeenCalled();
    expect(entityMocks.Contact.peek).not.toHaveBeenCalled();
  });

  test("dedupes concurrent search loads and reuses the cached result while fresh", async () => {
    const jobRequest = createDeferred();
    entityMocks.Job.list.mockReturnValue(jobRequest.promise);

    const { loadLayoutSearchData } = await import("./layoutData.js");
    const options = {
      contactsEnabled: false,
      leadsEnabled: false,
      quotesEnabled: false,
      suppliersEnabled: false,
    };

    const firstLoad = loadLayoutSearchData(options);
    const secondLoad = loadLayoutSearchData(options);

    expect(entityMocks.Job.list).toHaveBeenCalledTimes(1);

    jobRequest.resolve([{ id: "job-1" }]);
    await expect(firstLoad).resolves.toEqual({
      jobs: [{ id: "job-1" }],
      quotes: [],
      contacts: [],
      leads: [],
      companies: [],
    });
    await expect(secondLoad).resolves.toEqual({
      jobs: [{ id: "job-1" }],
      quotes: [],
      contacts: [],
      leads: [],
      companies: [],
    });

    entityMocks.Job.list.mockClear();
    await expect(loadLayoutSearchData(options)).resolves.toEqual({
      jobs: [{ id: "job-1" }],
      quotes: [],
      contacts: [],
      leads: [],
      companies: [],
    });
    expect(entityMocks.Job.list).not.toHaveBeenCalled();
  });

});
