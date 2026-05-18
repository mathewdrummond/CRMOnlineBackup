import {
  buildLeadConversionJobPayload,
  getCustomerDeleteProtection,
  getNextSequentialJobNumber,
} from "./coreFlowHelpers";

describe("coreFlowHelpers", () => {
  test("getNextSequentialJobNumber returns the next JOB sequence", () => {
    expect(getNextSequentialJobNumber([
      { job_number: "JOB-0007" },
      { job_number: "JOB-0015" },
      { job_number: "OTHER-9999" },
    ])).toBe("JOB-0016");
  });

  test("buildLeadConversionJobPayload maps core lead fields into a direct job payload", () => {
    expect(buildLeadConversionJobPayload({
      id: "lead-1",
      title: "  New Kitchen  ",
      contact_id: "contact-1",
      contact_name: "Jamie Customer",
      company_id: "company-1",
      company_name: "Millbrook Client",
      site_address: "123 Sample Road",
      description: "Cabinetry and install",
      value: "4500",
    }, "job-0042")).toEqual({
      title: "New Kitchen",
      job_number: "JOB-0042",
      lead_id: "lead-1",
      contact_id: "contact-1",
      contact_name: "Jamie Customer",
      company_id: "company-1",
      company_name: "Millbrook Client",
      site_address: "123 Sample Road",
      notes: "Cabinetry and install",
      status: "planning",
      quoted_value: 4500,
      job_source: "lead_conversion",
    });
  });

  test("getCustomerDeleteProtection blocks deletion when linked records exist", () => {
    expect(getCustomerDeleteProtection({ jobs: 1, quotes: 2 })).toEqual({
      canDelete: false,
      message: "This record is linked to 2 quotes, 1 jobs. Archive it instead of deleting so existing history stays intact.",
    });
  });

  test("getCustomerDeleteProtection allows delete when there are no links", () => {
    expect(getCustomerDeleteProtection({})).toEqual({
      canDelete: true,
      message: "",
    });
  });
});
