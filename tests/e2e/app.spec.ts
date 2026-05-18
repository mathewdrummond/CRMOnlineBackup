import { expect, request, test } from "@playwright/test";
import fs from "node:fs/promises";

const TEST_API_BASE_URL = "http://127.0.0.1:4100";

async function resetTestState() {
  const api = await request.newContext();
  const response = await api.post(`${TEST_API_BASE_URL}/api/test/reset`);
  expect(response.ok()).toBeTruthy();
  try {
    await api.dispose();
  } catch {
    // Playwright can occasionally fail to copy trace-sidecar files while disposing
    // request contexts under rapid local test resets. The reset request has already
    // completed successfully at this point, so disposing failures are non-fatal.
  }
}

async function loginAsTestAdmin(page) {
  await page.goto("/login");
  await page.getByTestId("test-login-button").click();
  await expect(page).not.toHaveURL(/\/login(?:\?.*)?$/);
}

async function createEntity(page, entityName, payload) {
  return page.evaluate(async ({ nextEntityName, nextPayload }) => {
    const response = await fetch(`/api/entities/${nextEntityName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

async function listEntities(page, entityName, { filters, sort = "", limit = 1000 } = {}) {
  return page.evaluate(async ({ nextEntityName, nextFilters, nextSort, nextLimit }) => {
    const params = new URLSearchParams();
    if (nextFilters) {
      params.set("filters", JSON.stringify(nextFilters));
    }
    if (nextSort) {
      params.set("sort", nextSort);
    }
    if (nextLimit) {
      params.set("limit", String(nextLimit));
    }

    const response = await fetch(`/api/entities/${nextEntityName}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }, {
    nextEntityName: entityName,
    nextFilters: filters,
    nextSort: sort,
    nextLimit: limit,
  });
}

async function readEntity(page, entityName, id) {
  return page.evaluate(async ({ nextEntityName, nextId }) => {
    const response = await fetch(`/api/entities/${nextEntityName}/${encodeURIComponent(nextId)}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }, {
    nextEntityName: entityName,
    nextId: id,
  });
}

function getDateKey(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartDateKey() {
  const date = new Date();
  const currentDay = date.getDay();
  const deltaToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  date.setDate(date.getDate() + deltaToMonday);
  return getDateKeyFromDate(date);
}

function getDateKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftAbsoluteDateKey(dateKey, deltaDays) {
  const nextDate = new Date(`${dateKey}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + deltaDays);
  return getDateKeyFromDate(nextDate);
}

function createUniqueToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createInstallPlan(page, {
  label = "E2E install",
  startDateKey = getDateKey(0),
  endDateKey = startDateKey,
} = {}) {
  const jobNumber = `JOB-E2E-${createUniqueToken()}`;
  const job = await createEntity(page, "Job", {
    title: `${label} job`,
    job_number: jobNumber,
    contact_name: "E2E Planner",
  });

  await page.evaluate(async ({ jobId, installLabel, startDate, endDate }) => {
    const response = await fetch("/api/install-planner/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_id: jobId,
        install_label: installLabel,
        start_date: startDate,
        end_date: endDate,
        status: "scheduled",
        manually_locked: true,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
  }, {
    jobId: job.id,
    installLabel: label,
    startDate: startDateKey,
    endDate: endDateKey,
  });

  await page.goto("/schedule?view=2week");
  await expect(page).toHaveURL(/\/schedule\?view=2week$/);
  await expect(page.getByRole("heading", { name: "Install Planner" })).toBeVisible();

  return { label, startDateKey, endDateKey };
}

async function readInstallOperationByLabel(page, label) {
  return page.evaluate(async (taskName) => {
    const response = await fetch("/api/entities/JobOperation?limit=5000");
    if (!response.ok) {
      return null;
    }
    const records = await response.json();
    const record = records.find((item) => String(item.task_name || "") === String(taskName || ""));
    if (!record) {
      return null;
    }
    return {
      id: String(record.id || ""),
      job_id: String(record.job_id || ""),
      start_date: String(record.start_date || ""),
      end_date: String(record.end_date || ""),
      task_name: String(record.task_name || ""),
    };
  }, label);
}

async function saveInstallPlanRange(page, {
  jobId,
  operationId,
  label,
  startDateKey,
  endDateKey,
}) {
  return page.evaluate(async ({ nextJobId, nextOperationId, nextLabel, nextStartDateKey, nextEndDateKey }) => {
    const response = await fetch("/api/install-planner/entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_id: nextJobId,
        operation_id: nextOperationId,
        install_label: nextLabel,
        start_date: nextStartDateKey,
        end_date: nextEndDateKey,
        status: "scheduled",
        manually_locked: true,
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }, {
    nextJobId: jobId,
    nextOperationId: operationId,
    nextLabel: label,
    nextStartDateKey: startDateKey,
    nextEndDateKey: endDateKey,
  });
}

test.beforeEach(async () => {
  await resetTestState();
});

test("redirects protected routes to login, allows test login, and logs out cleanly", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login\?next=%2Fjobs$/);

  await loginAsTestAdmin(page);
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();

  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login$/);
});

test("creates a contact and opens admin audit and system pages", async ({ page }) => {
  await loginAsTestAdmin(page);

  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await page.getByRole("button", { name: "Add Contact" }).click();

  await page.getByLabel("First Name").fill("E2E");
  await page.getByLabel("Last Name").fill("Contact");
  await page.getByLabel("Primary Email").fill("e2e-contact@example.test");
  await page.getByRole("button", { name: "Create Contact" }).click();

  await expect(page.getByRole("table").getByText("e2e-contact@example.test")).toBeVisible();

  await page.getByRole("link", { name: "Audit" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();

  await page.getByRole("link", { name: "System" }).click();
  await expect(page).toHaveURL(/\/admin\/health$/);
  await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
  await expect(page.getByText("Database Details")).toBeVisible();
});

test("creates an enquiry, converts it into a job, and finds the enquiry through global search", async ({ page }) => {
  await loginAsTestAdmin(page);

  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await page.getByRole("button", { name: "New Lead" }).click();
  await expect(page.getByRole("heading", { name: "New Lead" })).toBeVisible();

  await page.getByPlaceholder("e.g. Kitchen renovation – Smith").fill("E2E Joinery Enquiry");
  await page.getByLabel("Contact Name").fill("Ella Example");
  await page.getByLabel("Company Name").fill("Example Interiors");
  await page.getByRole("button", { name: "Create Lead" }).click();

  const newLeadRow = page.getByRole("row", { name: /E2E Joinery Enquiry/i }).first();
  await expect(newLeadRow).toBeVisible();
  await newLeadRow.click();
  await expect(page).toHaveURL(/\/leads\//);

  await page.getByRole("button", { name: "Convert to Job" }).click();
  await expect(page.getByRole("heading", { name: "Convert Enquiry To Job" })).toBeVisible();
  await page.getByLabel("Job Number").fill("JOB-E2E-0001");
  await page.getByRole("button", { name: "Convert" }).click();

  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByText("JOB-E2E-0001").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Joinery Enquiry" })).toBeVisible();

  const globalSearch = page.getByPlaceholder("Search jobs, enquiries, contacts, companies...");
  await globalSearch.fill("E2E Joinery Enquiry");
  await page.getByRole("button", { name: /E2E Joinery Enquiry.*Enquiry/i }).click();
  await expect(page).toHaveURL(/\/leads\//);
  await expect(page.getByRole("heading", { name: "E2E Joinery Enquiry" })).toBeVisible();
});

test("converts a lead-backed quote into a job and surfaces linked time entry actuals", async ({ page }) => {
  await loginAsTestAdmin(page);

  const uniqueToken = createUniqueToken();
  const company = await createEntity(page, "Company", {
    name: `E2E Workflow Co ${uniqueToken}`,
    type: "client",
  });
  const contact = await createEntity(page, "Contact", {
    first_name: "Willa",
    last_name: "Workflow",
    full_name: "Willa Workflow",
    email: `willa-${uniqueToken}@example.test`,
    company_id: company.id,
    company_name: company.name,
    type: "client",
  });
  const lead = await createEntity(page, "Lead", {
    title: `E2E workflow lead ${uniqueToken}`,
    stage: "quote_in_progress",
    contact_id: contact.id,
    contact_name: "Willa Workflow",
    company_id: company.id,
    company_name: company.name,
    value: 12800,
  });
  const quote = await createEntity(page, "Quote", {
    title: `E2E workflow quote ${uniqueToken}`,
    quote_number: `Q-E2E-${uniqueToken}`,
    lead_id: lead.id,
    contact_id: contact.id,
    contact_name: "Willa Workflow",
    company_id: company.id,
    company_name: company.name,
    status: "won",
    subtotal: 10000,
    gst: 1500,
    total: 11500,
    quote_scope_signed_off: true,
    quote_drawings_signed_off: true,
    quote_internal_notes: "E2E workflow handoff note",
  });
  await createEntity(page, "QuoteItem", {
    quote_id: quote.id,
    description: "E2E cabinetry workflow package",
    category: "labour",
    section: "Labour",
    quantity: 1,
    unit: "ea",
    unit_cost: 10000,
    markup_percent: 15,
    total: 11500,
    sort_order: 1,
  });

  await page.goto(`/quotes/${quote.id}`);
  await expect(page.getByRole("heading", { name: quote.title })).toBeVisible();
  await page.getByRole("button", { name: "Convert to Job" }).first().click();
  await expect(page.getByRole("heading", { name: "Convert Quote To Job" })).toBeVisible();
  const jobNumber = `JOB-E2E-WF-${uniqueToken}`;
  await page.getByPlaceholder("e.g. JOB-0042").fill(jobNumber);
  await page.getByRole("button", { name: "Convert Quote" }).click();

  await expect(page).toHaveURL(/\/jobs\//);
  await expect(page.getByText(jobNumber).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: quote.title })).toBeVisible();

  const jobs = await listEntities(page, "Job", { filters: { quote_id: quote.id } });
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    job_number: jobNumber,
    quote_id: quote.id,
    lead_id: lead.id,
    contact_id: contact.id,
    company_id: company.id,
    quoted_value: 11500,
  });

  const refreshedQuote = await readEntity(page, "Quote", quote.id);
  expect(refreshedQuote.status).toBe("won");
  const refreshedLead = await readEntity(page, "Lead", lead.id);
  expect(refreshedLead.stage).toBe("won");

  const operations = await listEntities(page, "JobOperation", {
    filters: { job_id: jobs[0].id },
    sort: "sort_order",
    limit: 5000,
  });
  const siteMeasureTask = operations.find((operation) => operation.workflow_template_key === "site_measure");
  expect(siteMeasureTask).toBeTruthy();

  await createEntity(page, "TimeEntry", {
    staff_id: `staff-e2e-${uniqueToken}`,
    staff_name: "Willa Workshop",
    employee_id: `EMP-E2E-${uniqueToken}`,
    job_id: jobs[0].id,
    job_operation_id: siteMeasureTask.id,
    date: getDateKey(0),
    activity: "Site measure",
    labour_category: "Site Measure",
    status: "completed",
    hours: 2.5,
  });

  const refreshedOperation = await readEntity(page, "JobOperation", siteMeasureTask.id);
  expect(refreshedOperation.actual_hours).toBe(2.5);
  expect(refreshedOperation.status).toBe("in_progress");

  await page.goto(`/quotes/${quote.id}`);
  await page.getByRole("tab", { name: "Pricing" }).click();
  await expect(page.getByRole("heading", { name: "Actual Labour" })).toBeVisible();
  await expect(page.getByText("2.5h").first()).toBeVisible();
  await expect(page.getByText("Willa Workshop")).toBeVisible();
});

test("downloads a MYOB activity slip export from the time tracking screen", async ({ page }) => {
  await loginAsTestAdmin(page);

  const job = await createEntity(page, "Job", {
    title: "E2E MYOB Export Job",
    job_number: `JOB-MYOB-${createUniqueToken()}`,
    contact_name: "Export Contact",
  });

  const staff = await createEntity(page, "Staff", {
    name: "E2E Export Staff",
    employee_id: `EMP-${createUniqueToken()}`,
    status: "active",
  });

  const today = getDateKey(0);
  await createEntity(page, "TimeEntry", {
    staff_id: staff.id,
    staff_name: staff.name,
    employee_id: staff.employee_id,
    job_id: job.id,
    job_number: job.job_number,
    job_name: job.title,
    date: today,
    activity: "Labour",
    labour_category: "Assembly",
    status: "completed",
    clock_in: `${today}T08:00:00.000Z`,
    clock_out: `${today}T10:30:00.000Z`,
    notes: "E2E export row",
    description: "E2E export row",
  });

  await page.getByRole("link", { name: "Time Clock", exact: true }).click();
  await expect(page).toHaveURL(/\/time-tracking$/);
  await page.getByRole("tab", { name: "MYOB Export" }).click();

  await expect(page.getByText("Pending Activity Slip Rows")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download .*Activity Slip/i }).click();
  const download = await downloadPromise;
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const contents = await fs.readFile(filePath!, "utf8");
  expect(contents).toContain("Co./Last Name\tFirst Name\tCard ID\tDate\tActivity\tJob\tNotes\tUnits");
});

test("creates a supplier and manages it from the supplier detail screen", async ({ page }) => {
  await loginAsTestAdmin(page);

  await page.getByRole("link", { name: "Suppliers", exact: true }).click();
  await expect(page).toHaveURL(/\/suppliers$/);
  await page.getByRole("button", { name: "Add Supplier" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name *").fill("E2E Supplier");
  await dialog.getByLabel("Contact Person").fill("Sam Supplier");
  await dialog.getByLabel("Phone").fill("021 000 0000");
  await dialog.getByLabel("Email").fill("supplier-e2e@example.test");
  await dialog.getByRole("button", { name: "Add Supplier" }).click();

  await expect(page).toHaveURL(/\/suppliers\//);
  await expect(page.getByRole("heading", { name: "E2E Supplier" })).toBeVisible();
  await expect(page.getByText("Sam Supplier")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("Payment Terms").fill("14_days");
  await editDialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("14 days")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "supplier-terms.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("E2E supplier document"),
  });
  await expect(page.getByText("supplier-terms.txt").first()).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("supplier-terms.txt")).toHaveCount(0);

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
});

test("views the per-job delivery forecast waterfall from job detail", async ({ page }) => {
  await loginAsTestAdmin(page);

  const job = await createEntity(page, "Job", {
    title: "E2E Waterfall Job",
    job_number: `JOB-WATERFALL-${createUniqueToken()}`,
    contact_name: "Forecast Contact",
    install_date: getDateKey(10),
  });

  await page.goto(`/jobs/${job.id}`);
  await expect(page).toHaveURL(new RegExp(`/jobs/${job.id}$`));
  await expect(page.getByText(job.job_number).first()).toBeVisible();

  await page.getByRole("tab", { name: "Delivery Forecast" }).click();
  await expect(page.getByTestId("job-waterfall-view")).toBeVisible();
  await expect(page.getByText("Projected Completion")).toBeVisible();
  await expect(page.getByTestId("job-waterfall-completion")).toBeVisible();
});

test("moves a scheduled install across dates through the planner API and keeps the persisted date", async ({ page }) => {
  await loginAsTestAdmin(page);

  const label = `E2E install move ${createUniqueToken()}`;
  await createInstallPlan(page, {
    label,
    startDateKey: getDateKey(0),
    endDateKey: getDateKey(0),
  });

  const item = page.locator('[data-testid^="schedule-item-install-op-"]').filter({ hasText: label }).first();
  await expect(item).toBeVisible();
  const originalRecord = await readInstallOperationByLabel(page, label);
  expect(originalRecord?.id).toBeTruthy();
  expect(originalRecord?.job_id).toBeTruthy();

  await saveInstallPlanRange(page, {
    jobId: originalRecord.job_id,
    operationId: originalRecord.id,
    label,
    startDateKey: getDateKey(1),
    endDateKey: getDateKey(1),
  });

  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return record?.start_date || "";
  }).toBe(getDateKey(1));

  await page.reload();
  await expect(page.getByRole("heading", { name: "Install Planner" })).toBeVisible();
  await expect(page.locator('[data-testid^="schedule-item-install-op-"]').filter({ hasText: label }).first()).toBeVisible();
  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return record?.start_date || "";
  }).toBe(getDateKey(1));
});

