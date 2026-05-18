import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { useModules } from "@/lib/ModuleContext";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import ContactFormFields from "../components/contacts/ContactFormFields";
import { SortableHeader } from "@/components/ui/sortable-header";
import { getNextSortState } from "@/lib/tableSorting";
import {
  buildContactKey,
  buildContactPayload,
  CONTACT_RELATIONSHIP_COLORS,
  CONTACT_RELATIONSHIP_STATUS_OPTIONS,
  CONTACT_TYPE_COLORS,
  CONTACT_TYPE_OPTIONS,
  EMPTY_COMPANY_FORM,
  EMPTY_CONTACT_FORM,
  getContactDisplayName,
  getContactDuplicateMap,
  getContactHealth,
  isLikelyDuplicateContact,
  mapContactToForm,
  normalizeCompanyName,
} from "../lib/contactHelpers";
import { formatDate, formatDateForInput } from "../lib/helpers";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Download,
  Search,
  UploadCloud,
  UserPlus,
  Users,
} from "lucide-react";

const ALL_FILTER_VALUE = "__all";

function unfoldVCardLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce((lines, line) => {
      if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
        lines[lines.length - 1] += line.slice(1);
      } else {
        lines.push(line);
      }
      return lines;
    }, []);
}

function unescapeVCardValue(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseVCardProperty(line) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const left = line.slice(0, separatorIndex);
  const value = unescapeVCardValue(line.slice(separatorIndex + 1));
  const [rawName, ...rawParameters] = left.split(";");
  const params = rawParameters.reduce((accumulator, part) => {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey) {
      return accumulator;
    }

    const key = rawValue ? rawKey.toUpperCase() : "TYPE";
    const values = (rawValue || rawKey)
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    accumulator[key] = [...(accumulator[key] || []), ...values];
    return accumulator;
  }, {});

  return {
    name: String(rawName || "").split(".").pop()?.toUpperCase() || "",
    params,
    value,
  };
}

function parseVCardText(text) {
  const cards = [];
  let currentLines = [];

  unfoldVCardLines(text).forEach((line) => {
    const upperLine = line.toUpperCase();

    if (upperLine === "BEGIN:VCARD") {
      currentLines = [];
      return;
    }

    if (upperLine === "END:VCARD") {
      if (currentLines.length > 0) {
        cards.push(currentLines.map(parseVCardProperty).filter(Boolean));
      }
      currentLines = [];
      return;
    }

    currentLines.push(line);
  });

  return cards;
}

function getCardProperties(card, name) {
  return card.filter((property) => property.name === name);
}

function propertyHasType(property, expectedType) {
  return (property.params.TYPE || []).includes(expectedType);
}

function parseAddress(property) {
  const [poBox = "", extended = "", street = "", city = "", state = "", postal_code = "", country = ""] = String(property.value || "").split(";");
  const address = [street, extended].filter(Boolean).join(", ");
  return { po_box: poBox, address, city, state, postal_code, country };
}

function serializePropertyValueForStorage(property) {
  const rawValue = String(property?.value || "");
  if (property?.name === "PHOTO") {
    return {
      omitted: true,
      byte_length: rawValue.length,
      preview: "[photo omitted]",
    };
  }
  return rawValue;
}

function serializeCardFields(card) {
  return card.reduce((accumulator, property) => {
    const key = property.name.toLowerCase();
    accumulator[key] = [...(accumulator[key] || []), {
      value: serializePropertyValueForStorage(property),
      params: property.params,
    }];
    return accumulator;
  }, {});
}

function buildStoredRawCard(card) {
  return [
    "BEGIN:VCARD",
    ...card.map((property) => {
      const serializedParams = Object.entries(property.params || {})
        .map(([key, values]) => `${key}=${values.join(",")}`)
        .join(";");
      const storedValue = property.name === "PHOTO" ? "[photo omitted]" : property.value;
      return `${property.name}${serializedParams ? `;${serializedParams}` : ""}:${storedValue}`;
    }),
    "END:VCARD",
  ].join("\n");
}

function mapVCardToContact(card, rawCard) {
  const nValue = getCardProperties(card, "N")[0]?.value || "";
  const [lastName = "", firstName = "", middleName = "", honorificPrefix = "", honorificSuffix = ""] = nValue.split(";");
  const formattedName = getCardProperties(card, "FN")[0]?.value || "";
  const [fallbackFirstName = "", ...fallbackLastNameParts] = formattedName.split(/\s+/).filter(Boolean);
  const emails = getCardProperties(card, "EMAIL").map((property) => property.value).filter(Boolean);
  const phoneEntries = getCardProperties(card, "TEL");
  const mobileEntries = phoneEntries.filter((property) => propertyHasType(property, "CELL") || propertyHasType(property, "MOBILE"));
  const phoneEntriesNonMobile = phoneEntries.filter((property) => !mobileEntries.includes(property));
  const phones = phoneEntries.map((property) => property.value).filter(Boolean);
  const mobiles = mobileEntries.map((property) => property.value).filter(Boolean);
  const addresses = getCardProperties(card, "ADR").map(parseAddress);
  const primaryAddress = addresses[0] || {};
  const websites = getCardProperties(card, "URL").map((property) => property.value).filter(Boolean);
  const notes = getCardProperties(card, "NOTE").map((property) => property.value).filter(Boolean).join("\n\n");
  const organization = getCardProperties(card, "ORG")[0]?.value || "";
  const [companyName = ""] = organization.split(";");
  const title = getCardProperties(card, "TITLE")[0]?.value || "";
  const role = getCardProperties(card, "ROLE")[0]?.value || "";
  const birthday = getCardProperties(card, "BDAY")[0]?.value || "";

  return {
    first_name: firstName || fallbackFirstName,
    last_name: lastName || fallbackLastNameParts.join(" "),
    middle_name: middleName,
    honorific_prefix: honorificPrefix,
    honorific_suffix: honorificSuffix,
    full_name: formattedName,
    email: emails[0] || "",
    emails,
    phone: phoneEntriesNonMobile[0]?.value || phones[0] || "",
    mobile: mobiles[0] || "",
    phones,
    mobiles,
    company_name: companyName,
    title,
    role,
    address: primaryAddress.address || "",
    city: primaryAddress.city || "",
    state: primaryAddress.state || "",
    postal_code: primaryAddress.postal_code || "",
    country: primaryAddress.country || "",
    po_box: primaryAddress.po_box || "",
    website: websites[0] || "",
    websites,
    notes,
    birthday,
    type: "client",
    source_format: "vcard",
    vcard_raw: rawCard,
    vcard_fields: serializeCardFields(card),
  };
}

