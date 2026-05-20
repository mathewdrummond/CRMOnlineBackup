import { isModuleEnabled } from "./appModules";
import { buildLabourIntelligence } from "./ai/labourIntelligence";
import { analyzeOperations } from "./ai/operations/operationsAnalyzer";
import { listEntityRecords } from "./db";
import { EntityRecord, ListEntityOptions } from "./types";

const LEAD_FIELDS = [
  "id",
  "title",
  "stage",
  "assigned_to",
  "expected_close",
  "contact_name",
  "contact_id",
  "company_name",
  "company_id",
  "site_address",
  "value",
  "probability",
  "category_id",
  "source",
  "created_date",
  "updated_date",
];
const JOB_FIELDS = [
  "id",
  "job_number",
  "title",
  "status",
  "due_date",
  "install_date",
  "install_end_date",
  "site_address",
  "contact_name",
  "contact_id",
  "company_name",
  "company_id",
  "project_manager",
  "salesperson",
  "budget_hours",
  "quoted_value",
  "job_type",
  "job_source",
  "created_date",
  "updated_date",
];
const QUOTE_FIELDS = [
  "id",
  "quote_number",
  "title",
  "status",
  "quote_family_id",
  "parent_quote_id",
  "quote_version_number",
  "quote_option_name",
  "is_primary_version",
  "is_archived_version",
  "version_status",
  "copied_from_quote_id",
  "valid_until",
  "total",
  "assigned_to",
  "prepared_by",
  "salesperson",
  "contact_name",
  "contact_id",
  "company_name",
  "company_id",
  "site_address",
  "created_date",
  "updated_date",
];
const LEAD_TASK_FIELDS = [
  "id",
  "status",
  "assigned_to",
  "due_date",
  "created_date",
];
const JOB_OPERATION_FIELDS = [
  "id",
  "job_id",
  "job_number",
  "job_title",
  "task_name",
  "operation",
  "status",
  "start_date",
  "end_date",
  "notes",
  "workflow_phase",
  "sort_order",
  "assigned_to",
  "assigned_staff_ids",
  "assigned_staff_display",
  "assigned_staff_names",
  "estimated_hours",
  "dependency_task_ids",
  "schedule_category",
  "created_date",
  "updated_date",
];
const CONTACT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "company_name",
  "company_id",
  "owner",
  "status",
  "next_follow_up_date",
  "is_primary",
  "created_date",
  "updated_date",
];
const CONTACT_TASK_FIELDS = [
  "id",
  "contact_id",
  "title",
  "priority",
  "status",
  "due_date",
  "created_date",
];
const TIME_ENTRY_FIELDS = [
  "id",
  "status",
  "exported",
  "hours",
  "date",
  "updated_date",
  "created_date",
  "job_id",
  "job_number",
  "job_name",
  "job_title",
  "activity",
  "operation",
  "staff_id",
  "staff_name",
  "customer",
  "company_name",
  "location_type",
  "total_cost",
  "job_operation_id",
  "is_break",
];
const CLOCK_IN_FIELDS = [
  "id",
  "staff_id",
  "staff_name",
  "job_id",
  "job_number",
  "clock_in_time",
  "clock_out_time",
  "total_hours",
  "status",
  "created_date",
  "updated_date",
];
const EXPORT_HISTORY_FIELDS = [
  "id",
  "export_type",
  "staff_name",
  "job_number",
  "exported_by",
  "exported_at",
  "created_date",
];
const NOTE_FIELDS = [
  "id",
  "related_id",
  "related_type",
  "content",
  "created_date",
];
const STAFF_FIELDS = [
  "id",
  "name",
  "status",
  "staff_type",
  "employee_id",
  "created_date",
  "updated_date",
];
const COMPANY_FIELDS = [
  "id",
  "name",
];

type ProjectionOptions = ListEntityOptions & {
  fields: string[];
};

function projectRecord(record: EntityRecord, fields: string[]) {
  const projected = {} as EntityRecord;
  Array.from(new Set(fields)).forEach((field) => {
    if (record[field] !== undefined) {
      projected[field] = record[field];
    }
  });
  return projected;
}

function listProjectedEntity(entity: string, options: ProjectionOptions) {
  const { fields, ...listOptions } = options;
  return listEntityRecords(entity, listOptions).map((record) => projectRecord(record, fields));
}

