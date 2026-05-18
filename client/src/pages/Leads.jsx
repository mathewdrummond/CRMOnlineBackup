import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import LeadCategorySettingsDialog from "../components/leads/LeadCategorySettingsDialog";
import { SortableHeader } from "@/components/ui/sortable-header";
import { LEAD_STAGES, formatCurrency, formatDate, getStageConfig } from "../lib/helpers";
import { useSortableRows } from "@/lib/tableSorting";
import {
  getDefaultLeadCategory,
  getLeadCategoryForLead,
  sortLeadCategories,
} from "../lib/leadCategories";
import { toast } from "@/components/ui/use-toast";
import {
  CalendarClock,
  DollarSign,
  FolderOpen,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings2,
  Target,
} from "lucide-react";

const ALL_FILTER_VALUE = "__all";
const NO_CONTACT_VALUE = "__none";
const CREATE_CONTACT_VALUE = "__create_contact";
const LEAD_SORT_COLUMNS = {
  lead: { accessor: (lead) => lead.title, type: "text" },
  customer: { accessor: (lead) => lead.contact_name || lead.company_name, type: "text" },
  category: { accessor: (lead) => lead.category_name || lead.category || lead.lead_category_id, type: "text" },
  stage: { accessor: (lead) => lead.stage, type: "status" },
  owner: { accessor: (lead) => lead.assigned_to, type: "text" },
  close: { accessor: (lead) => lead.expected_close_date, type: "date" },
  value: { accessor: (lead) => lead.value, type: "currency" },
};

function getContactDisplayName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.full_name || contact.email || "Unnamed Contact";
}

function normalizeContactMatchValue(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function splitContactName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { first_name: parts[0] || "", last_name: "" };
  }

  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1],
  };
}

function findMatchingContact(contacts, contactName, companyName) {
  const normalizedName = normalizeContactMatchValue(contactName);
  const normalizedCompany = normalizeContactMatchValue(companyName);

  if (!normalizedName) {
    return null;
  }

  return contacts.find((contact) => {
    const candidateName = normalizeContactMatchValue(getContactDisplayName(contact));
    const candidateCompany = normalizeContactMatchValue(contact.company_name);
    return candidateName === normalizedName && (!normalizedCompany || candidateCompany === normalizedCompany);
  }) || null;
}