test("resizes a scheduled install forward through the planner API and keeps the longer span after reload", async ({ page }) => {
  await loginAsTestAdmin(page);

  const startDateKey = shiftAbsoluteDateKey(getWeekStartDateKey(), 7);
  const endDateKey = shiftAbsoluteDateKey(startDateKey, 3);
  const label = `E2E install resize ${createUniqueToken()}`;
  await createInstallPlan(page, {
    label,
    startDateKey,
    endDateKey: startDateKey,
  });

  const item = page.locator('[data-testid^="schedule-item-install-op-"]').filter({ hasText: label }).first();
  await expect(item).toBeVisible();

  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return record?.end_date || "";
  }).toBe(startDateKey);

  const originalRecord = await readInstallOperationByLabel(page, label);
  expect(originalRecord?.id).toBeTruthy();
  expect(originalRecord?.job_id).toBeTruthy();

  await saveInstallPlanRange(page, {
    jobId: originalRecord.job_id,
    operationId: originalRecord.id,
    label,
    startDateKey,
    endDateKey,
  });

  await expect(item).toBeVisible();
  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return record?.end_date || "";
  }).toBe(endDateKey);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Install Planner" })).toBeVisible();
  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return {
      start: record?.start_date || "",
      end: record?.end_date || "",
    };
  }).toEqual({
    start: startDateKey,
    end: endDateKey,
  });
});

