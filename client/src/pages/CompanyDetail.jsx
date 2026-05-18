import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useModules } from "@/lib/ModuleContext";
import { mapNzAddressSuggestionToFields } from "@/lib/nzAddress";
import AttachmentVersionDialog from "../components/AttachmentVersionDialog";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import CompanyDocumentsPanel from "../components/company/CompanyDocumentsPanel";
import CompanyHistoryPanel from "../components/company/CompanyHistoryPanel";
import StatusBadge from "../components/StatusBadge";
import RecordAuditPanel from "../components/RecordAuditPanel";
import { readFileAsDataUrl } from "../lib/attachmentHelpers";
import { getCustomerDeleteProtection } from "../lib/coreFlowHelpers";
import { ChevronRight, Edit2, Building2, Mail, Phone, MapPin, Users, MessageSquare, ArchiveRestore, Archive, Search } from "lucide-react";
import { formatCurrency, formatDate } from "../lib/helpers";

const TYPE_COLORS = { client: "blue", supplier: "teal", subcontractor: "orange", builder: "amber", designer: "purple", architect: "cyan" };
const COMPANY_TYPES = ["client", "supplier", "subcontractor"];

export default function CompanyDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isModuleEnabled } = useModules();
  const contactsEnabled = isModuleEnabled("contacts");
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const suppliersEnabled = isModuleEnabled("suppliers");
  const [company, setCompany] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pricingItems, setPricingItems] = useState([]);
  const [notes, setNotes] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [versionAttachment, setVersionAttachment] = useState(null);
  const [supplierKnowledgeResults, setSupplierKnowledgeResults] = useState([]);
  const [form, setForm] = useState({});
  const [noteText, setNoteText] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    void loadData();
  }, [id]);

  const updateAddress = (nextValue, suggestion) => {
    if (!suggestion) {
      setForm((current) => ({ ...current, address: nextValue }));
      return;
    }

    const mapped = mapNzAddressSuggestionToFields(suggestion);
    setForm((current) => ({
      ...current,
      address: mapped.address || nextValue,
      city: mapped.city || current.city || "",
      state: mapped.state || current.state || "",
      postal_code: mapped.postal_code || current.postal_code || "",
      country: mapped.country || current.country || "",
    }));
  };

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const detail = await crmApi.companies.getDetail(id);
      const currentCompany = detail?.company || null;

      setCompany(currentCompany);
      setForm(currentCompany || {});
      setContacts(Array.isArray(detail?.contacts) ? detail.contacts : []);
      setLeads(Array.isArray(detail?.leads) ? detail.leads : []);
      setQuotes(Array.isArray(detail?.quotes) ? detail.quotes : []);
      setJobs(Array.isArray(detail?.jobs) ? detail.jobs : []);
      setPricingItems(Array.isArray(detail?.pricingItems) ? detail.pricingItems : []);
      setNotes(Array.isArray(detail?.notes) ? detail.notes : []);
      setAttachments(Array.isArray(detail?.attachments) ? detail.attachments : []);
      setHistory(Array.isArray(detail?.history) ? detail.history : []);
      if (currentCompany?.type === "supplier" && crmApi.ai?.knowledgeSearch) {
        const query = [currentCompany.name, currentCompany.category, "supplier", "pricing"].filter(Boolean).join(" ");
        crmApi.ai.knowledgeSearch({
          query,
          limit: 4,
          customer: currentCompany.name || "",
        })
          .then((response) => setSupplierKnowledgeResults(Array.isArray(response?.results) ? response.results : []))
          .catch(() => setSupplierKnowledgeResults([]));
      } else {
        setSupplierKnowledgeResults([]);
      }
      setUploadError("");
    } catch (error) {
      setCompany(null);
      setContacts([]);
      setLeads([]);
      setQuotes([]);
      setJobs([]);
      setPricingItems([]);
      setNotes([]);
      setAttachments([]);
      setHistory([]);
      setSupplierKnowledgeResults([]);
      setLoadError(error instanceof Error ? error.message : "Company details could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const saveCompany = async () => {
    const trimmedName = String(form.name || "").trim();
    if (!trimmedName) {
      toast({
        variant: "destructive",
        title: "Company name required",
        description: "Add a company name before saving.",
      });
      return;
    }

    setSaving(true);
    try {
      const previousCompanyName = String(company?.name || "").trim();
      const updatedCompany = await crmApi.entities.Company.update(id, {
        ...form,
        name: trimmedName,
        email: String(form.email || "").trim(),
        phone: String(form.phone || "").trim(),
        contact_name: String(form.contact_name || "").trim(),
        category: String(form.category || "").trim(),
        payment_terms: String(form.payment_terms || "").trim(),
        myob_card_id: String(form.myob_card_id || "").trim(),
        myob_record_id: String(form.myob_record_id || "").trim(),
      });

      if (updatedCompany) {
        const nextCompanyName = String(updatedCompany.name || "").trim();
        await Promise.all([
          ...contacts
            .filter((item) => item.company_id === id || String(item.company_name || "").trim() === previousCompanyName)
            .map((item) =>
              crmApi.entities.Contact.update(item.id, {
                company_id: id,
                company_name: nextCompanyName,
              })
            ),
          ...leads
            .filter((item) => item.company_id === id || String(item.company_name || "").trim() === previousCompanyName)
            .map((item) =>
              crmApi.entities.Lead.update(item.id, {
                company_id: id,
                company_name: nextCompanyName,
              })
            ),
          ...quotes
            .filter((item) => item.company_id === id || String(item.company_name || "").trim() === previousCompanyName)
            .map((item) =>
              crmApi.entities.Quote.update(item.id, {
                company_id: id,
                company_name: nextCompanyName,
              })
            ),
          ...jobs
            .filter((item) => item.company_id === id || String(item.company_name || "").trim() === previousCompanyName)
            .map((item) =>
              crmApi.entities.Job.update(item.id, {
                company_id: id,
                company_name: nextCompanyName,
              })
            ),
        ]);
      }

      setEditing(false);
      await loadData();
      toast({
        title: "Company updated",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Company could not be saved",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    const trimmedContent = String(noteText || "").trim();
    if (!trimmedContent) {
      toast({
        variant: "destructive",
        title: "Note required",
        description: "Write a note before adding it to this company.",
      });
      return;
    }

    setSaving(true);
    try {
      await crmApi.entities.Note.create({
        content: trimmedContent,
        related_id: id,
        related_type: "company",
        type: "note",
      });
      setNoteText("");
      await loadData();
      toast({
        title: "Note added",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Note could not be added",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        await crmApi.filesystem.create({
          related_id: id,
          related_type: "company",
          name: file.name,
          mime_type: file.type || "application/octet-stream",
          size: file.size,
          data_base64: dataUrl,
        });
      }

      await loadData();
      toast({
        title: files.length === 1 ? "Document uploaded" : "Documents uploaded",
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Documents could not be uploaded.");
    } finally {
      setUploading(false);
      setDragActive(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const openDocument = (attachment) => {
    if (!attachment?.url) {
      return;
    }
    window.open(attachment.url, "_blank", "noopener,noreferrer");
  };

  const copyDocumentLink = async (attachment) => {
    if (!attachment?.url) {
      toast({
        variant: "destructive",
        title: "Document link unavailable",
        description: "This document does not have a shareable link yet.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(attachment.url);
      toast({
        title: "Document link copied",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Document link could not be copied",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const deleteDocument = async (attachment) => {
    const confirmed = window.confirm(`Remove ${attachment?.name || "this document"} from the company record?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      await crmApi.filesystem.delete(attachment.id);
      await loadData();
      toast({
        title: "Document removed",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Document could not be removed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    const nextStatus = String(company?.status || "").toLowerCase() === "archived" ? "active" : "archived";
    setSaving(true);
    try {
      await crmApi.entities.Company.update(id, { status: nextStatus });
      await loadData();
      toast({
        title: nextStatus === "archived" ? "Company archived" : "Company restored",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Company status could not be updated",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCompany = async () => {
    const deleteProtection = getCustomerDeleteProtection({
      contacts: contacts.length,
      leads: leads.length,
      quotes: quotes.length,
      jobs: jobs.length,
    });

    if (!deleteProtection.canDelete) {
      toast({
        variant: "destructive",
        title: "Company cannot be deleted",
        description: deleteProtection.message,
      });
      return;
    }

    const confirmed = window.confirm("Delete this company? This will remove the company record.");
    if (!confirmed) {
      return;
    }

    setSaving(true);
    try {
      await crmApi.entities.Company.delete(id);
      navigate(companyIndexPath);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Company could not be deleted",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link to={contactsEnabled ? "/contacts" : suppliersEnabled ? "/suppliers" : "/"} className="hover:text-foreground">
            {contactsEnabled ? "Contacts" : suppliersEnabled ? "Suppliers" : "Operations"}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Missing Company</span>
        </div>
        <Card className="p-8 text-center text-muted-foreground">Company not found.</Card>
      </div>
    );
  }

  const isSupplierCompany = ["supplier", "subcontractor"].includes(String(company.type || "").toLowerCase());
  const isArchived = String(company.status || "").toLowerCase() === "archived";
  const baseDeleteProtection = getCustomerDeleteProtection({
    contacts: contacts.length,
    leads: leads.length,
    quotes: quotes.length,
    jobs: jobs.length,
  });
  const supplierDeleteBlocked = isSupplierCompany && pricingItems.length > 0;
  const deleteProtection = supplierDeleteBlocked
    ? {
        canDelete: false,
        message: `This supplier still has ${pricingItems.length} pricing item${pricingItems.length === 1 ? "" : "s"} linked to it.`,
      }
    : baseDeleteProtection;
  const sortedContacts = [...contacts].sort((left, right) => {
    if (left.is_primary === true && right.is_primary !== true) {
      return -1;
    }
    if (right.is_primary === true && left.is_primary !== true) {
      return 1;
    }
    return `${left.first_name || ""} ${left.last_name || ""}`.localeCompare(`${right.first_name || ""} ${right.last_name || ""}`, undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
  const companyIndexPath = isSupplierCompany && suppliersEnabled ? "/suppliers" : contactsEnabled ? "/contacts" : suppliersEnabled ? "/suppliers" : "/";
  const companyIndexLabel = isSupplierCompany && suppliersEnabled ? "Suppliers" : contactsEnabled ? "Contacts" : suppliersEnabled ? "Suppliers" : "Operations";
  const visibleContacts = contactsEnabled ? sortedContacts : [];
  const visibleLeads = leadsEnabled ? leads : [];
  const visibleQuotes = quotesEnabled ? quotes : [];
  const relatedCards = [
    contactsEnabled && !isSupplierCompany
      ? {
          key: "contacts",
          label: "Contacts",
          count: contacts.length,
          empty: "No contacts",
          items: visibleContacts.slice(0, 3).map((contact) => ({
            id: contact.id,
            href: `/contacts/${contact.id}`,
            label: `${[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact"}${contact.is_primary ? " · Primary" : ""}`,
          })),
        }
      : null,
    leadsEnabled && !isSupplierCompany
      ? {
          key: "leads",
          label: "Leads",
          count: leads.length,
          empty: "No leads",
          items: visibleLeads.slice(0, 3).map((lead) => ({
            id: lead.id,
            href: `/leads/${lead.id}`,
            label: lead.title || "Lead",
          })),
        }
      : null,
    quotesEnabled && !isSupplierCompany
      ? {
          key: "quotes",
          label: "Quotes",
          count: quotes.length,
          empty: "No quotes",
          items: visibleQuotes.slice(0, 3).map((quote) => ({
            id: quote.id,
            href: `/quotes/${quote.id}`,
            label: quote.quote_number || quote.title || "Quote",
          })),
        }
      : null,
    {
      key: "jobs",
      label: "Jobs",
      count: jobs.length,
      empty: "No jobs",
      items: jobs.slice(0, 3).map((job) => ({
        id: job.id,
        href: `/jobs/${job.id}`,
        label: job.job_number || job.title || "Job",
      })),
    },
    isSupplierCompany
      ? {
          key: "pricing-items",
          label: "Pricing Items",
          count: pricingItems.length,
          empty: "No linked pricing items",
          items: pricingItems.slice(0, 3).map((item) => ({
            id: item.id,
            href: "/pricing",
            label: item.product_number ? `${item.product_number} · ${item.name}` : item.name || "Pricing item",
          })),
        }
      : null,
  ].filter(Boolean);
  const linkedPricingValue = pricingItems.reduce((sum, item) => sum + Number(item.buy_price || 0), 0);
  const activePricingItems = pricingItems.filter((item) => item.is_active !== false);
  const relatedGridClassName = relatedCards.length === 1
    ? "sm:grid-cols-1"
    : relatedCards.length === 2
      ? "sm:grid-cols-2"
      : relatedCards.length === 3
        ? "sm:grid-cols-3"
        : "sm:grid-cols-4";

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to={companyIndexPath} className="hover:text-foreground">{companyIndexLabel}</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{company.name || "Company"}</span>
      </div>
      {loadError ? (
        <Alert className="mb-5 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadData()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold">{company.name || "Unnamed Company"}</h1>
            <StatusBadge label={company.type || "client"} color={TYPE_COLORS[company.type] || "slate"} />
            {isArchived && <StatusBadge label="archived" color="slate" />}
          </div>
          <p className="text-sm text-muted-foreground">{[company.email, company.phone].filter(Boolean).join(" · ") || "Company record"}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={toggleArchive} disabled={saving}>
            {isArchived ? <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
            {isArchived ? "Restore" : "Archive"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={deleteCompany}
            disabled={saving || !deleteProtection.canDelete}
            title={deleteProtection.canDelete ? "Delete company" : deleteProtection.message}
          >
            Delete
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={saving}>
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Company Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex gap-3">
                <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{company.email || "—"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Phone className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{company.phone || "—"}</p>
                </div>
              </div>
              {isSupplierCompany ? (
                <div className="flex gap-3">
                  <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-muted-foreground">Contact Person</p>
                    <p className="font-medium">{company.contact_name || "—"}</p>
                  </div>
                </div>
              ) : null}
              <div className="flex gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">Address</p>
                  <p className="font-medium">{[company.address, company.city, company.state, company.postal_code, company.country].filter(Boolean).join(", ") || "—"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(company.created_date)}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">Website</p>
                  <p className="font-medium">{company.website || "—"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">MYOB Card ID</p>
                  <p className="font-medium font-mono">{company.myob_card_id || "—"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-muted-foreground">MYOB Record ID</p>
                  <p className="font-medium font-mono">{company.myob_record_id || "—"}</p>
                </div>
              </div>
              {isSupplierCompany ? (
                <>
                  <div className="flex gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium">{String(company.category || "general").replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Payment Terms</p>
                      <p className="font-medium">{String(company.payment_terms || "30_days").replace(/_/g, " ")}</p>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            {company.notes && (
              <div className="mt-4 pt-4 border-t text-sm">
                <p className="text-muted-foreground">Notes</p>
                <p className="mt-1">{company.notes}</p>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Related Work</h3>
            <div className={`grid gap-4 ${relatedGridClassName}`}>
              {relatedCards.map((section) => (
                <div key={section.key} className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">{section.label}</p>
                  <p className="text-2xl font-bold">{section.count}</p>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <Link key={item.id} to={item.href} className="block text-sm hover:text-primary">{item.label}</Link>
                    ))}
                    {section.items.length === 0 ? <p className="text-sm text-muted-foreground">{section.empty}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {isSupplierCompany ? (
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4">Supplier Snapshot</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Pricing Items</p>
                  <p className="mt-2 text-2xl font-bold">{pricingItems.length}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Active Items</p>
                  <p className="mt-2 text-2xl font-bold">{activePricingItems.length}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Linked Buy Cost</p>
                  <p className="mt-2 text-2xl font-bold">{formatCurrency(linkedPricingValue)}</p>
                </div>
              </div>
            </Card>
          ) : null}

          {isSupplierCompany && supplierKnowledgeResults.length > 0 ? (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Supplier Knowledge Matches</h3>
              </div>
              <div className="mt-3 space-y-2">
                {supplierKnowledgeResults.slice(0, 5).map((result) => (
                  <div key={result.chunk_id || `${result.file_id}:${result.line_start || 0}`} className="rounded-lg border px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-xs font-medium text-muted-foreground">{result.source_reference || result.relative_path}</p>
                      <span className="text-xs font-semibold text-muted-foreground">{Math.round(Number(result.score || 0) * 100)}%</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-foreground">{result.snippet || result.chunk_text}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <CompanyDocumentsPanel
            attachments={attachments}
            isSupplierCompany={isSupplierCompany}
            uploading={uploading}
            saving={saving}
            dragActive={dragActive}
            uploadError={uploadError}
            fileInputRef={fileInputRef}
            onSetDragActive={setDragActive}
            onUploadFiles={uploadFiles}
            onOpenDocument={openDocument}
            onOpenVersionDialog={setVersionAttachment}
            onDeleteDocument={deleteDocument}
            onCopyLink={copyDocumentLink}
          />

          <CompanyHistoryPanel
            history={history}
            onOpenDocument={openDocument}
          />

          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-3">Notes</h3>
            <div className="flex gap-2 mb-4">
              <Textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="flex-1"
              />
              <Button onClick={addNote} size="sm" className="self-end" disabled={saving}>Add</Button>
            </div>
            <div className="space-y-2">
              {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
              {notes.map((note) => (
                <div key={note.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(note.created_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          {contactsEnabled && !isSupplierCompany ? (
            <Card className="p-5 mb-5">
              <h3 className="font-semibold text-sm mb-4">People</h3>
              {visibleContacts.length > 0 ? (
                <div className="space-y-3">
                  {visibleContacts.slice(0, 8).map((contact) => (
                    <Link key={contact.id} to={`/contacts/${contact.id}`} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30">
                      <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact"}</p>
                          {contact.is_primary ? <StatusBadge label="primary" color="blue" /> : null}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{contact.email || contact.phone || "—"}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No linked contacts.</p>
              )}
            </Card>
          ) : null}

          <RecordAuditPanel entityName="Company" recordId={id} title="Company Change History" limit={8} />
          {!deleteProtection.canDelete && (
            <Card className="p-4 mt-5 border-amber-500/30 bg-amber-50/40">
              <p className="text-sm font-medium text-amber-800">Delete Protection</p>
              <p className="text-sm text-amber-700 mt-1">{deleteProtection.message}</p>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Update company details, supplier settings, and accounting references.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="company-name">Company Name</Label>
              <Input id="company-name" value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="company-type">Type</Label>
              <Select value={form.type || "client"} onValueChange={(value) => setForm({ ...form, type: value })}>
                <SelectTrigger id="company-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPANY_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="company-myob-card-id">MYOB Card ID</Label>
                <Input id="company-myob-card-id" value={form.myob_card_id || ""} onChange={(event) => setForm({ ...form, myob_card_id: event.target.value })} className="font-mono" />
              </div>
              <div>
                <Label htmlFor="company-myob-record-id">MYOB Record ID</Label>
                <Input id="company-myob-record-id" value={form.myob_record_id || ""} onChange={(event) => setForm({ ...form, myob_record_id: event.target.value })} className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="company-email">Email</Label>
                <Input id="company-email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="company-phone">Phone</Label>
                <Input id="company-phone" value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </div>
            </div>
            {["supplier", "subcontractor"].includes(String(form.type || "").toLowerCase()) ? (
              <>
                <div>
                  <Label htmlFor="company-contact-name">Contact Person</Label>
                  <Input id="company-contact-name" value={form.contact_name || ""} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="company-category">Category</Label>
                    <Input id="company-category" value={form.category || ""} onChange={(event) => setForm({ ...form, category: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="company-payment-terms">Payment Terms</Label>
                    <Input id="company-payment-terms" value={form.payment_terms || ""} onChange={(event) => setForm({ ...form, payment_terms: event.target.value })} />
                  </div>
                </div>
              </>
            ) : null}
            <div>
              <Label htmlFor="company-address">Address</Label>
              <AddressAutocompleteInput
                inputId="company-address"
                value={form.address || ""}
                onChange={updateAddress}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label htmlFor="company-city">City</Label>
                <Input id="company-city" value={form.city || ""} onChange={(event) => setForm({ ...form, city: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="company-state">State</Label>
                <Input id="company-state" value={form.state || ""} onChange={(event) => setForm({ ...form, state: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="company-postal-code">Postal Code</Label>
                <Input id="company-postal-code" value={form.postal_code || ""} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="company-country">Country</Label>
                <Input id="company-country" value={form.country || ""} onChange={(event) => setForm({ ...form, country: event.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="company-website">Website</Label>
              <Input id="company-website" value={form.website || ""} onChange={(event) => setForm({ ...form, website: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="company-notes">Notes</Label>
              <Textarea id="company-notes" value={form.notes || ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button onClick={saveCompany} disabled={saving}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AttachmentVersionDialog
        attachment={versionAttachment}
        open={Boolean(versionAttachment)}
        onOpenChange={(open) => !open && setVersionAttachment(null)}
      />
    </div>
  );
}