function parseContactsVCard(text) {
  return parseVCardText(text)
    .map((card, index) => ({
      ...mapVCardToContact(card, buildStoredRawCard(card)),
      import_index: index,
    }))
    .filter((contact) => contact.first_name || contact.last_name || contact.email || contact.company_name);
}

function escapeCsvValue(value) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function downloadCsvFile(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildMyobContactRows(records) {
  return [
    [
      "Card Type",
      "Co./Last Name",
      "First Name",
      "Card ID",
      "Company Name",
      "Contact Name",
      "Salutation",
      "Email",
      "Phone # 1",
      "Phone # 2",
      "Phone # 3",
      "Street",
      "City",
      "State",
      "Postcode",
      "Country",
      "Website",
      "Notes",
      "CRM Contact ID",
      "CRM Type",
    ],
    ...records.map((contact) => {
      const displayName = getContactDisplayName(contact);
      const companyName = String(contact.company_name || "").trim();
      const cardName = companyName || String(contact.last_name || displayName || contact.email || "").trim();
      const primaryPhone = String(contact.phone || "").trim();
      const secondaryPhone = (contact.phones || []).filter((value) => value !== primaryPhone)[0] || "";
      const mobilePhone = String(contact.mobile || "").trim() || (contact.mobiles || [])[0] || "";

      return [
        String(contact.type || "").toLowerCase() === "supplier" ? "Supplier" : "Customer",
        cardName,
        String(contact.first_name || "").trim(),
        String(contact.myob_card_id || "").trim(),
        companyName,
        displayName,
        String(contact.honorific_prefix || "").trim(),
        String(contact.email || "").trim(),
        primaryPhone,
        mobilePhone,
        secondaryPhone,
        String(contact.address || "").trim(),
        String(contact.city || "").trim(),
        String(contact.state || "").trim(),
        String(contact.postal_code || "").trim(),
        String(contact.country || "").trim(),
        String(contact.website || "").trim(),
        String(contact.notes || "").trim(),
        String(contact.id || "").trim(),
        String(contact.type || "").trim(),
      ];
    }),
  ];
}

function buildMyobCompanyRows(records) {
  return [
    [
      "Card Type",
      "Co./Last Name",
      "First Name",
      "Card ID",
      "Company Name",
      "Contact Name",
      "Salutation",
      "Email",
      "Phone # 1",
      "Phone # 2",
      "Phone # 3",
      "Street",
      "City",
      "State",
      "Postcode",
      "Country",
      "Website",
      "Notes",
      "CRM Company ID",
      "CRM Type",
    ],
    ...records.map((company) => [
      String(company.type || "").toLowerCase() === "supplier" ? "Supplier" : "Customer",
      String(company.name || "").trim(),
      "",
      String(company.myob_card_id || "").trim(),
      String(company.name || "").trim(),
      "",
      "",
      String(company.email || "").trim(),
      String(company.phone || "").trim(),
      "",
      "",
      String(company.address || "").trim(),
      String(company.city || "").trim(),
      String(company.state || "").trim(),
      String(company.postal_code || "").trim(),
      String(company.country || "").trim(),
      String(company.website || "").trim(),
      String(company.notes || "").trim(),
      String(company.id || "").trim(),
      String(company.type || "").trim(),
    ]),
  ];
}

function compareValues(left, right) {
  const leftValue = left ?? "";
  const rightValue = right ?? "";

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  const leftDate = Date.parse(String(leftValue));
  const rightDate = Date.parse(String(rightValue));
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
    return leftDate - rightDate;
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base", numeric: true });
}

function getLatestInteractionDate(contact, interactionsByContact) {
  const interactionDates = (interactionsByContact.get(contact.id) || [])
    .map((interaction) => interaction.interaction_date || interaction.created_date)
    .filter(Boolean)
    .map((value) => Date.parse(String(value)))
    .filter((value) => !Number.isNaN(value));

  const storedDate = Date.parse(String(contact.last_contacted_date || ""));
  const allDates = Number.isNaN(storedDate) ? interactionDates : [...interactionDates, storedDate];
  if (allDates.length === 0) {
    return "";
  }

  return new Date(Math.max(...allDates)).toISOString();
}

function MetricCard({ icon: Icon, label, value, hint }) {
  return (
    <Card className="rounded-2xl border-border/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function buildOpenWorkBreakdown(linked, options = {}) {
  const segments = [
    options.leadsEnabled ? `${linked.leads} lead${linked.leads === 1 ? "" : "s"}` : null,
    options.quotesEnabled ? `${linked.quotes} quote${linked.quotes === 1 ? "" : "s"}` : null,
    `${linked.jobs} job${linked.jobs === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return segments.join(" · ");
}

export default function Contacts() {
  const navigate = useNavigate();
  const importInputRef = useRef(null);
  const { isModuleEnabled } = useModules();
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactTasks, setContactTasks] = useState([]);
  const [contactInteractions, setContactInteractions] = useState([]);
  const [leads, setLeads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState("contact");
  const [form, setForm] = useState(EMPTY_CONTACT_FORM);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState(null);
  const [activeTab, setActiveTab] = useState("contacts");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER_VALUE);
  const [relationshipFilter, setRelationshipFilter] = useState(ALL_FILTER_VALUE);
  const [tagFilter, setTagFilter] = useState(ALL_FILTER_VALUE);
  const [companyFilter, setCompanyFilter] = useState(ALL_FILTER_VALUE);
  const [attentionFilter, setAttentionFilter] = useState(ALL_FILTER_VALUE);
  const [contactSort, setContactSort] = useState({ key: "name", direction: "asc" });

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      const [
        contactRecords,
        companyRecords,
        taskRecords,
        interactionRecords,
        leadRecords,
        quoteRecords,
        jobRecords,
      ] = await Promise.all([
        crmApi.entities.Contact.list("-created_date", 1000),
        crmApi.entities.Company.list("-created_date", 1000),
        crmApi.entities.ContactTask.list("-created_date", 1000),
        crmApi.entities.ContactInteraction.list("-created_date", 1000),
        leadsEnabled ? crmApi.entities.Lead.list("-created_date", 1000) : Promise.resolve([]),
        quotesEnabled ? crmApi.entities.Quote.list("-created_date", 1000) : Promise.resolve([]),
        crmApi.entities.Job.list("-created_date", 1000),
      ]);

      setContacts(contactRecords);
      setCompanies(companyRecords);
      setContactTasks(taskRecords);
      setContactInteractions(interactionRecords);
      setLeads(leadRecords);
      setQuotes(quoteRecords);
      setJobs(jobRecords);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [leadsEnabled, quotesEnabled]);

  const duplicateMap = useMemo(() => getContactDuplicateMap(contacts), [contacts]);
  const tasksByContact = useMemo(() => {
    const map = new Map();
    contactTasks.forEach((task) => {
      const contactId = String(task.contact_id || "");
      if (!contactId) {
        return;
      }
      map.set(contactId, [...(map.get(contactId) || []), task]);
    });
    return map;
  }, [contactTasks]);
  const interactionsByContact = useMemo(() => {
    const map = new Map();
    contactInteractions.forEach((interaction) => {
      const contactId = String(interaction.contact_id || "");
      if (!contactId) {
        return;
      }
      map.set(contactId, [...(map.get(contactId) || []), interaction]);
    });
    return map;
  }, [contactInteractions]);

  const relatedCounts = useMemo(() => {
    const counts = new Map();
    const ensureEntry = (contactId) => {
      if (!counts.has(contactId)) {
        counts.set(contactId, { leads: 0, quotes: 0, jobs: 0 });
      }
      return counts.get(contactId);
    };

    if (leadsEnabled) {
      leads.forEach((lead) => {
        if (!lead.contact_id) return;
        ensureEntry(String(lead.contact_id)).leads += 1;
      });
    }
    if (quotesEnabled) {
      quotes.forEach((quote) => {
        if (!quote.contact_id) return;
        ensureEntry(String(quote.contact_id)).quotes += 1;
      });
    }
    jobs.forEach((job) => {
      if (!job.contact_id) return;
      ensureEntry(String(job.contact_id)).jobs += 1;
    });

    return counts;
  }, [jobs, leads, leadsEnabled, quotes, quotesEnabled]);

  const contactRows = useMemo(() => {
    return contacts.map((contact) => {
      const pendingTasks = (tasksByContact.get(contact.id) || []).filter((task) => String(task.status || "").toLowerCase() !== "completed");
      const duplicates = duplicateMap.get(contact.id) || [];
      const linked = relatedCounts.get(contact.id) || { leads: 0, quotes: 0, jobs: 0 };
      const latestTouchDate = getLatestInteractionDate(contact, interactionsByContact);
      return {
        contact,
        duplicates,
        pendingTasks,
        linked,
        openWorkCount: linked.jobs + (leadsEnabled ? linked.leads : 0) + (quotesEnabled ? linked.quotes : 0),
        latestTouchDate,
        health: getContactHealth(contact, pendingTasks),
      };
    });
  }, [contacts, duplicateMap, interactionsByContact, leadsEnabled, quotesEnabled, relatedCounts, tasksByContact]);

  const availableTags = useMemo(
    () =>
      [...new Set(
        contacts
          .flatMap((contact) => contact.tags || [])
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
      )].sort((left, right) => compareValues(left, right)),
    [contacts]
  );

  const filteredContactRows = useMemo(() => {
    const normalizedSearch = String(search || "").trim().toLowerCase();

    const filtered = contactRows.filter(({ contact, duplicates, pendingTasks, linked, latestTouchDate, health }) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          getContactDisplayName(contact),
          contact.email,
          contact.phone,
          contact.mobile,
          contact.company_name,
          contact.title,
          contact.role,
          contact.owner,
          ...(contact.tags || []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesType = typeFilter === ALL_FILTER_VALUE || String(contact.type || "") === typeFilter;
      const matchesRelationship = relationshipFilter === ALL_FILTER_VALUE || String(contact.relationship_status || "") === relationshipFilter;
      const matchesTag = tagFilter === ALL_FILTER_VALUE || (contact.tags || []).some((tag) => String(tag || "").trim() === tagFilter);
      const matchesCompany = companyFilter === ALL_FILTER_VALUE || String(contact.company_id || "") === companyFilter || (companyFilter === "__none" && !String(contact.company_id || "").trim());

      const matchesAttention =
        attentionFilter === ALL_FILTER_VALUE ||
        (attentionFilter === "needs_attention" && health.label === "Needs attention") ||
        (attentionFilter === "duplicates" && duplicates.length > 0) ||
        (attentionFilter === "follow_up_due" && (contact.next_follow_up_date || pendingTasks.some((task) => task.due_date))) ||
        (attentionFilter === "open_work" && linked.jobs + (leadsEnabled ? linked.leads : 0) + (quotesEnabled ? linked.quotes : 0) > 0) ||
        (attentionFilter === "recent_touch" && latestTouchDate);

      return matchesSearch && matchesType && matchesRelationship && matchesTag && matchesCompany && matchesAttention;
    });

    const getSortValue = (row) => {
      switch (contactSort.key) {
        case "company":
          return row.contact.company_name;
        case "relationship":
          return row.contact.relationship_status;
        case "owner":
          return row.contact.owner;
        case "next_follow_up_date":
          return row.contact.next_follow_up_date || row.pendingTasks[0]?.due_date || "";
        case "last_contacted_date":
          return row.latestTouchDate;
        case "open_work":
          return row.openWorkCount;
        default:
          return getContactDisplayName(row.contact);
      }
    };

    if (!contactSort.key || !contactSort.direction) return filtered;

    return [...filtered].sort((left, right) => {
      const comparison = compareValues(getSortValue(left), getSortValue(right));
      return contactSort.direction === "asc" ? comparison : -comparison;
    });
  }, [companyFilter, contactRows, contactSort, relationshipFilter, search, attentionFilter, tagFilter, typeFilter, leadsEnabled, quotesEnabled]);

  const companyCards = useMemo(() => {
    return companies
      .filter((company) => {
        const matchesSearch = !search || `${company.name || ""} ${company.email || ""} ${company.phone || ""}`.toLowerCase().includes(search.toLowerCase());
        const matchesType = typeFilter === ALL_FILTER_VALUE || String(company.type || "") === typeFilter;
        const matchesCompanyFilter = companyFilter === ALL_FILTER_VALUE || String(company.id) === companyFilter;
        if (!matchesSearch || !matchesType || !matchesCompanyFilter) {
          return false;
        }

        if (relationshipFilter === ALL_FILTER_VALUE && tagFilter === ALL_FILTER_VALUE) {
          return true;
        }

        return contacts.some((contact) => {
          if (String(contact.company_id || "") !== String(company.id)) {
            return false;
          }
          const matchesRelationship = relationshipFilter === ALL_FILTER_VALUE || String(contact.relationship_status || "") === relationshipFilter;
          const matchesTag = tagFilter === ALL_FILTER_VALUE || (contact.tags || []).some((tag) => String(tag || "").trim() === tagFilter);
          return matchesRelationship && matchesTag;
        });
      })
      .map((company) => {
        const companyContacts = contacts.filter((contact) => String(contact.company_id || "") === String(company.id));
        const primaryContact = companyContacts.find((contact) => contact.is_primary === true) || companyContacts[0] || null;
        return {
          company,
          contactCount: companyContacts.length,
          primaryContact,
        };
      })
      .sort((left, right) => compareValues(left.company.name, right.company.name));
  }, [companies, companyFilter, contacts, relationshipFilter, search, tagFilter, typeFilter]);

  const duplicateContacts = useMemo(
    () => filteredContactRows.filter((row) => row.duplicates.length > 0),
    [filteredContactRows]
  );
  const attentionContacts = useMemo(
    () => filteredContactRows.filter((row) => row.health.label === "Needs attention").slice(0, 8),
    [filteredContactRows]
  );
  const recentTouches = useMemo(
    () => filteredContactRows.filter((row) => row.latestTouchDate).sort((left, right) => compareValues(right.latestTouchDate, left.latestTouchDate)).slice(0, 8),
    [filteredContactRows]
  );

  const resetContactCreateState = () => {
    setForm(EMPTY_CONTACT_FORM);
    setImportError("");
    setImportSummary(null);
    setDragActive(false);
  };

  const openCreateContact = () => {
    setCreateType("contact");
    resetContactCreateState();
    setShowCreate(true);
  };

  const openCreateCompany = () => {
    setCreateType("company");
    setForm(EMPTY_COMPANY_FORM);
    setImportError("");
    setImportSummary(null);
    setShowCreate(true);
  };

  const resolveCompanyForContact = async (contactPayload, companyMap = new Map()) => {
    const normalizedCompany = normalizeCompanyName(contactPayload.company_name);
    if (!normalizedCompany) {
      return null;
    }

    const existingCompany = companyMap.get(normalizedCompany)
      || companies.find((company) => normalizeCompanyName(company.name) === normalizedCompany)
      || null;

    if (existingCompany) {
      companyMap.set(normalizedCompany, existingCompany);
      return existingCompany;
    }

    const createdCompany = await crmApi.entities.Company.create({
      name: contactPayload.company_name.trim(),
      type: String(contactPayload.type || "client").toLowerCase() || "client",
      myob_card_id: "",
      myob_record_id: "",
    });
    companyMap.set(normalizedCompany, createdCompany);
    return createdCompany;
  };

  const syncPrimaryCompanyContact = async (savedContact) => {
    if (!savedContact?.is_primary || !String(savedContact.company_id || savedContact.company_name || "").trim()) {
      return;
    }

    const matchingContacts = contacts.filter((candidate) => {
      if (candidate.id === savedContact.id || candidate.is_primary !== true) {
        return false;
      }

      if (savedContact.company_id) {
        return String(candidate.company_id || "") === String(savedContact.company_id);
      }

      return String(candidate.company_name || "").trim().toLowerCase() === String(savedContact.company_name || "").trim().toLowerCase();
    });

    await Promise.all(
      matchingContacts.map((candidate) =>
        crmApi.entities.Contact.update(candidate.id, {
          is_primary: false,
          row_version: candidate.row_version,
        })
      )
    );
  };

  const handleCreate = async () => {
    if (createType === "contact") {
      const trimmedFirstName = String(form.first_name || "").trim();
      const trimmedLastName = String(form.last_name || "").trim();
      const trimmedEmail = String(form.email || "").trim();

      if (!trimmedFirstName && !trimmedLastName && !trimmedEmail) {
        toast({
          title: "Contact details required",
          description: "Add at least a first name, last name, or email before creating a contact.",
          variant: "destructive",
        });
        return;
      }

      const linkedCompany = await resolveCompanyForContact(form);
      const payload = buildContactPayload(form, linkedCompany);
      const duplicate = contacts.find((contact) => isLikelyDuplicateContact(payload, contact));

      if (duplicate) {
        const shouldOpen = window.confirm(`A matching contact already exists for ${getContactDisplayName(duplicate)}. Open the existing record instead of creating a duplicate?`);
        if (shouldOpen) {
          navigate(`/contacts/${duplicate.id}`);
        }
        return;
      }

      const createdContact = await crmApi.entities.Contact.create(payload);
      await syncPrimaryCompanyContact(createdContact);
      resetContactCreateState();
      setShowCreate(false);
      await loadWorkspace();
      return;
    }

    const trimmedName = String(form.name || "").trim();
    if (!trimmedName) {
      toast({
        title: "Company name required",
        description: "Add a company name before creating the record.",
        variant: "destructive",
      });
      return;
    }

    await crmApi.entities.Company.create({
      ...form,
      name: trimmedName,
      myob_card_id: String(form.myob_card_id || "").trim(),
      myob_record_id: String(form.myob_record_id || "").trim(),
      email: String(form.email || "").trim(),
      phone: String(form.phone || "").trim(),
    });
    setShowCreate(false);
    setForm(EMPTY_COMPANY_FORM);
    await loadWorkspace();
  };

  const importContacts = async (fileList) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    const fileName = String(file.name || "").toLowerCase();
    if (!fileName.endsWith(".vcf") && !fileName.endsWith(".vcard")) {
      setImportError("Please upload a .vcf or .vcard file for contact import.");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportSummary(null);

    try {
      const text = await file.text();
      const parsedContacts = parseContactsVCard(text);

      if (parsedContacts.length === 0) {
        throw new Error("No contacts were found in that vCard file.");
      }

      if (parsedContacts.length === 1) {
        setForm(mapContactToForm(parsedContacts[0]));
        setImportSummary({
          mode: "prefill",
          source: file.name,
          contactName: getContactDisplayName(parsedContacts[0]),
        });
        toast({
          title: "vCard loaded",
          description: "The contact form has been prefilled. Review the fields and create the record when ready.",
        });
        return;
      }

      const companyMap = new Map(
        companies
          .filter((company) => company.name)
          .map((company) => [normalizeCompanyName(company.name), company])
      );
      const existingContactKeys = new Set(contacts.map(buildContactKey));
      const countedCreatedCompanyIds = new Set();

      let createdContacts = 0;
      let createdCompanies = 0;
      let skippedContacts = 0;

      for (const parsedContact of parsedContacts) {
        const contactPayload = mapContactToForm(parsedContact);

        if (!contactPayload.first_name && !contactPayload.last_name && !contactPayload.email) {
          skippedContacts += 1;
          continue;
        }

        const contactKey = buildContactKey(contactPayload);
        if (existingContactKeys.has(contactKey)) {
          skippedContacts += 1;
          continue;
        }

        const hadCompany = Boolean(normalizeCompanyName(contactPayload.company_name));
        const linkedCompany = await resolveCompanyForContact(contactPayload, companyMap);
        if (hadCompany && linkedCompany && !companies.some((company) => company.id === linkedCompany.id) && !countedCreatedCompanyIds.has(linkedCompany.id)) {
          countedCreatedCompanyIds.add(linkedCompany.id);
          createdCompanies += 1;
        }

        const payload = buildContactPayload(contactPayload, linkedCompany);
        const duplicate = contacts.find((contact) => isLikelyDuplicateContact(payload, contact));
        if (duplicate) {
          skippedContacts += 1;
          continue;
        }

        await crmApi.entities.Contact.create(payload);
        existingContactKeys.add(contactKey);
        createdContacts += 1;
      }

      await loadWorkspace();
      setImportSummary({
        mode: "bulk",
        createdContacts,
        createdCompanies,
        skippedContacts,
        source: file.name,
      });
      toast({
        title: "Contacts imported",
        description: `${createdContacts} contacts added${createdCompanies ? `, ${createdCompanies} companies created` : ""}${skippedContacts ? `, ${skippedContacts} skipped` : ""}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import contacts.";
      setImportError(message);
      toast({
        title: "Import failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const exportMyobCsv = () => {
    if (activeTab === "contacts") {
      if (filteredContactRows.length === 0) {
        toast({
          title: "Nothing to export",
          description: "There are no contacts in the current view.",
        });
        return;
      }
      downloadCsvFile(`myob_contacts_${formatDateForInput(new Date())}.csv`, buildMyobContactRows(filteredContactRows.map((row) => row.contact)));
      toast({
        title: "MYOB contacts exported",
        description: `${filteredContactRows.length} contacts exported to CSV.`,
      });
      return;
    }

    if (companyCards.length === 0) {
      toast({
        title: "Nothing to export",
        description: "There are no companies in the current view.",
      });
      return;
    }

    downloadCsvFile(`myob_companies_${formatDateForInput(new Date())}.csv`, buildMyobCompanyRows(companyCards.map((entry) => entry.company)));
    toast({
      title: "MYOB companies exported",
      description: `${companyCards.length} companies exported to CSV.`,
    });
  };

  const toggleContactSort = (key) => {
    setContactSort((current) => getNextSortState(current, key));
  };

  const duplicateContactCount = new Set(duplicateContacts.flatMap((row) => [row.contact.id, ...row.duplicates.map((item) => item.id)])).size;
  const dueFollowUps = filteredContactRows.filter((row) => row.health.label === "Needs attention").length;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 lg:p-6">
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} contacts · ${companies.length} companies`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportMyobCsv}>
              <Download className="mr-1.5 h-4 w-4" />
              Export MYOB CSV
            </Button>
            <Button variant="outline" size="sm" onClick={openCreateCompany}>
              <Building2 className="mr-1.5 h-4 w-4" />
              Add Company
            </Button>
            <Button size="sm" onClick={openCreateContact}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add Contact
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Visible Contacts" value={String(filteredContactRows.length)} hint="Filtered people in the current view" />
        <MetricCard icon={Building2} label="Companies" value={String(companyCards.length)} hint="Linked organisations in scope" />
        <MetricCard icon={CalendarClock} label="Needs Attention" value={String(dueFollowUps)} hint="Overdue follow-ups or stale contact health" />
        <MetricCard icon={AlertTriangle} label="Duplicate Watch" value={String(duplicateContactCount)} hint="Potential duplicate contacts detected" />
      </div>

      <Card className="mb-4 rounded-2xl border-border/80 p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_160px_180px_180px_220px_200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, company, email, phone, role, owner, or tag"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All types</SelectItem>
              {CONTACT_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
            <SelectTrigger><SelectValue placeholder="All relationships" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All relationships</SelectItem>
              {CONTACT_RELATIONSHIP_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger><SelectValue placeholder="All tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All tags</SelectItem>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger><SelectValue placeholder="All companies" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All companies</SelectItem>
              <SelectItem value="__none">No linked company</SelectItem>
              {companies
                .slice()
                .sort((left, right) => compareValues(left.name, right.name))
                .map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Select value={attentionFilter} onValueChange={setAttentionFilter}>
            <SelectTrigger><SelectValue placeholder="All conditions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All conditions</SelectItem>
              <SelectItem value="needs_attention">Needs attention</SelectItem>
              <SelectItem value="duplicates">Possible duplicates</SelectItem>
              <SelectItem value="follow_up_due">Follow-up scheduled</SelectItem>
              <SelectItem value="open_work">Open work linked</SelectItem>
              <SelectItem value="recent_touch">Recently contacted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="contacts">Contacts ({filteredContactRows.length})</TabsTrigger>
            <TabsTrigger value="companies">Companies ({companyCards.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="contacts" className="mt-0 min-h-0 flex-1">
          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-border/80">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Contact workspace</h2>
                  <p className="text-xs text-muted-foreground">Scan owner, follow-up, duplicates, and linked work from one view.</p>
                </div>
                <div className="text-xs text-muted-foreground">{filteredContactRows.length} results</div>
              </div>

              {filteredContactRows.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-6">
                  <EmptyState icon={Users} title="No contacts found" actionLabel="Add Contact" onAction={openCreateContact} />
                </div>
              ) : (
                <div className="min-h-0 flex-1">
                  <ScrollArea className="h-full">
                    <div className="hidden min-w-0 md:block">
                      <table className="w-full table-fixed text-sm">
                        <thead className="sticky top-0 z-10 bg-card">
                          <tr className="border-b bg-muted/40 text-left">
                            {[
                              ["Contact", "name", "w-[26%]"],
                              ["Company", "company", "w-[18%]"],
                              ["Relationship", "relationship", "w-[12%]"],
                              ["Owner", "owner", "w-[12%]"],
                              ["Last Touch", "last_contacted_date", "w-[10%]"],
                              ["Next Follow-up", "next_follow_up_date", "w-[10%]"],
                              ["Open Work", "open_work", "w-[12%]"],
                            ].map(([label, key, width]) => (
                              <SortableHeader key={key} columnKey={key} sortState={contactSort} onSort={toggleContactSort} className={`px-4 py-3 font-medium text-muted-foreground ${width}`}>
                                {label}
                              </SortableHeader>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContactRows.map((row) => {
                            const { contact, duplicates, pendingTasks, linked, latestTouchDate, health } = row;
                            return (
                              <tr key={contact.id} className="cursor-pointer border-b align-top transition-colors hover:bg-muted/30" onClick={() => navigate(`/contacts/${contact.id}`)}>
                                <td className="px-4 py-3">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-foreground">{getContactDisplayName(contact)}</p>
                                      <StatusBadge label={contact.type || "client"} color={CONTACT_TYPE_COLORS[contact.type] || "slate"} />
                                      {contact.is_primary ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Primary</span> : null}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {[contact.title, contact.role, contact.email].filter(Boolean).join(" · ") || "No role or email recorded"}
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      <StatusBadge label={health.label} color={health.color} />
                                      {duplicates.length > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">{duplicates.length} duplicate{duplicates.length === 1 ? "" : "s"}</span> : null}
                                      {pendingTasks.length > 0 ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{pendingTasks.length} task{pendingTasks.length === 1 ? "" : "s"}</span> : null}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1">
                                    <p className="truncate font-medium text-foreground">{contact.company_name || "No company"}</p>
                                    <p className="truncate text-xs text-muted-foreground">{contact.phone || contact.mobile || "No phone recorded"}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <StatusBadge label={contact.relationship_status || "active"} color={CONTACT_RELATIONSHIP_COLORS[contact.relationship_status] || "slate"} />
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{contact.owner || "Unassigned"}</td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(latestTouchDate)}</td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(contact.next_follow_up_date || pendingTasks[0]?.due_date)}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-foreground">{row.openWorkCount}</p>
                                  <p className="text-xs text-muted-foreground">{buildOpenWorkBreakdown(linked, { leadsEnabled, quotesEnabled })}</p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-3 p-4 md:hidden">
                      {filteredContactRows.map((row) => {
                        const { contact, duplicates, pendingTasks, latestTouchDate, health } = row;
                        return (
                          <button
                            key={contact.id}
                            type="button"
                            className="w-full rounded-xl border p-4 text-left"
                            onClick={() => navigate(`/contacts/${contact.id}`)}
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <StatusBadge label={contact.type || "client"} color={CONTACT_TYPE_COLORS[contact.type] || "slate"} />
                              <StatusBadge label={health.label} color={health.color} />
                              {duplicates.length > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">{duplicates.length} duplicate{duplicates.length === 1 ? "" : "s"}</span> : null}
                            </div>
                            <p className="font-semibold text-foreground">{getContactDisplayName(contact)}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{[contact.company_name, contact.title].filter(Boolean).join(" · ") || contact.email || "No company or role yet"}</p>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                              <div>
                                <p className="font-medium text-foreground">{contact.owner || "Unassigned"}</p>
                                <p>Owner</p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{formatDate(contact.next_follow_up_date || pendingTasks[0]?.due_date)}</p>
                                <p>Next follow-up</p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{formatDate(latestTouchDate)}</p>
                                <p>Last touch</p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground">{row.openWorkCount}</p>
                                <p>Open work</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </Card>

            <div className="grid min-h-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
              <Card className="flex min-h-0 flex-col rounded-2xl border-border/80">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Needs attention</h3>
                  <p className="text-xs text-muted-foreground">Contacts with overdue follow-up signals.</p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-3 p-4">
                    {attentionContacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing urgent in the current view.</p>
                    ) : (
                      attentionContacts.map((row) => (
                        <button key={row.contact.id} type="button" className="w-full rounded-xl border p-3 text-left hover:bg-muted/40" onClick={() => navigate(`/contacts/${row.contact.id}`)}>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <StatusBadge label={row.health.label} color={row.health.color} />
                            <StatusBadge label={row.contact.relationship_status || "active"} color={CONTACT_RELATIONSHIP_COLORS[row.contact.relationship_status] || "slate"} />
                          </div>
                          <p className="font-medium text-foreground">{getContactDisplayName(row.contact)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(row.contact.next_follow_up_date || row.pendingTasks[0]?.due_date)} · {row.contact.owner || "Unassigned"}</p>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>

              <Card className="flex min-h-0 flex-col rounded-2xl border-border/80">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Duplicate watchlist</h3>
                  <p className="text-xs text-muted-foreground">Possible duplicate people worth merging.</p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-3 p-4">
                    {duplicateContacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No obvious duplicate contacts in the current view.</p>
                    ) : (
                      duplicateContacts.slice(0, 8).map((row) => (
                        <button key={row.contact.id} type="button" className="w-full rounded-xl border p-3 text-left hover:bg-muted/40" onClick={() => navigate(`/contacts/${row.contact.id}`)}>
                          <p className="font-medium text-foreground">{getContactDisplayName(row.contact)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{row.contact.company_name || row.contact.email || "Potential match"}</p>
                          <p className="mt-2 text-xs font-medium text-amber-700">{row.duplicates.length} possible duplicate{row.duplicates.length === 1 ? "" : "s"}</p>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>

              <Card className="flex min-h-0 flex-col rounded-2xl border-border/80 md:col-span-2 xl:col-span-1">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Recently touched</h3>
                  <p className="text-xs text-muted-foreground">Who the team has spoken with most recently.</p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-3 p-4">
                    {recentTouches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No interaction history has been logged yet.</p>
                    ) : (
                      recentTouches.map((row) => (
                        <button key={row.contact.id} type="button" className="w-full rounded-xl border p-3 text-left hover:bg-muted/40" onClick={() => navigate(`/contacts/${row.contact.id}`)}>
                          <p className="font-medium text-foreground">{getContactDisplayName(row.contact)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{row.contact.company_name || row.contact.email || "No company or email"}</p>
                          <p className="mt-2 text-xs font-medium text-foreground">{formatDate(row.latestTouchDate)}</p>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="companies" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {companyCards.length === 0 ? (
                <Card className="col-span-full rounded-2xl border-border/80 p-8">
                  <EmptyState icon={Building2} title="No companies found" actionLabel="Add Company" onAction={openCreateCompany} />
                </Card>
              ) : (
                companyCards.map(({ company, contactCount, primaryContact }) => (
                  <button
                    key={company.id}
                    type="button"
                    className="rounded-2xl border bg-card p-5 text-left transition-shadow hover:shadow-md"
                    onClick={() => navigate(`/companies/${company.id}`)}
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StatusBadge label={company.type || "client"} color={CONTACT_TYPE_COLORS[company.type] || "slate"} />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{company.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{[company.email, company.phone].filter(Boolean).join(" · ") || "No primary contact info"}</p>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Contacts</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{contactCount}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Primary</p>
                        <p className="mt-1 font-medium text-foreground">{primaryContact ? getContactDisplayName(primaryContact) : "Not set"}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) {
            if (createType === "contact") {
              resetContactCreateState();
            } else {
              setForm(EMPTY_COMPANY_FORM);
            }
          }
        }}
      >
        <DialogContent className={createType === "contact" ? "max-w-6xl p-0" : "max-w-lg"}>
          {createType === "contact" ? (
            <div className="flex max-h-[90vh] flex-col">
              <DialogHeader className="border-b px-6 py-4">
                <DialogTitle>New Contact</DialogTitle>
                <DialogDescription>Create a rich contact record with ownership, follow-up dates, tags, and linked company context.</DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1">
                <div className="space-y-5 px-6 py-5">
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".vcf,.vcard,text/vcard,text/x-vcard"
                    className="hidden"
                    onChange={(event) => {
                      void importContacts(event.target.files);
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                    onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                    onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                      void importContacts(event.dataTransfer.files);
                    }}
                    className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                  >
                    <UploadCloud className="mx-auto mb-3 h-7 w-7 text-primary" />
                    <p className="text-sm font-semibold">{importing ? "Importing vCard..." : "Import from vCard"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Drop a `.vcf` or `.vcard` file here to prefill this form or bulk import multiple contacts.</p>
                  </button>

                  {importError ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {importError}
                    </div>
                  ) : null}

                  {importSummary?.mode === "prefill" ? (
                    <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                      Loaded <span className="font-medium">{importSummary.contactName}</span> from <span className="font-medium">{importSummary.source}</span>. Review the fields below before creating the contact.
                    </div>
                  ) : null}

                  {importSummary?.mode === "bulk" ? (
                    <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                      Imported <span className="font-semibold">{importSummary.createdContacts}</span> contacts from <span className="font-medium">{importSummary.source}</span>.
                      {importSummary.createdCompanies > 0 ? ` ${importSummary.createdCompanies} new companies were created.` : ""}
                      {importSummary.skippedContacts > 0 ? ` ${importSummary.skippedContacts} duplicate or empty rows were skipped.` : ""}
                    </div>
                  ) : null}

                  <ContactFormFields form={form} setForm={setForm} companies={companies} />
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2 border-t px-6 py-4">
                <Button variant="outline" onClick={() => { setShowCreate(false); resetContactCreateState(); }}>Cancel</Button>
                <Button onClick={handleCreate}>Create Contact</Button>
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>New Company</DialogTitle>
                <DialogDescription>Create a new company record.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="company-create-name">Company Name *</Label>
                  <Input id="company-create-name" value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.type || "client"} onValueChange={(value) => setForm({ ...form, type: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTACT_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="company-create-email">Email</Label>
                    <Input id="company-create-email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="company-create-phone">Phone</Label>
                    <Input id="company-create-phone" value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="company-create-myob-card-id">MYOB Card ID</Label>
                    <Input id="company-create-myob-card-id" value={form.myob_card_id || ""} onChange={(event) => setForm({ ...form, myob_card_id: event.target.value })} className="font-mono" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="company-create-myob-record-id">MYOB Record ID</Label>
                  <Input id="company-create-myob-record-id" value={form.myob_record_id || ""} onChange={(event) => setForm({ ...form, myob_record_id: event.target.value })} className="font-mono" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button onClick={handleCreate}>Create Company</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