function makeEmptyLeadForm(defaultCategoryId = "") {
  return {
    title: "",
    value: "",
    stage: "new_enquiry",
    source: "phone",
    priority: "medium",
    description: "",
    contact_id: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    create_contact: false,
    company_id: "",
    company_name: "",
    expected_close: "",
    site_address: "",
    category_id: defaultCategoryId,
  };
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

function getDaysUntil(dateString) {
  if (!dateString) {
    return Number.POSITIVE_INFINITY;
  }

  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getRenderKey(prefix, value, index) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue ? `${prefix}-${normalizedValue}-${index}` : `${prefix}-${index}`;
}

function getQuoteRecencyValue(quote) {
  return String(quote?.updated_date || quote?.created_date || "");
}

function compareQuotesByRecency(left, right) {
  return getQuoteRecencyValue(right).localeCompare(getQuoteRecencyValue(left));
}

function findMostRecentQuoteForLead(lead, quotes = []) {
  const leadId = String(lead?.id || "").trim();
  const contactId = String(lead?.contact_id || "").trim();
  const normalizedLeadContact = normalizeContactMatchValue(lead?.contact_name);
  const normalizedLeadCompany = normalizeContactMatchValue(lead?.company_name);
  const normalizedLeadEmail = normalizeContactMatchValue(lead?.contact_email);

  const sortedQuotes = [...quotes].sort(compareQuotesByRecency);
  const byLeadId = leadId
    ? sortedQuotes.find((quote) => String(quote?.lead_id || "").trim() === leadId)
    : null;
  if (byLeadId) return byLeadId;

  const byContactId = contactId
    ? sortedQuotes.find((quote) => String(quote?.contact_id || "").trim() === contactId)
    : null;
  if (byContactId) return byContactId;

  const byEmail = normalizedLeadEmail
    ? sortedQuotes.find((quote) => normalizeContactMatchValue(quote?.contact_email) === normalizedLeadEmail)
    : null;
  if (byEmail) return byEmail;

  return sortedQuotes.find((quote) => {
    const quoteContact = normalizeContactMatchValue(quote?.contact_name);
    const quoteCompany = normalizeContactMatchValue(quote?.company_name);
    if (!normalizedLeadContact && !normalizedLeadCompany) {
      return false;
    }
    if (normalizedLeadContact && quoteContact !== normalizedLeadContact) {
      return false;
    }
    if (normalizedLeadCompany && quoteCompany && quoteCompany !== normalizedLeadCompany) {
      return false;
    }
    return Boolean(normalizedLeadContact ? quoteContact : quoteCompany);
  }) || null;
}

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingLead, setSavingLead] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCategorySettings, setShowCategorySettings] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState(ALL_FILTER_VALUE);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER_VALUE);
  const [form, setForm] = useState(makeEmptyLeadForm());

  const loadLeads = async () => {
    setLoadError("");
    const [leadRecords, contactRecords, quoteRecords, categoryRecords] = await Promise.all([
      crmApi.entities.Lead.list("-created_date", 250),
      crmApi.entities.Contact.list("-created_date", 500),
      crmApi.entities.Quote.list("-updated_date", 500),
      crmApi.entities.LeadCategory.list("sort_order", 100),
    ]);
    setLeads(Array.isArray(leadRecords) ? leadRecords : []);
    setContacts(Array.isArray(contactRecords) ? contactRecords : []);
    setQuotes(Array.isArray(quoteRecords) ? quoteRecords : []);
    setCategories(sortLeadCategories(Array.isArray(categoryRecords) ? categoryRecords : []));
  };

  const reloadLeads = async () => {
    setLoading(true);
    try {
      await loadLeads();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Leads could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadLeads();
  }, []);

  const defaultCategory = useMemo(() => getDefaultLeadCategory(categories), [categories]);

  useEffect(() => {
    setForm((current) => {
      if (String(current.category_id || "").trim() && categories.some((category) => category.id === current.category_id)) {
        return current;
      }

      return {
        ...current,
        category_id: defaultCategory?.id || "",
      };
    });
  }, [categories, defaultCategory?.id]);

  useEffect(() => {
    if (categoryFilter === ALL_FILTER_VALUE) {
      return;
    }

    if (!categories.some((category) => category.id === categoryFilter)) {
      setCategoryFilter(ALL_FILTER_VALUE);
    }
  }, [categories, categoryFilter]);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((left, right) =>
        getContactDisplayName(left).localeCompare(getContactDisplayName(right), undefined, { sensitivity: "base", numeric: true })
      ),
    [contacts]
  );

  const filteredLeads = useMemo(() => {
    const normalizedSearch = String(search || "").trim().toLowerCase();

    return leads.filter((lead) => {
      const leadCategory = getLeadCategoryForLead(lead, categories);
      const matchesSearch =
        !normalizedSearch ||
        [
          lead.title,
          lead.contact_name,
          lead.company_name,
          lead.site_address,
          lead.assigned_to,
          leadCategory?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesStage = stageFilter === ALL_FILTER_VALUE || lead.stage === stageFilter;
      const matchesCategory =
        categoryFilter === ALL_FILTER_VALUE ||
        String(leadCategory?.id || "") === categoryFilter;

      return matchesSearch && matchesStage && matchesCategory;
    });
  }, [categories, categoryFilter, leads, search, stageFilter]);
  const leadSortColumns = useMemo(
    () => ({
      ...LEAD_SORT_COLUMNS,
      category: { accessor: (lead) => getLeadCategoryForLead(lead, categories)?.name, type: "text" },
    }),
    [categories]
  );
  const { sortedRows: sortedLeads, sortState: leadSortState, requestSort: requestLeadSort } = useSortableRows(filteredLeads, leadSortColumns);

  const stageSummaries = useMemo(
    () =>
      LEAD_STAGES.map((stage) => {
        const stageLeads = sortedLeads.filter((lead) => lead.stage === stage.value);
        return {
          ...stage,
          count: stageLeads.length,
          value: stageLeads.reduce((sum, lead) => sum + Number(lead.value || 0), 0),
        };
      }),
    [sortedLeads]
  );

  const categoryCounts = useMemo(() => {
    const counts = {};
    leads.forEach((lead) => {
      const leadCategory = getLeadCategoryForLead(lead, categories);
      const categoryId = String(leadCategory?.id || "");
      counts[categoryId] = Number(counts[categoryId] || 0) + 1;
    });
    return counts;
  }, [categories, leads]);

  const weightedPipeline = useMemo(
    () =>
      filteredLeads.reduce(
        (sum, lead) => sum + Number(lead.value || 0) * (Number(lead.probability || 0) / 100),
        0
      ),
    [filteredLeads]
  );

  const closingSoonLeads = useMemo(
    () =>
      [...filteredLeads]
        .filter((lead) => Number.isFinite(getDaysUntil(lead.expected_close)) && getDaysUntil(lead.expected_close) <= 14)
        .sort((left, right) => getDaysUntil(left.expected_close) - getDaysUntil(right.expected_close))
        .slice(0, 8),
    [filteredLeads]
  );

  const saveLead = async () => {
    const trimmedTitle = String(form.title || "").trim();
    const selectedContact = contacts.find((contact) => contact.id === form.contact_id) || null;
    const manualContactName = String(form.contact_name || "").trim();
    const manualCompanyName = String(form.company_name || "").trim();
    const contactName = selectedContact ? getContactDisplayName(selectedContact) : manualContactName;
    const resolvedCategoryId = String(form.category_id || defaultCategory?.id || "").trim();

    if (!trimmedTitle) {
      toast({
        variant: "destructive",
        title: "Lead title required",
        description: "Add a title before creating the enquiry.",
      });
      return;
    }

    if (!contactName && !String(form.company_name || "").trim()) {
      toast({
        variant: "destructive",
        title: "Contact details required",
        description: "Choose an existing contact or enter a contact or company name.",
      });
      return;
    }

    setSavingLead(true);
    try {
      let leadContact = selectedContact;

      if (!leadContact && form.create_contact === true) {
        if (!manualContactName) {
          toast({
            variant: "destructive",
            title: "Contact name required",
            description: "Add a contact name before creating a new contact record.",
          });
          return;
        }

        const existingMatch = findMatchingContact(contacts, manualContactName, manualCompanyName);
        if (existingMatch) {
          leadContact = existingMatch;
          toast({
            title: "Existing contact linked",
            description: `${getContactDisplayName(existingMatch)} was already in Contacts, so the lead has been linked to that record.`,
          });
        } else {
          const nameParts = splitContactName(manualContactName);
          leadContact = await crmApi.entities.Contact.create({
            type: "client",
            status: "active",
            relationship_status: "new",
            priority: String(form.priority || "medium").trim().toLowerCase() || "medium",
            first_name: nameParts.first_name,
            last_name: nameParts.last_name,
            full_name: manualContactName,
            company_id: "",
            company_name: manualCompanyName,
            email: String(form.contact_email || "").trim(),
            emails: String(form.contact_email || "").trim() ? [String(form.contact_email || "").trim()] : [],
            phone: String(form.contact_phone || "").trim(),
            phones: String(form.contact_phone || "").trim() ? [String(form.contact_phone || "").trim()] : [],
            preferred_channel: String(form.contact_email || "").trim() ? "email" : "phone",
            notes: `Created from lead: ${trimmedTitle}`,
          });
        }
      }

      const {
        contact_email: _contactEmail,
        contact_phone: _contactPhone,
        create_contact: _createContact,
        ...leadForm
      } = form;

      await crmApi.entities.Lead.create({
        ...leadForm,
        title: trimmedTitle,
        value: parseFloat(form.value) || 0,
        contact_id: leadContact?.id || "",
        contact_name: leadContact ? getContactDisplayName(leadContact) : contactName,
        company_id: leadContact?.company_id || "",
        company_name: leadContact?.company_name || manualCompanyName,
        category_id: resolvedCategoryId,
      });

      setShowCreate(false);
      setForm(makeEmptyLeadForm(defaultCategory?.id || ""));
      await loadLeads();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSavingLead(false);
    }
  };

  const saveCategorySettings = async (draftCategories) => {
    setSavingCategories(true);

    try {
      const currentCategories = sortLeadCategories(categories);
      const nextIds = new Set(
        draftCategories
          .filter((category) => category.isNew !== true)
          .map((category) => category.id)
      );
      const removedCategories = currentCategories.filter((category) => !nextIds.has(category.id));

      for (const [index, category] of draftCategories.entries()) {
        const payload = {
          name: category.name,
          key: category.key,
          color: category.color,
          sort_order: index,
          is_default: category.is_default === true,
          is_active: true,
        };

        if (category.isNew) {
          await crmApi.entities.LeadCategory.create(payload);
        } else {
          await crmApi.entities.LeadCategory.update(category.id, payload);
        }
      }

      for (const category of removedCategories) {
        await crmApi.entities.LeadCategory.delete(category.id);
      }

      await loadLeads();
      setShowCategorySettings(false);
      toast({
        title: "Categories updated",
        description: "Lead categories have been saved and applied across the Leads page.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to save categories",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSavingCategories(false);
    }
  };

  const openMostRecentQuoteForLead = (lead, event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();

    const matchingQuote = findMostRecentQuoteForLead(lead, quotes);
    if (!matchingQuote?.id) {
      toast({
        title: "No quote found for this customer.",
      });
      return;
    }

    navigate(`/quotes/${matchingQuote.id}`);
  };

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
        title="Leads"
        subtitle={`${filteredLeads.length} of ${leads.length} leads · ${formatCurrency(filteredLeads.reduce((sum, lead) => sum + Number(lead.value || 0), 0))} pipeline`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${view === "list" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("board")}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${view === "board" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowCategorySettings(true)}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Categories
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Lead
            </Button>
          </div>
        }
      />
      {loadError ? (
        <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void reloadLeads()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Target}
          label="Active Leads"
          value={String(filteredLeads.filter((lead) => !["won", "lost"].includes(String(lead.stage || ""))).length)}
          hint="Open opportunities in the current filter"
        />
        <MetricCard
          icon={DollarSign}
          label="Pipeline Value"
          value={formatCurrency(filteredLeads.reduce((sum, lead) => sum + Number(lead.value || 0), 0))}
          hint={`${formatCurrency(weightedPipeline)} weighted`}
        />
        <MetricCard
          icon={CalendarClock}
          label="Closing Soon"
          value={String(closingSoonLeads.length)}
          hint="Expected close date in the next 14 days"
        />
        <MetricCard
          icon={FolderOpen}
          label="Categories"
          value={String(categories.length)}
          hint={`${Object.keys(categoryCounts).length} currently in use`}
        />
      </div>

      <Card className="mb-4 rounded-2xl border-border/80 p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title, contact, company, owner, address, or category"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All stages</SelectItem>
              {LEAD_STAGES.map((stage, index) => (
                <SelectItem key={getRenderKey("stage-filter", stage.value, index)} value={stage.value}>
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All categories</SelectItem>
              {categories.map((category, index) => (
                <SelectItem key={getRenderKey("category-filter", category.id, index)} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-border/80">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{view === "list" ? "Lead register" : "Stage board"}</h2>
              <p className="text-xs text-muted-foreground">
                {view === "list"
                  ? "Compact list view with the most important lead fields visible at once."
                  : "Stage columns stay inside the window with their own internal scroll areas."}
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {filteredLeads.length} result{filteredLeads.length === 1 ? "" : "s"}
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon={Target} title="No leads found" actionLabel="New Lead" onAction={() => setShowCreate(true)} />
            </div>
          ) : view === "list" ? (
            <div className="min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="hidden min-w-0 md:block">
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b bg-muted/40 text-left">
                        <SortableHeader columnKey="lead" sortState={leadSortState} onSort={requestLeadSort} className="w-[28%] px-4 py-3 font-medium text-muted-foreground">Lead</SortableHeader>
                        <SortableHeader columnKey="customer" sortState={leadSortState} onSort={requestLeadSort} className="w-[18%] px-4 py-3 font-medium text-muted-foreground">Customer</SortableHeader>
                        <SortableHeader columnKey="category" sortState={leadSortState} onSort={requestLeadSort} className="w-[12%] px-4 py-3 font-medium text-muted-foreground">Category</SortableHeader>
                        <SortableHeader columnKey="stage" sortState={leadSortState} onSort={requestLeadSort} className="w-[14%] px-4 py-3 font-medium text-muted-foreground">Stage</SortableHeader>
                        <SortableHeader columnKey="owner" sortState={leadSortState} onSort={requestLeadSort} className="w-[12%] px-4 py-3 font-medium text-muted-foreground">Owner</SortableHeader>
                        <SortableHeader columnKey="close" sortState={leadSortState} onSort={requestLeadSort} className="w-[8%] px-4 py-3 font-medium text-muted-foreground">Close</SortableHeader>
                        <SortableHeader columnKey="value" sortState={leadSortState} onSort={requestLeadSort} align="right" className="w-[8%] px-4 py-3 text-right font-medium text-muted-foreground">Value</SortableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeads.map((lead, index) => {
                        const stage = getStageConfig(LEAD_STAGES, lead.stage);
                        const category = getLeadCategoryForLead(lead, categories);
                        const canOpenQuote = lead.stage === "quote_in_progress";

                        return (
                          <tr
                            key={getRenderKey("lead-row", lead.id, index)}
                            className="cursor-pointer border-b align-top transition-colors hover:bg-muted/30"
                            onClick={() => navigate(`/leads/${lead.id}`)}
                          >
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{lead.title}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {lead.description || lead.site_address || "No extra detail yet"}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <p className="truncate font-medium text-foreground">{lead.contact_name || "No contact"}</p>
                                <p className="truncate text-xs text-muted-foreground">{lead.company_name || lead.site_address || "—"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge label={category.name} color={category.color} />
                            </td>
                            <td className="px-4 py-3">
                              {canOpenQuote ? (
                                <button
                                  type="button"
                                  className="cursor-pointer rounded-full transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  onClick={(event) => openMostRecentQuoteForLead(lead, event)}
                                  title="Open most recent quote"
                                  aria-label={`Open most recent quote for ${lead.contact_name || lead.company_name || lead.title}`}
                                >
                                  <StatusBadge label={stage.label} color={stage.color} className="hover:shadow-sm" />
                                </button>
                              ) : (
                                <StatusBadge label={stage.label} color={stage.color} />
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{lead.assigned_to || "Unassigned"}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(lead.expected_close)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(lead.value)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 p-4 md:hidden">
                  {sortedLeads.map((lead, index) => {
                    const stage = getStageConfig(LEAD_STAGES, lead.stage);
                    const category = getLeadCategoryForLead(lead, categories);

                    return (
                      <button
                        key={getRenderKey("lead-mobile", lead.id, index)}
                        type="button"
                        className="w-full rounded-xl border p-4 text-left"
                        onClick={() => navigate(`/leads/${lead.id}`)}
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <StatusBadge label={category.name} color={category.color} />
                          <StatusBadge label={stage.label} color={stage.color} />
                        </div>
                        <p className="font-semibold text-foreground">{lead.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {[lead.contact_name, lead.company_name].filter(Boolean).join(" · ") || "No linked contact yet"}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{formatDate(lead.expected_close)}</span>
                          <span className="font-semibold text-foreground">{formatCurrency(lead.value)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <ScrollArea className="h-full whitespace-nowrap">
              <div className="grid h-full min-w-max grid-flow-col auto-cols-[minmax(300px,1fr)] gap-4 p-4">
                {stageSummaries.map((stage, stageIndex) => {
                  const stageLeads = sortedLeads.filter((lead) => lead.stage === stage.value);
                  return (
                    <Card key={getRenderKey("stage-board", stage.value, stageIndex)} className="flex min-h-0 flex-col overflow-hidden rounded-xl border-border/80">
                      <div className="border-b bg-muted/30 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <StatusBadge label={stage.label} color={stage.color} />
                            <span className="text-xs font-medium text-muted-foreground">{stage.count}</span>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">{formatCurrency(stage.value)}</span>
                        </div>
                      </div>
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-3 p-3">
                          {stageLeads.length === 0 ? (
                            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                              No leads in this stage
                            </div>
                          ) : (
                            stageLeads.map((lead, leadIndex) => {
                              const category = getLeadCategoryForLead(lead, categories);
                              return (
                                <Link key={getRenderKey("lead-board-card", lead.id, leadIndex)} to={`/leads/${lead.id}`}>
                                  <Card className="rounded-xl border-border/80 p-4 transition-shadow hover:shadow-md">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                      <StatusBadge label={category.name} color={category.color} />
                                      {lead.priority ? (
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                          {lead.priority}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mb-1 text-sm font-semibold text-foreground">{lead.title}</p>
                                    <p className="mb-3 text-xs text-muted-foreground">
                                      {[lead.contact_name, lead.company_name].filter(Boolean).join(" · ") || "No linked customer"}
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                                      <div>
                                        <p className="font-medium text-foreground">{formatCurrency(lead.value)}</p>
                                        <p>Value</p>
                                      </div>
                                      <div>
                                        <p className="font-medium text-foreground">{formatDate(lead.expected_close)}</p>
                                        <p>Expected close</p>
                                      </div>
                                    </div>
                                  </Card>
                                </Link>
                              );
                            })
                          )}
                        </div>
                      </ScrollArea>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </Card>

        <div className="grid min-h-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card className="rounded-2xl border-border/80">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Stage totals</h3>
              <p className="text-xs text-muted-foreground">Quick view of where the current pipeline sits.</p>
            </div>
            <div className="space-y-3 p-4">
              {stageSummaries.map((stage, index) => (
                <div key={getRenderKey("stage-summary", stage.value, index)} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge label={stage.label} color={stage.color} />
                    <span className="text-xs text-muted-foreground">{stage.count}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{formatCurrency(stage.value)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex min-h-0 flex-col rounded-2xl border-border/80">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Category breakdown</h3>
              <p className="text-xs text-muted-foreground">Category counts update immediately after settings changes.</p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {categories.map((category, index) => (
                  <div key={getRenderKey("category-breakdown", category.id, index)} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={category.name} color={category.color} />
                      {category.is_default ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <span className="text-sm font-medium text-foreground">{Number(categoryCounts[category.id] || 0)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>

          <Card className="flex min-h-0 flex-col rounded-2xl border-border/80 md:col-span-2 xl:col-span-1">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Upcoming closes</h3>
              <p className="text-xs text-muted-foreground">Leads most likely to need attention first.</p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {closingSoonLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expected close dates in the next two weeks.</p>
                ) : (
                  closingSoonLeads.map((lead, index) => {
                    const category = getLeadCategoryForLead(lead, categories);
                    const daysUntil = getDaysUntil(lead.expected_close);
                    return (
                      <button
                        key={getRenderKey("closing-soon", lead.id, index)}
                        type="button"
                        className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/40"
                        onClick={() => navigate(`/leads/${lead.id}`)}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <StatusBadge label={category.name} color={category.color} />
                          <span className="text-xs text-muted-foreground">
                            {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`}
                          </span>
                        </div>
                        <p className="font-medium text-foreground">{lead.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{[lead.contact_name, lead.company_name].filter(Boolean).join(" · ")}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>New Lead</DialogTitle>
              <DialogDescription>Create a new enquiry with a category, customer details, and expected next step.</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1">
              <div className="grid gap-4 px-6 py-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="lead-create-title">Title *</Label>
                    <Input
                      id="lead-create-title"
                      value={form.title}
                      onChange={(event) => setForm({ ...form, title: event.target.value })}
                      placeholder="e.g. Kitchen renovation – Smith"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lead-create-contact">Existing Contact</Label>
                    <Select
                      value={form.create_contact ? CREATE_CONTACT_VALUE : form.contact_id || NO_CONTACT_VALUE}
                      onValueChange={(value) => {
                        if (value === NO_CONTACT_VALUE) {
                          setForm({ ...form, contact_id: "", contact_name: "", company_id: "", company_name: "", create_contact: false });
                          return;
                        }

                        if (value === CREATE_CONTACT_VALUE) {
                          setForm({ ...form, contact_id: "", company_id: "", create_contact: true });
                          return;
                        }

                        const selectedContact = contacts.find((contact) => contact.id === value);
                        setForm({
                          ...form,
                          contact_id: value,
                          contact_name: selectedContact ? getContactDisplayName(selectedContact) : form.contact_name,
                          company_id: selectedContact?.company_id || "",
                          company_name: selectedContact?.company_name || "",
                          create_contact: false,
                        });
                      }}
                    >
                      <SelectTrigger id="lead-create-contact">
                        <SelectValue placeholder="Select a contact" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CONTACT_VALUE}>No existing contact</SelectItem>
                        <SelectItem value={CREATE_CONTACT_VALUE}>Create new contact</SelectItem>
                        {sortedContacts.map((contact, index) => (
                          <SelectItem key={getRenderKey("contact-option", contact.id, index)} value={contact.id}>
                            {`${getContactDisplayName(contact)}${contact.company_name ? ` · ${contact.company_name}` : ""}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!form.contact_id ? (
                    <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="lead-create-contact-name">Contact Name</Label>
                          <Input
                            id="lead-create-contact-name"
                            value={form.contact_name || ""}
                            onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="lead-create-company-name">Company Name</Label>
                          <Input
                            id="lead-create-company-name"
                            value={form.company_name || ""}
                            onChange={(event) => setForm({ ...form, company_name: event.target.value })}
                          />
                        </div>
                      </div>

                      <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm">
                        <Checkbox
                          checked={form.create_contact === true}
                          onCheckedChange={(checked) => setForm({ ...form, create_contact: checked === true })}
                          aria-label="Create this person as a contact"
                        />
                        <span>
                          <span className="block font-medium text-foreground">Create this person as a contact</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            If a matching contact already exists, the lead will link to it instead of creating a duplicate.
                          </span>
                        </span>
                      </label>

                      {form.create_contact ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="lead-create-contact-email">Email</Label>
                            <Input
                              id="lead-create-contact-email"
                              type="email"
                              value={form.contact_email || ""}
                              onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lead-create-contact-phone">Phone</Label>
                            <Input
                              id="lead-create-contact-phone"
                              value={form.contact_phone || ""}
                              onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="lead-create-description">Description</Label>
                    <Textarea
                      id="lead-create-description"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      rows={4}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lead-create-category">Category</Label>
                      <Select value={form.category_id || defaultCategory?.id || "__none"} onValueChange={(value) => setForm({ ...form, category_id: value === "__none" ? "" : value })}>
                        <SelectTrigger id="lead-create-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Use default category</SelectItem>
                          {categories.map((category, index) => (
                            <SelectItem key={getRenderKey("category-option", category.id, index)} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lead-create-value">Value ($)</Label>
                      <Input
                        id="lead-create-value"
                        type="number"
                        value={form.value}
                        onChange={(event) => setForm({ ...form, value: event.target.value })}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lead-create-source">Source</Label>
                      <Select value={form.source} onValueChange={(value) => setForm({ ...form, source: value })}>
                        <SelectTrigger id="lead-create-source">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["referral", "website", "phone", "walk_in", "trade_show", "social_media", "advertising", "repeat_client", "other"].map((source, index) => (
                            <SelectItem key={getRenderKey("source-option", source, index)} value={source}>
                              {source.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lead-create-priority">Priority</Label>
                      <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
                        <SelectTrigger id="lead-create-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["low", "medium", "high", "urgent"].map((priority, index) => (
                            <SelectItem key={getRenderKey("priority-option", priority, index)} value={priority}>
                              {priority}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lead-create-stage">Stage</Label>
                      <Select value={form.stage} onValueChange={(value) => setForm({ ...form, stage: value })}>
                        <SelectTrigger id="lead-create-stage">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STAGES.map((stage, index) => (
                            <SelectItem key={getRenderKey("stage-option", stage.value, index)} value={stage.value}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lead-create-close">Expected Close</Label>
                      <Input
                        id="lead-create-close"
                        type="date"
                        value={form.expected_close || ""}
                        onChange={(event) => setForm({ ...form, expected_close: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lead-create-address">Site Address</Label>
                    <AddressAutocompleteInput
                      inputId="lead-create-address"
                      value={form.site_address || ""}
                      onChange={(nextValue) => setForm({ ...form, site_address: nextValue })}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={savingLead}>Cancel</Button>
              <Button onClick={() => void saveLead()} disabled={savingLead || !form.title}>Create Lead</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LeadCategorySettingsDialog
        open={showCategorySettings}
        onOpenChange={setShowCategorySettings}
        categories={categories}
        leadCounts={categoryCounts}
        onSave={saveCategorySettings}
        saving={savingCategories}
      />
    </div>
  );
}