export function getDashboardOverviewData() {
  const jobs = listProjectedEntity("Job", { fields: JOB_FIELDS, sort: "-updated_date", limit: 300 });
  const quotes = isModuleEnabled("quotes")
    ? listProjectedEntity("Quote", { fields: QUOTE_FIELDS, sort: "-updated_date", limit: 200 })
    : [];
  const jobOperations = listProjectedEntity("JobOperation", { fields: JOB_OPERATION_FIELDS, sort: "-created_date", limit: 300 });
  const timeEntries = listProjectedEntity("TimeEntry", {
    fields: TIME_ENTRY_FIELDS,
    filters: { status: "completed" },
    sort: "-updated_date",
    limit: 500,
  });
  const clockIns = listProjectedEntity("ClockIn", { fields: CLOCK_IN_FIELDS, sort: "-updated_date", limit: 500 });
  const staff = listProjectedEntity("Staff", { fields: STAFF_FIELDS, sort: "name", limit: 200 });
  const notes = listProjectedEntity("Note", { fields: NOTE_FIELDS, sort: "-created_date", limit: 40 });
  return {
    leads: isModuleEnabled("leads")
      ? listProjectedEntity("Lead", { fields: LEAD_FIELDS, sort: "-updated_date", limit: 250 })
      : [],
    jobs,
    quotes,
    leadTasks: listProjectedEntity("LeadTask", { fields: LEAD_TASK_FIELDS, sort: "-created_date", limit: 250 }),
    jobOperations,
    staff,
    timeEntries,
    clockIns,
    labourIntelligence: buildLabourIntelligence({ jobs, quotes, jobOperations, timeEntries, clockIns }),
    operationalIntelligence: analyzeOperations({ jobs, quotes, jobOperations, timeEntries, clockIns, staff, notes }),
    exportHistory: listProjectedEntity("ExportHistory", { fields: EXPORT_HISTORY_FIELDS, sort: "-exported_at", limit: 40 }),
    notes,
  };
}

export function getOperationsHubData() {
  return {
    leads: isModuleEnabled("leads")
      ? listProjectedEntity("Lead", { fields: LEAD_FIELDS, sort: "-updated_date", limit: 300 })
      : [],
    jobs: listProjectedEntity("Job", { fields: JOB_FIELDS, sort: "-updated_date", limit: 300 }),
    quotes: isModuleEnabled("quotes")
      ? listProjectedEntity("Quote", { fields: QUOTE_FIELDS, sort: "-updated_date", limit: 300 })
      : [],
    leadTasks: listProjectedEntity("LeadTask", { fields: LEAD_TASK_FIELDS, sort: "-created_date", limit: 300 }),
    jobOperations: listProjectedEntity("JobOperation", { fields: JOB_OPERATION_FIELDS, sort: "-created_date", limit: 2000 }),
    contactTasks: isModuleEnabled("contacts")
      ? listProjectedEntity("ContactTask", { fields: CONTACT_TASK_FIELDS, sort: "-created_date", limit: 300 })
      : [],
    contacts: isModuleEnabled("contacts")
      ? listProjectedEntity("Contact", { fields: CONTACT_FIELDS, sort: "-updated_date", limit: 1000 })
      : [],
    timeEntries: listProjectedEntity("TimeEntry", {
      fields: TIME_ENTRY_FIELDS,
      filters: { status: "completed" },
      sort: "-updated_date",
      limit: 500,
    }),
    exportHistory: listProjectedEntity("ExportHistory", { fields: EXPORT_HISTORY_FIELDS, sort: "-exported_at", limit: 40 }),
    notes: listProjectedEntity("Note", { fields: NOTE_FIELDS, sort: "-created_date", limit: 60 }),
  };
}

export function getReportingDatasets() {
  return {
    leads: isModuleEnabled("leads")
      ? listProjectedEntity("Lead", { fields: LEAD_FIELDS, sort: "-created_date", limit: 1500 })
      : [],
    jobs: listProjectedEntity("Job", { fields: JOB_FIELDS, sort: "-created_date", limit: 1500 }),
    quotes: isModuleEnabled("quotes")
      ? listProjectedEntity("Quote", { fields: QUOTE_FIELDS, sort: "-created_date", limit: 1500 })
      : [],
    timeEntries: listProjectedEntity("TimeEntry", { fields: TIME_ENTRY_FIELDS, sort: "-date", limit: 4000 }),
    jobOperations: listProjectedEntity("JobOperation", { fields: JOB_OPERATION_FIELDS, sort: "-updated_date", limit: 4000 }),
    staff: listProjectedEntity("Staff", { fields: STAFF_FIELDS, sort: "name", limit: 300 }),
    contacts: isModuleEnabled("contacts")
      ? listProjectedEntity("Contact", { fields: CONTACT_FIELDS, sort: "last_name", limit: 1500 })
      : [],
    companies: isModuleEnabled("contacts") || isModuleEnabled("suppliers")
      ? listProjectedEntity("Company", { fields: COMPANY_FIELDS, sort: "name", limit: 1500 })
      : [],
  };
}