test("moves an install across the week boundary through the planner API and keeps the persisted dates", async ({ page }) => {
  await loginAsTestAdmin(page);

  const weekStartDateKey = getWeekStartDateKey();
  const label = `E2E install cross-week ${createUniqueToken()}`;
  await createInstallPlan(page, {
    label,
    startDateKey: shiftAbsoluteDateKey(weekStartDateKey, 6),
    endDateKey: shiftAbsoluteDateKey(weekStartDateKey, 6),
  });

  let item = page.locator('[data-testid^="schedule-item-install-op-"]').filter({ hasText: label }).first();
  await expect(item).toBeVisible();
  const originalRecord = await readInstallOperationByLabel(page, label);
  expect(originalRecord?.id).toBeTruthy();
  expect(originalRecord?.job_id).toBeTruthy();
  const targetDateKey = shiftAbsoluteDateKey(weekStartDateKey, 8);

  await saveInstallPlanRange(page, {
    jobId: originalRecord.job_id,
    operationId: originalRecord.id,
    label,
    startDateKey: targetDateKey,
    endDateKey: targetDateKey,
  });

  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return record?.start_date || "";
  }).toBe(targetDateKey);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Install Planner" })).toBeVisible();
  item = page.locator('[data-testid^="schedule-item-install-op-"]').filter({ hasText: label }).first();
  await expect(item).toBeVisible();
  await expect.poll(async () => {
    const record = await readInstallOperationByLabel(page, label);
    return record?.start_date || "";
  }).toBe(targetDateKey);
});
