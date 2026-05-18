import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { useModules } from "@/lib/ModuleContext";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import PayPeriodPicker from "./PayPeriodPicker";
import { formatDate } from "../../lib/helpers";
import { groupActivitySlipExportRecords } from "@/lib/timeGrouping";
import { buildXlsxBlob } from "@/lib/xlsx/workbook";
import { Download, FileSpreadsheet, FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const PAYROLL_CATEGORY_MAP = {
  "annual leave": "Annual Leave",
  "sick leave": "Sick Leave",
  "statutory holiday": "Statutory Holiday",
  "breavement leave": "Breavement Leave",
  "bereavement leave": "Breavement Leave",
  "acc": "ACC",
  "covid -19": "Covid -19",
  "covid-19": "Covid -19",
};

export function roundHours(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatMyobDate(value) {
  if (!value) {
    return "";
  }

  const date = String(value).length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatUnits(value) {
  const rounded = roundHours(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function cleanCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function getUniqueCleanValues(values) {
  return [...new Set((values || []).map(cleanCell).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base", numeric: true })
  );
}

function getSingleCleanValue(values) {
  const unique = getUniqueCleanValues(values);
  return unique.length === 1 ? unique[0] : "";
}

function splitName(fullName) {
  const trimmed = String(fullName || "").trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  const lastName = parts.pop() || "";
  return {
    firstName: parts.join(" "),
    lastName,
  };
}

function applyLunchDeduction(dateValue, hours) {
  const rounded = roundHours(hours);
  if (rounded > 5.5) {
    return roundHours(Math.max(0, rounded - 0.5));
  }

  return rounded;
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const parsed = String(value).length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildLatestPendingActivitySuggestion(entries, activeRange) {
  const pendingEntries = (entries || [])
    .filter((entry) => !entry.exported && entry.date)
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));

  if (pendingEntries.length === 0) {
    return null;
  }

  const latestDate = String(pendingEntries[0].date || "");
  if (activeRange && latestDate >= activeRange.from && latestDate <= activeRange.to) {
    return null;
  }

  const anchorDate = parseDateOnly(latestDate);
  if (!anchorDate) {
    return null;
  }

  const from = format(startOfWeek(anchorDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const to = format(endOfWeek(anchorDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const count = pendingEntries.filter((entry) => {
    const entryDate = String(entry.date || "");
    return entryDate >= from && entryDate <= to;
  }).length;

  return {
    from,
    to,
    count,
    latestDate,
  };
}

function buildTsv(rows) {
  return rows.map((row) => row.map(cleanCell).join("\t")).join("\r\n");
}

export function buildActivitySlipTsv(records) {
  const rows = [
    ["Co./Last Name", "First Name", "Card ID", "Date", "Activity", "Job", "Notes", "Units"],
    // MYOB AccountRight imports each row independently, so repeated values must still
    // be written on every line. Leaving them blank does not carry values down.
    ...records.map((record) => [
      record.customer_name,
      record.first_name || "",
      record.employee_id,
      formatMyobDate(record.date),
      record.activity,
      record.job_number,
      record.notes || "",
      formatUnits(record.units),
    ]),
  ];

  return buildTsv(rows);
}

export function buildTimesheetTsv(records) {
  const normalizedRecords = records.map((record) => ({
    employee_last_name: cleanCell(record.employee_last_name),
    employee_first_name: cleanCell(record.employee_first_name),
    payroll_category: cleanCell(record.payroll_category || "Ordinary hours"),
    job_number: cleanCell(record.job_number),
    customer_last_name: cleanCell(record.customer_last_name),
    customer_first_name: cleanCell(record.customer_first_name),
    notes: cleanCell(record.notes),
    date: formatMyobDate(record.date),
    units: formatUnits(record.units),
    employee_id: cleanCell(record.employee_id),
    employee_record_id: cleanCell(record.employee_record_id),
    start_stop_time: cleanCell(record.start_stop_time),
    customer_card_id: cleanCell(record.customer_card_id),
    customer_record_id: cleanCell(record.customer_record_id),
  }));

  const rows = [
    ["{}"],
    [
      "Employee Co./Last Name",
      "Employee First Name",
      "Payroll Category",
      "Job",
      "Customer Co./Last Name",
      "Customer First Name",
      "Notes",
      "Date",
      "Units",
      "Employee Card ID",
      "Employee Record ID",
      "Start/Stop Time",
      "Customer Card ID",
      "Customer Record ID",
    ],
    // MYOB AccountRight validates each timesheet row on its own. Even when the
    // same employee appears on consecutive lines, we still write the full row.
    ...normalizedRecords.map((record) => [
      record.employee_last_name,
      record.employee_first_name,
      record.payroll_category,
      record.job_number,
      record.customer_last_name,
      record.customer_first_name,
      record.notes,
      record.date,
      record.units,
      record.employee_id,
      record.employee_record_id,
      record.start_stop_time,
      record.customer_card_id,
      record.customer_record_id,
    ]),
  ];

  return buildTsv(rows);
}

export function buildDailyHoursWorkbook(records) {
  const staffNames = [...new Set(records.map((record) => record.staff_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const dateRows = [...new Set(records.map((record) => record.date).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const byDateAndStaff = new Map(records.map((record) => [`${record.date}|${record.staff_name}`, record.units]));

  const worksheetRows = [
    ["Date", ...staffNames, "Daily Total"],
    ...dateRows.map((date) => {
      const hoursByStaff = staffNames.map((staffName) => roundHours(byDateAndStaff.get(`${date}|${staffName}`) || 0));
      const dailyTotal = roundHours(hoursByStaff.reduce((sum, value) => sum + value, 0));
      return [formatMyobDate(date), ...hoursByStaff, dailyTotal];
    }),
  ];

  const totalsByStaff = staffNames.map((staffName) =>
    roundHours(
      dateRows.reduce((sum, date) => sum + roundHours(byDateAndStaff.get(`${date}|${staffName}`) || 0), 0)
    )
  );
  const grandTotal = roundHours(totalsByStaff.reduce((sum, value) => sum + value, 0));
  worksheetRows.push(["TOTAL", ...totalsByStaff, grandTotal]);

  return {
    sheetName: "Daily Hours",
    rows: worksheetRows,
    rowStyles: {
      1: "header",
      [worksheetRows.length]: "summary",
    },
    columnWidths: [14, ...staffNames.map(() => 14), 14],
  };
}

function derivePayrollCategory(entriesForDay) {
  const normalizedActivities = [...new Set(
    entriesForDay
      .map((entry) => String(entry.activity || "").trim().toLowerCase())
      .filter(Boolean)
  )];

  if (normalizedActivities.length === 1 && PAYROLL_CATEGORY_MAP[normalizedActivities[0]]) {
    return PAYROLL_CATEGORY_MAP[normalizedActivities[0]];
  }

  return "Ordinary hours";
}

function resolveTimesheetCustomer(entriesForDay, lookup) {
  const relatedJobs = [...new Map(
    entriesForDay
      .map((entry) => {
        if (entry.job_id && lookup.jobsById.has(entry.job_id)) {
          return [entry.job_id, lookup.jobsById.get(entry.job_id)];
        }

        const jobNumber = cleanCell(entry.job_number).toLowerCase();
        if (jobNumber && lookup.jobsByNumber.has(jobNumber)) {
          const job = lookup.jobsByNumber.get(jobNumber);
          return [job.id || jobNumber, job];
        }

        return null;
      })
      .filter(Boolean)
  ).values()];

  const relatedContacts = [...new Map(
    [
      ...relatedJobs
        .map((job) => {
          if (job.contact_id && lookup.contactsById.has(job.contact_id)) {
            return [job.contact_id, lookup.contactsById.get(job.contact_id)];
          }

          const contactName = cleanCell(job.contact_name).toLowerCase();
          if (contactName && lookup.contactsByName.has(contactName)) {
            const contact = lookup.contactsByName.get(contactName);
            return [contact.id || contactName, contact];
          }

          return null;
        }),
      ...entriesForDay.map((entry) => {
        const customerName = cleanCell(entry.customer).toLowerCase();
        if (customerName && lookup.contactsByName.has(customerName)) {
          const contact = lookup.contactsByName.get(customerName);
          return [contact.id || customerName, contact];
        }

        return null;
      }),
    ].filter(Boolean)
  ).values()];

  if (relatedContacts.length === 1) {
    const contact = relatedContacts[0];
    return {
      customer_first_name: cleanCell(contact.first_name),
      customer_last_name: cleanCell(contact.last_name || contact.full_name || contact.email),
      customer_card_id: cleanCell(contact.myob_card_id),
      customer_record_id: cleanCell(contact.myob_record_id),
    };
  }

  const relatedCompanies = [...new Map(
    [
      ...relatedJobs
        .map((job) => {
          if (job.company_id && lookup.companiesById.has(job.company_id)) {
            return [job.company_id, lookup.companiesById.get(job.company_id)];
          }

          const companyName = cleanCell(job.company_name).toLowerCase();
          if (companyName && lookup.companiesByName.has(companyName)) {
            const company = lookup.companiesByName.get(companyName);
            return [company.id || companyName, company];
          }

          return null;
        }),
      ...entriesForDay.map((entry) => {
        const companyName = cleanCell(entry.company_name).toLowerCase();
        if (companyName && lookup.companiesByName.has(companyName)) {
          const company = lookup.companiesByName.get(companyName);
          return [company.id || companyName, company];
        }

        return null;
      }),
    ].filter(Boolean)
  ).values()];

  if (relatedCompanies.length === 1) {
    const company = relatedCompanies[0];
    return {
      customer_first_name: "",
      customer_last_name: cleanCell(company.name),
      customer_card_id: cleanCell(company.myob_card_id),
      customer_record_id: cleanCell(company.myob_record_id),
    };
  }

  const fallbackCustomerName = getSingleCleanValue([
    ...entriesForDay.map((entry) => entry.customer),
    ...relatedJobs.map((job) => job.contact_name),
  ]);
  if (fallbackCustomerName) {
    const { firstName, lastName } = splitName(fallbackCustomerName);
    return {
      customer_first_name: cleanCell(firstName),
      customer_last_name: cleanCell(lastName || fallbackCustomerName),
      customer_card_id: "",
      customer_record_id: "",
    };
  }

  const fallbackCompanyName = getSingleCleanValue([
    ...entriesForDay.map((entry) => entry.company_name),
    ...relatedJobs.map((job) => job.company_name),
  ]);
  return {
    customer_first_name: "",
    customer_last_name: fallbackCompanyName,
    customer_card_id: "",
    customer_record_id: "",
  };
}

export function aggregateDailyRecords(clockIns, timeEntries, staff, jobs, contacts, companies) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const jobsByNumber = new Map(
    jobs
      .filter((job) => cleanCell(job.job_number))
      .map((job) => [cleanCell(job.job_number).toLowerCase(), job])
  );
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const contactsByName = new Map(
    contacts
      .filter((contact) => cleanCell(contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email))
      .map((contact) => [
        cleanCell(contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email).toLowerCase(),
        contact,
      ])
  );
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const companiesByName = new Map(
    companies
      .filter((company) => cleanCell(company.name))
      .map((company) => [cleanCell(company.name).toLowerCase(), company])
  );
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const staffByName = new Map(staff.map((member) => [String(member.name || "").trim().toLowerCase(), member]));
  const lookup = { jobsById, jobsByNumber, contactsById, contactsByName, companiesById, companiesByName };
  const clockMap = new Map();
  const entryMap = new Map();

  clockIns
    .filter((entry) => entry.date && entry.clock_out_time)
    .forEach((entry) => {
      const key = `${entry.staff_id || ""}|${entry.date}`;
      const current = clockMap.get(key) || {
        staff_id: entry.staff_id || "",
        date: entry.date,
        total_hours: 0,
        clock_in_time: "",
        clock_out_time: "",
      };

      current.total_hours = roundHours(current.total_hours + Number(entry.total_hours || 0));

      if (entry.clock_in_time && (!current.clock_in_time || entry.clock_in_time < current.clock_in_time)) {
        current.clock_in_time = entry.clock_in_time;
      }

      if (entry.clock_out_time && (!current.clock_out_time || entry.clock_out_time > current.clock_out_time)) {
        current.clock_out_time = entry.clock_out_time;
      }

      clockMap.set(key, current);
    });

  timeEntries
    .filter((entry) => entry.date)
    .forEach((entry) => {
      const resolvedStaff =
        staffById.get(entry.staff_id) ||
        staffByName.get(String(entry.staff_name || "").trim().toLowerCase()) ||
        null;
      const staffId = entry.staff_id || resolvedStaff?.id || "";
      const key = `${staffId}|${entry.date}`;
      const current = entryMap.get(key) || {
        staff_id: staffId,
        date: entry.date,
        total_hours: 0,
        entries: [],
      };

      current.total_hours = roundHours(current.total_hours + Number(entry.hours || 0));
      current.entries.push(entry);
      entryMap.set(key, current);
    });

  return [...clockMap.keys()]
    .map((key) => {
      const clockRecord = clockMap.get(key);
      const entryRecord = entryMap.get(key);
      const staffId = clockRecord?.staff_id || entryRecord?.staff_id || "";
      const date = clockRecord?.date || entryRecord?.date || "";
      const resolvedStaff =
        staffById.get(staffId) ||
        staffByName.get(String(entryRecord?.entries?.[0]?.staff_name || "").trim().toLowerCase()) ||
        null;
      const fullName = resolvedStaff?.name || entryRecord?.entries?.[0]?.staff_name || "";
      const { firstName, lastName } = splitName(fullName);
      // MYOB timesheets and the daily hours workbook should reflect the actual
      // clocked attendance total, not the sum of chargeable/non-chargeable time entries.
      const rawHours = roundHours(clockRecord?.total_hours || 0);
      const adjustedHours = applyLunchDeduction(date, rawHours);
      const entriesForDay = entryRecord?.entries || [];
      const customer = resolveTimesheetCustomer(entriesForDay, lookup);

      if (!date || adjustedHours <= 0) {
        return null;
      }

      return {
        id: `${staffId || fullName}|${date}`,
        source_type: "daily_attendance",
        source_id: key,
        staff_id: staffId,
        staff_name: fullName,
        employee_id: resolvedStaff?.employee_id || entryRecord?.entries?.[0]?.employee_id || "",
        employee_record_id: cleanCell(resolvedStaff?.employee_record_id || entryRecord?.entries?.[0]?.employee_record_id),
        employee_first_name: firstName,
        employee_last_name: lastName,
        payroll_category: derivePayrollCategory(entriesForDay),
        date,
        units: adjustedHours,
        raw_units: rawHours,
        notes: cleanCell(
          [...new Set(entriesForDay.map((entry) => entry.description || entry.notes).filter(Boolean))]
            .join("; ")
        ),
        job_name: getSingleCleanValue(entriesForDay.map((entry) => entry.job_name || entry.job_title)),
        customer: cleanCell([customer.customer_first_name, customer.customer_last_name].filter(Boolean).join(" ").trim() || customer.customer_last_name),
        // MYOB expects a single job reference in this column. If a day's attendance
        // spans multiple jobs, leave the field blank rather than exporting a
        // comma-joined value that AccountRight cannot interpret consistently.
        job_number: getSingleCleanValue(entriesForDay.map((entry) => entry.job_number)),
        customer_last_name: customer.customer_last_name,
        customer_first_name: customer.customer_first_name,
        customer_card_id: customer.customer_card_id,
        customer_record_id: customer.customer_record_id,
        start_stop_time:
          clockRecord?.clock_in_time && clockRecord?.clock_out_time
            ? `${formatTime(clockRecord.clock_in_time)}-${formatTime(clockRecord.clock_out_time)}`
            : "",
      };
    })
    .filter(Boolean)
    .sort((left, right) => `${left.date}|${left.staff_name}`.localeCompare(`${right.date}|${right.staff_name}`));
}

export function mapActivitySlipRecords(entries, staff, jobs = [], contacts = [], companies = []) {
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const staffByName = new Map(
    staff
      .filter((member) => cleanCell(member.name))
      .map((member) => [cleanCell(member.name).toLowerCase(), member])
  );
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const jobsByNumber = new Map(
    jobs
      .filter((job) => cleanCell(job.job_number))
      .map((job) => [cleanCell(job.job_number).toLowerCase(), job])
  );
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const contactsByName = new Map(
    contacts
      .filter((contact) => cleanCell(contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email))
      .map((contact) => [
        cleanCell(contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email).toLowerCase(),
        contact,
      ])
  );
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const companiesByName = new Map(
    companies
      .filter((company) => cleanCell(company.name))
      .map((company) => [cleanCell(company.name).toLowerCase(), company])
  );

  const mappedRecords = entries
    .map((entry) => {
      const staffMember =
        staffById.get(entry.staff_id) ||
        staffByName.get(cleanCell(entry.staff_name).toLowerCase()) ||
        null;
      const relatedJob =
        (entry.job_id && jobsById.get(entry.job_id)) ||
        jobsByNumber.get(cleanCell(entry.job_number).toLowerCase()) ||
        null;
      const relatedContact =
        (relatedJob?.contact_id && contactsById.get(relatedJob.contact_id)) ||
        contactsByName.get(cleanCell(entry.customer || relatedJob?.contact_name).toLowerCase()) ||
        null;
      const relatedCompany =
        (relatedJob?.company_id && companiesById.get(relatedJob.company_id)) ||
        companiesByName.get(cleanCell(entry.company_name || relatedJob?.company_name).toLowerCase()) ||
        null;
      const customerName = cleanCell(
        entry.customer
        || relatedCompany?.name
        || relatedJob?.company_name
        || relatedContact?.full_name
        || [relatedContact?.first_name, relatedContact?.last_name].filter(Boolean).join(" ")
        || entry.company_name
        || ""
      );
      const activityName = cleanCell(entry.activity || entry.operation || "Labour");

      return {
        id: entry.id,
        source_type: "TimeEntry",
        source_id: entry.id,
        staff_name: entry.staff_name || staffMember?.name || "",
        employee_id: entry.employee_id || staffMember?.employee_id || "",
        customer_name: customerName,
        customer: customerName,
        first_name: "",
        date: entry.date || "",
        activity: activityName,
        job_number: cleanCell(entry.job_number || relatedJob?.job_number || ""),
        job_name: cleanCell(entry.job_name || entry.job_title || relatedJob?.title || relatedJob?.job_name || ""),
        notes: cleanCell(entry.description || entry.notes || ""),
        units: roundHours(entry.hours || 0),
      };
    });

  return groupActivitySlipExportRecords(mappedRecords);
}

export function getActivitySlipMissingFields(record) {
  const missingFields = [];

  if (!cleanCell(record.customer_name)) missingFields.push("Co./Last Name");
  if (!cleanCell(record.employee_id)) missingFields.push("Card ID");
  if (!cleanCell(record.date) || !formatMyobDate(record.date)) missingFields.push("Date");
  if (!cleanCell(record.activity)) missingFields.push("Activity");
  if (!cleanCell(record.job_number)) missingFields.push("Job");
  if (record.units === "" || record.units == null || Number.isNaN(Number(record.units))) missingFields.push("Units");

  return missingFields;
}

export function validateActivitySlipRecords(records) {
  const errors = [];

  records.forEach((record) => {
    const missingFields = getActivitySlipMissingFields(record);

    if (missingFields.length > 0) {
      errors.push({
        id: record.id,
        label: [record.customer_name, record.job_number, record.date].filter(Boolean).join(" · ") || record.source_id || record.id,
        missingFields,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getTimesheetMissingFields(record) {
  const missingFields = [];
  const numericUnits = Number(record.units);

  if (!cleanCell(record.employee_last_name)) missingFields.push("Employee Co./Last Name");
  if (!cleanCell(record.payroll_category)) missingFields.push("Payroll Category");
  if (!cleanCell(record.date) || !formatMyobDate(record.date)) missingFields.push("Date");
  if (record.units === "" || record.units == null || Number.isNaN(numericUnits) || !Number.isFinite(numericUnits)) {
    missingFields.push("Units");
  }
  if (!cleanCell(record.employee_id)) missingFields.push("Employee Card ID");

  return missingFields;
}

export function validateTimesheetRecords(records) {
  const errors = [];

  records.forEach((record) => {
    const missingFields = getTimesheetMissingFields(record);

    if (missingFields.length > 0) {
      errors.push({
        id: record.id,
        label: [record.employee_last_name, record.employee_first_name, record.date].filter(Boolean).join(" · ") || record.source_id || record.id,
        missingFields,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadWorkbook(filename, workbook) {
  const blob = buildXlsxBlob(workbook);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ExportTab({ user, staff, jobs = [] }) {
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";
  const { isModuleEnabled } = useModules();
  const manualEntryEnabled = isModuleEnabled("manual_entry");
  const exportHistoryEnabled = isModuleEnabled("export_history");
  const [dateRange, setDateRange] = useState(null);
  const [payPeriodPreset, setPayPeriodPreset] = useState(null);
  const [exportType, setExportType] = useState("activity_slips");
  const [timeEntries, setTimeEntries] = useState([]);
  const [clockIns, setClockIns] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [exportHistory, setExportHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [pendingActivitySuggestion, setPendingActivitySuggestion] = useState(null);
  const [autoFocusedPendingRange, setAutoFocusedPendingRange] = useState(null);
  const [hasAutoFocusedPendingRange, setHasAutoFocusedPendingRange] = useState(false);

  const handleDateRangeChange = (nextRange) => {
    setAutoFocusedPendingRange(null);
    setDateRange(nextRange);
  };

  const jumpToPendingRange = (suggestion, reason = "manual") => {
    if (!suggestion) {
      return;
    }

    setPayPeriodPreset({
      key: `${suggestion.from}-${suggestion.to}-${reason}-${Date.now()}`,
      mode: "week",
      anchorDate: `${suggestion.from}T00:00:00`,
    });
    setAutoFocusedPendingRange(reason === "auto" ? suggestion : null);
    setDateRange({ from: suggestion.from, to: suggestion.to });
  };

  useEffect(() => {
    void loadHistory();
    void loadRelatedRecords();
  }, []);
  useEffect(() => { if (dateRange) { void loadSourceData(); } }, [dateRange]);

  const records = useMemo(() => {
    if (!dateRange) {
      return [];
    }

    if (exportType === "activity_slips") {
      return mapActivitySlipRecords(
        timeEntries.filter((entry) => !entry.exported),
        staff,
        jobs,
        contacts,
        companies
      );
    }

    return aggregateDailyRecords(clockIns, timeEntries, staff, jobs, contacts, companies);
  }, [clockIns, companies, contacts, dateRange, exportType, jobs, staff, timeEntries]);

  const activitySlipValidation = useMemo(
    () => (exportType === "activity_slips" ? validateActivitySlipRecords(records) : null),
    [exportType, records]
  );

  const invalidActivitySlipMap = useMemo(
    () =>
      new Map(
        (activitySlipValidation?.errors || []).map((error) => [error.id, error.missingFields])
      ),
    [activitySlipValidation]
  );

  const timesheetValidation = useMemo(
    () => (exportType === "timesheets" ? validateTimesheetRecords(records) : null),
    [exportType, records]
  );

  const invalidTimesheetMap = useMemo(
    () =>
      new Map(
        (timesheetValidation?.errors || []).map((error) => [error.id, error.missingFields])
      ),
    [timesheetValidation]
  );

  useEffect(() => {
    setSelected(new Set(records.map((record) => record.id)));
  }, [records]);

  const loadSourceData = async () => {
    setLoading(true);
    setValidationMessage("");
    try {
      const [allTimeEntries, allClockIns] = await Promise.all([
        crmApi.entities.TimeEntry.filter({ status: "completed" }, "-date", 1000),
        crmApi.entities.ClockIn.list("-date", 1000),
      ]);

      const filteredTimeEntries = allTimeEntries.filter(
        (entry) => entry.date >= dateRange.from && entry.date <= dateRange.to
      );
      const filteredClockIns = allClockIns.filter(
        (entry) => entry.date >= dateRange.from && entry.date <= dateRange.to
      );
      const nextPendingSuggestion = buildLatestPendingActivitySuggestion(allTimeEntries, dateRange);

      setPendingActivitySuggestion(nextPendingSuggestion);

      if (
        exportType === "activity_slips"
        && !hasAutoFocusedPendingRange
        && filteredTimeEntries.every((entry) => Boolean(entry.exported))
        && nextPendingSuggestion
      ) {
        setHasAutoFocusedPendingRange(true);
        jumpToPendingRange(nextPendingSuggestion, "auto");
        return;
      }

      setTimeEntries(filteredTimeEntries);
      setClockIns(filteredClockIns);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    const history = await crmApi.entities.ExportHistory.list("-exported_at", 50);
    setExportHistory(history);
  };

  const loadRelatedRecords = async () => {
    const [allContacts, allCompanies] = await Promise.all([
      crmApi.entities.Contact.list("-created_date", 1000),
      crmApi.entities.Company.list("-created_date", 1000),
    ]);

    setContacts(allContacts);
    setCompanies(allCompanies);
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === records.length ? new Set() : new Set(records.map((record) => record.id)));
  };

  const selectedRecords = records.filter((record) => selected.has(record.id));
  const totalHours = selectedRecords.reduce((sum, record) => sum + Number(record.units || 0), 0);

  const exportButtonLabel = exportType === "daily_hours"
    ? `Download Daily Hours Workbook`
    : `Download ${selectedRecords.length} ${exportType === "activity_slips" ? "Activity Slip" : "Timesheet"} Row${selectedRecords.length === 1 ? "" : "s"}`;

  const sectionTitle = exportType === "activity_slips"
    ? "Pending Activity Slip Rows"
    : exportType === "timesheets"
      ? "Timesheet Rows"
      : "Daily Hours Rows";

  const emptyMessage = exportType === "activity_slips"
    ? "All completed time entries for this period have already been exported."
    : "No clock-in or time-entry records were found for this period.";

  const doExport = async () => {
    if (selectedRecords.length === 0 || !dateRange) {
      return;
    }

    setExporting(true);
    setValidationMessage("");

    const batchId = crypto.randomUUID();
    const exportedAt = new Date().toISOString();
    const exportedBy = user?.email || "";

    if (exportType === "activity_slips") {
      const validation = validateActivitySlipRecords(selectedRecords);
      if (!validation.valid) {
        setValidationMessage(
          `Activity slip export stopped. ${validation.errors.length} row${validation.errors.length === 1 ? "" : "s"} are missing required MYOB fields: ` +
          validation.errors
            .slice(0, 8)
            .map((error) => `${error.label} (${error.missingFields.join(", ")})`)
            .join("; ")
        );
        setExporting(false);
        return;
      }

      downloadTextFile(
        `activity_slips_${dateRange.from}_${dateRange.to}.txt`,
        buildActivitySlipTsv(selectedRecords)
      );

      await Promise.all([
        ...selectedRecords.flatMap((record) =>
          (Array.isArray(record.source_ids) && record.source_ids.length > 0 ? record.source_ids : [record.source_id])
            .filter(Boolean)
            .map((sourceId) =>
              crmApi.entities.TimeEntry.update(sourceId, {
                exported: true,
                exported_batch_id: batchId,
              })
            )
        ),
        ...selectedRecords.map((record) =>
          crmApi.entities.ExportHistory.create({
            batch_id: batchId,
            exported_at: exportedAt,
            exported_by: exportedBy,
            export_type: "activity_slips",
            source_type: record.source_type,
            source_id: record.source_id,
            source_ids: record.source_ids || [],
            source_count: record.source_count || (record.source_ids?.length || 1),
            staff_name: record.staff_name,
            employee_id: record.employee_id,
            job_number: record.job_number,
            job_name: record.job_name,
            customer: record.customer,
            activity: record.activity,
            date: record.date,
            hours: record.units,
            description: record.notes,
          })
        ),
      ]);
    } else if (exportType === "timesheets") {
      const validation = validateTimesheetRecords(selectedRecords);
      if (!validation.valid) {
        setValidationMessage(
          `Timesheet export stopped. ${validation.errors.length} row${validation.errors.length === 1 ? "" : "s"} are missing required MYOB fields: ` +
          validation.errors
            .slice(0, 8)
            .map((error) => `${error.label} (${error.missingFields.join(", ")})`)
            .join("; ")
        );
        setExporting(false);
        return;
      }

      downloadTextFile(
        `timesheets_${dateRange.from}_${dateRange.to}.txt`,
        buildTimesheetTsv(selectedRecords)
      );

      await Promise.all(
        selectedRecords.map((record) =>
          crmApi.entities.ExportHistory.create({
            batch_id: batchId,
            exported_at: exportedAt,
            exported_by: exportedBy,
            export_type: "timesheets",
            source_type: record.source_type,
            source_id: record.source_id,
            staff_name: record.staff_name,
            employee_id: record.employee_id,
            job_number: record.job_number,
            job_name: record.job_name,
            customer: record.customer,
            activity: record.payroll_category,
            date: record.date,
            hours: record.units,
            description: record.notes,
          })
        )
      );
    } else {
      const workbook = await buildDailyHoursWorkbook(selectedRecords);
      await downloadWorkbook(`daily_hours_${dateRange.from}_${dateRange.to}.xlsx`, workbook);

      await Promise.all(
        selectedRecords.map((record) =>
          crmApi.entities.ExportHistory.create({
            batch_id: batchId,
            exported_at: exportedAt,
            exported_by: exportedBy,
            export_type: "daily_hours",
            source_type: record.source_type,
            source_id: record.source_id,
            staff_name: record.staff_name,
            employee_id: record.employee_id,
            job_number: record.job_number,
            job_name: record.job_name,
            customer: record.customer,
            date: record.date,
            hours: record.units,
            description: "",
          })
        )
      );
    }

    setExporting(false);
    await loadSourceData();
    await loadHistory();
  };

  return (
    <div className="space-y-6">
      {autoFocusedPendingRange ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Showing Latest Pending Activity Slips</AlertTitle>
          <AlertDescription>
            No pending activity slips were found in the original pay period, so this view jumped to
            {" "}
            {formatDate(autoFocusedPendingRange.from)}
            {" "}
            -
            {" "}
            {formatDate(autoFocusedPendingRange.to)}
            , the latest week with pending rows.
          </AlertDescription>
        </Alert>
      ) : null}
      {validationMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Export Validation Failed</AlertTitle>
          <AlertDescription>{validationMessage}</AlertDescription>
        </Alert>
      )}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Export Settings</h3>
          <div className="flex gap-2">
            {isAdmin && manualEntryEnabled ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/manual-entry">Manual Entry</Link>
              </Button>
            ) : null}
            {isAdmin && exportHistoryEnabled ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/export-history">Export History</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">Pay Period</Label>
            <PayPeriodPicker onRangeChange={handleDateRangeChange} preset={payPeriodPreset} />
          </div>
          <div>
            <Label className="mb-1.5 block">Export Type</Label>
            <Select value={exportType} onValueChange={setExportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activity_slips">Activity Slips (.txt)</SelectItem>
                <SelectItem value="timesheets">Timesheets (.txt)</SelectItem>
                <SelectItem value="daily_hours">Daily Hours Report (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {exportType === "activity_slips" && records.length > 0 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">MYOB Validation Preview</h3>
              <p className="text-sm text-muted-foreground">
                Every activity slip row must be complete on its own for MYOB AccountRight import.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {records.length - (activitySlipValidation?.errors.length || 0)} valid
              </Badge>
              {(activitySlipValidation?.errors.length || 0) > 0 && (
                <Badge variant="destructive">
                  {activitySlipValidation?.errors.length} need attention
                </Badge>
              )}
            </div>
          </div>

          {(activitySlipValidation?.errors.length || 0) === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              All visible activity slip rows currently meet the required MYOB fields.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Invalid rows will stop the export until the missing fields are corrected.
              </div>
              <div className="space-y-2">
                {activitySlipValidation.errors.slice(0, 12).map((error) => (
                  <div key={error.id} className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                    <div className="font-medium text-foreground">{error.label}</div>
                    <div className="text-muted-foreground mt-1">Missing: {error.missingFields.join(", ")}</div>
                  </div>
                ))}
                {activitySlipValidation.errors.length > 12 && (
                  <p className="text-xs text-muted-foreground">
                    Showing first 12 invalid rows of {activitySlipValidation.errors.length}.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {exportType === "timesheets" && records.length > 0 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Timesheet Validation Preview</h3>
              <p className="text-sm text-muted-foreground">
                MYOB timesheet rows must be complete per line and cannot rely on carried-down values.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {records.length - (timesheetValidation?.errors.length || 0)} valid
              </Badge>
              {(timesheetValidation?.errors.length || 0) > 0 && (
                <Badge variant="destructive">
                  {timesheetValidation?.errors.length} need attention
                </Badge>
              )}
            </div>
          </div>

          {(timesheetValidation?.errors.length || 0) === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              All visible timesheet rows currently meet the required MYOB fields.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Invalid rows will stop the export until the missing fields are corrected.
              </div>
              <div className="space-y-2">
                {timesheetValidation.errors.slice(0, 12).map((error) => (
                  <div key={error.id} className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
                    <div className="font-medium text-foreground">{error.label}</div>
                    <div className="text-muted-foreground mt-1">Missing: {error.missingFields.join(", ")}</div>
                  </div>
                ))}
                {timesheetValidation.errors.length > 12 && (
                  <p className="text-xs text-muted-foreground">
                    Showing first 12 invalid rows of {timesheetValidation.errors.length}.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 bg-muted/50 flex justify-between items-center border-b">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={selected.size === records.length && records.length > 0} onChange={toggleAll} className="w-4 h-4 cursor-pointer" />
            <span className="font-semibold">{sectionTitle}</span>
            {records.length > 0 && <Badge variant="secondary">{records.length}</Badge>}
          </div>
          {records.length > 0 && (
            <span className="text-sm text-muted-foreground">{selected.size} selected · {totalHours.toFixed(1)}h</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
        ) : !dateRange ? (
          <div className="p-10 text-center text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            Select a pay period above to load export rows
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>{emptyMessage}</p>
            {exportType === "activity_slips" && pendingActivitySuggestion ? (
              <div className="mx-auto mt-4 max-w-xl rounded-lg border border-border bg-muted/30 px-4 py-4 text-left">
                <p className="text-sm text-foreground">
                  {pendingActivitySuggestion.count}
                  {" "}
                  pending row{pendingActivitySuggestion.count === 1 ? "" : "s"} are waiting in
                  {" "}
                  {formatDate(pendingActivitySuggestion.from)}
                  {" "}
                  -
                  {" "}
                  {formatDate(pendingActivitySuggestion.to)}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => jumpToPendingRange(pendingActivitySuggestion)}
                >
                  Jump to latest pending week
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="divide-y">
            {records.map((record) => (
              <div key={record.id} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/30">
                <input type="checkbox" checked={selected.has(record.id)} onChange={() => toggleSelect(record.id)} className="w-4 h-4 cursor-pointer" />
                <div className="w-24 text-muted-foreground">{formatDate(record.date)}</div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{record.staff_name}</span>
                  <span className="text-muted-foreground ml-2">
                    {exportType === "activity_slips"
                      ? `· ${record.job_number || "No job"} · ${record.activity || "Activity"}`
                      : exportType === "timesheets"
                        ? `· ${record.payroll_category || "Ordinary hours"}`
                        : `· Daily hours report row`}
                  </span>
                  {record.customer_name && (
                    <span className="text-muted-foreground ml-2">· {record.customer_name}</span>
                  )}
                </div>
                {exportType === "activity_slips" && record.source_count > 1 && (
                  <Badge variant="outline" className="shrink-0">
                    {record.source_count} merged
                  </Badge>
                )}
                {exportType === "activity_slips" && (
                  invalidActivitySlipMap.has(record.id) ? (
                    <Badge variant="destructive" className="shrink-0">
                      Missing: {invalidActivitySlipMap.get(record.id).join(", ")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      Valid
                    </Badge>
                  )
                )}
                {exportType === "timesheets" && (
                  invalidTimesheetMap.has(record.id) ? (
                    <Badge variant="destructive" className="shrink-0">
                      Missing: {invalidTimesheetMap.get(record.id).join(", ")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      Valid
                    </Badge>
                  )
                )}
                {exportType === "timesheets" && record.start_stop_time && (
                  <span className="text-muted-foreground font-mono text-xs">{record.start_stop_time}</span>
                )}
                <span className="font-mono">{formatUnits(record.units)}h</span>
              </div>
            ))}
          </div>
        )}

        {records.length > 0 && (
          <div className="px-5 py-3 border-t flex justify-end">
            <Button onClick={doExport} disabled={selected.size === 0 || exporting}>
              {exportType === "daily_hours" ? <FileSpreadsheet className="w-4 h-4 mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
              {exporting ? "Exporting..." : exportButtonLabel}
            </Button>
          </div>
        )}
      </Card>

      {exportHistory.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 bg-muted/50 border-b flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="font-semibold">Recent Exports</span>
          </div>
          <div className="divide-y">
            {Object.entries(
              exportHistory.reduce((acc, entry) => {
                if (!acc[entry.batch_id]) {
                  acc[entry.batch_id] = { ...entry, count: 0, totalHours: 0 };
                }
                acc[entry.batch_id].count += 1;
                acc[entry.batch_id].totalHours += Number(entry.hours || 0);
                return acc;
              }, {})
            ).slice(0, 10).map(([batchId, batch]) => (
              <div key={batchId} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">
                    {batch.export_type === "activity_slips"
                      ? "Activity Slips"
                      : batch.export_type === "timesheets"
                        ? "Timesheets"
                        : "Daily Hours Report"}
                  </span>
                  <span className="text-muted-foreground ml-2">· {batch.count} rows · {batch.totalHours.toFixed(1)}h</span>
                </div>
                <span className="text-muted-foreground text-xs">{formatDate(String(batch.exported_at || "").split("T")[0])}</span>
                <span className="text-muted-foreground text-xs">{batch.exported_by}</span>
                <Badge variant="secondary">Exported</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
