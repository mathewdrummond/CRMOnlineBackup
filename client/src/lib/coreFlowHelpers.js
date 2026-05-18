export function getNextSequentialJobNumber(jobs = [], prefix = "JOB") {
  const nextSequence = jobs.reduce((maxValue, job) => {
    const match = String(job?.job_number || "").trim().toUpperCase().match(/^JOB-(\d{4,})$/);
    if (!match) {
      return maxValue;
    }

    return Math.max(maxValue, Number(match[1]) || 0);
  }, 0) + 1;

  return `${prefix}-${String(nextSequence).padStart(4, "0")}`;
}

export function buildLeadConversionJobPayload(lead, jobNumber) {
  const trimmedJobNumber = String(jobNumber || "").trim().toUpperCase();
  return {
    title: String(lead?.title || "").trim(),
    job_number: trimmedJobNumber,
    lead_id: lead?.id || "",
    contact_id: lead?.contact_id || "",
    contact_name: String(lead?.contact_name || "").trim(),
    company_id: lead?.company_id || "",
    company_name: String(lead?.company_name || "").trim(),
    site_address: String(lead?.site_address || "").trim(),
    notes: String(lead?.description || "").trim(),
    status: "planning",
    quoted_value: Number(lead?.value || 0),
    job_source: "lead_conversion",
  };
}

export function getCustomerDeleteProtection(relationships = {}) {
  const counts = {
    contacts: Number(relationships.contacts || 0),
    leads: Number(relationships.leads || 0),
    quotes: Number(relationships.quotes || 0),
    jobs: Number(relationships.jobs || 0),
  };

  const activeLinks = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}`);

  return {
    canDelete: activeLinks.length === 0,
    message:
      activeLinks.length === 0
        ? ""
        : `This record is linked to ${activeLinks.join(", ")}. Archive it instead of deleting so existing history stays intact.`,
  };
}
