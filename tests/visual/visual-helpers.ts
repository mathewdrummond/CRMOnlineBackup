import { expect, request, type Page } from "@playwright/test";

const TEST_API_BASE_URL = "http://127.0.0.1:4100";
const FIXED_NOW = "2026-05-16T12:00:00.000+12:00";

export const visualViewports = [
  { key: "mobile", width: 390, height: 844 },
  { key: "tablet", width: 768, height: 1024 },
  { key: "desktop", width: 1440, height: 900 },
] as const;

export async function resetVisualState() {
  const api = await request.newContext();
  const response = await api.post(`${TEST_API_BASE_URL}/api/test/reset`);
  expect(response.ok()).toBeTruthy();
  await api.dispose();
}

export async function prepareVisualPage(page: Page) {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript((fixedNow) => {
    const fixedTimestamp = new Date(fixedNow).valueOf();
    const RealDate = Date;

    class FixedDate extends RealDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) {
          super(fixedTimestamp);
        } else {
          super(...args);
        }
      }

      static now() {
        return fixedTimestamp;
      }
    }

    FixedDate.UTC = RealDate.UTC;
    FixedDate.parse = RealDate.parse;
    FixedDate.prototype = RealDate.prototype;
    window.Date = FixedDate as DateConstructor;
  }, FIXED_NOW);
}

export async function loginAsVisualAdmin(page: Page) {
  await page.goto("/login");
  await page.getByTestId("test-login-button").click();
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
}

export async function createEntity<T extends Record<string, unknown>>(page: Page, entityName: string, payload: T) {
  return page.evaluate(async ({ nextEntityName, nextPayload }) => {
    const response = await fetch(`/api/entities/${nextEntityName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextPayload),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }, {
    nextEntityName: entityName,
    nextPayload: payload,
  });
}

export async function seedVisualData(page: Page) {
  const contact = await createEntity(page, "Contact", {
    first_name: "Aroha",
    last_name: "Ngata",
    email: "aroha.visual@example.test",
    phone: "021 555 0101",
    relationship_type: "Client",
    company_name: "Ngata Homes",
    next_follow_up_date: "2026-05-20",
  });

  const lead = await createEntity(page, "Lead", {
    title: "Kitchen renovation enquiry",
    contact_id: contact.id,
    contact_name: "Aroha Ngata",
    stage: "quote_in_progress",
    source: "Referral",
    expected_value: 42000,
    expected_close: "2026-05-28",
    assigned_to: "Bruce",
  });

  const quote = await createEntity(page, "Quote", {
    quote_number: "QTE-VIS-001",
    title: "Kitchen renovation quote",
    contact_id: contact.id,
    contact_name: "Aroha Ngata",
    lead_id: lead.id,
    status: "awaiting_bruce",
    total: 38450,
    site_address: "12 Visual Lane, Auckland",
    valid_until: "2026-06-15",
  });

  const job = await createEntity(page, "Job", {
    job_number: "JOB-VIS-001",
    title: "Kitchen renovation install",
    contact_id: contact.id,
    contact_name: "Aroha Ngata",
    quote_id: quote.id,
    quote_number: "QTE-VIS-001",
    status: "ready_to_install",
    site_address: "12 Visual Lane, Auckland",
    quoted_value: 38450,
    start_date: "2026-05-18",
    due_date: "2026-05-29",
    install_date: "2026-05-25",
    install_end_date: "2026-05-26",
    budget_hours: 64,
  });

  const staff = await createEntity(page, "Staff", {
    name: "Jamie Visual",
    employee_id: "EMP-VIS",
    email: "jamie.visual@example.test",
    staff_type: "Employee",
    hourly_rate: 48,
    status: "active",
  });

  await createEntity(page, "JobOperation", {
    job_id: job.id,
    task_name: "Install cabinetry",
    operation: "install",
    workflow_phase: "installation",
    workflow_role: "install",
    assigned_role: "install",
    status: "ready",
    estimated_hours: 16,
    start_date: "2026-05-25",
    sort_order: 1,
  });

  await createEntity(page, "TimeEntry", {
    staff_id: staff.id,
    job_id: job.id,
    job_number: "JOB-VIS-001",
    job_title: "Kitchen renovation install",
    staff_name: "Jamie Visual",
    employee_id: "EMP-VIS",
    date: "2026-05-15",
    activity: "Install",
    clock_in: "2026-05-15T08:00:00.000Z",
    clock_out: "2026-05-15T14:00:00.000Z",
    hours: 6,
    status: "completed",
    exported: false,
  });

  await createEntity(page, "Note", {
    related_type: "job",
    related_id: job.id,
    content: "Visual baseline note for production readiness.",
    created_date: "2026-05-15T09:00:00.000Z",
  });
}

export async function stabilizeForScreenshot(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
        transition-delay: 0s !important;
      }
      [data-radix-popper-content-wrapper] {
        animation: none !important;
        transform-origin: center !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await page.waitForLoadState("networkidle");
}

export async function expectVisualSnapshot(page: Page, name: string) {
  await stabilizeForScreenshot(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    fullPage: true,
  });
}
