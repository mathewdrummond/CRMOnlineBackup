import { crmApi } from "@/api/localApiClient";

const SUPPLIER_TYPES = new Set(["supplier", "subcontractor"]);

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function getSupplierTypeFromLegacy(record) {
  return String(record?.category || "").toLowerCase() === "subcontractor" ? "subcontractor" : "supplier";
}

function buildSupplierCompanyPayload(record) {
  return {
    name: String(record?.name || "").trim(),
    type: getSupplierTypeFromLegacy(record),
    category: String(record?.category || "").trim() || "general",
    payment_terms: String(record?.payment_terms || "").trim() || "30_days",
    contact_name: String(record?.contact_name || "").trim(),
    phone: String(record?.phone || "").trim(),
    email: String(record?.email || "").trim(),
    status: String(record?.status || "").trim() || "active",
  };
}

export async function listSupplierCompanies() {
  const companies = await crmApi.entities.Company.list("-created_date", 500);
  return companies.filter((company) => SUPPLIER_TYPES.has(String(company.type || "").toLowerCase()));
}

export async function ensureSupplierCompaniesSynced() {
  const [legacySuppliers, companies] = await Promise.all([
    crmApi.entities.Supplier.list("-created_date", 500),
    crmApi.entities.Company.list("-created_date", 500),
  ]);

  const companiesByName = new Map(
    companies
      .filter((company) => normalizeName(company.name))
      .map((company) => [normalizeName(company.name), company])
  );

  for (const supplier of legacySuppliers) {
    const normalizedName = normalizeName(supplier.name);
    if (!normalizedName) {
      continue;
    }

    const payload = buildSupplierCompanyPayload(supplier);
    const existingCompany = companiesByName.get(normalizedName);

    if (!existingCompany) {
      const createdCompany = await crmApi.entities.Company.create(payload);
      companiesByName.set(normalizedName, createdCompany);
      continue;
    }

    const nextType = SUPPLIER_TYPES.has(String(existingCompany.type || "").toLowerCase())
      ? existingCompany.type
      : payload.type;
    const nextPayload = {
      ...existingCompany,
      type: nextType,
      category: existingCompany.category || payload.category,
      payment_terms: existingCompany.payment_terms || payload.payment_terms,
      contact_name: existingCompany.contact_name || payload.contact_name,
      phone: existingCompany.phone || payload.phone,
      email: existingCompany.email || payload.email,
      status: existingCompany.status || payload.status,
    };

    if (
      nextPayload.type !== existingCompany.type ||
      nextPayload.category !== existingCompany.category ||
      nextPayload.payment_terms !== existingCompany.payment_terms ||
      nextPayload.contact_name !== existingCompany.contact_name ||
      nextPayload.phone !== existingCompany.phone ||
      nextPayload.email !== existingCompany.email ||
      nextPayload.status !== existingCompany.status
    ) {
      await crmApi.entities.Company.update(existingCompany.id, nextPayload);
    }
  }

  return listSupplierCompanies();
}
