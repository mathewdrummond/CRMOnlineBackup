import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import StatusBadge from "../components/StatusBadge";
import RecordAuditPanel from "../components/RecordAuditPanel";
import AttachmentVersionDialog from "../components/AttachmentVersionDialog";
import ContactFormFields from "../components/contacts/ContactFormFields";
import ContactMergeDialog from "../components/contacts/ContactMergeDialog";
import { useModules } from "@/lib/ModuleContext";
import {
  buildContactActivityTimeline,
  buildContactPayload,
  buildMergedContactPayload,
  CONTACT_INTERACTION_TYPES,
  CONTACT_RELATIONSHIP_COLORS,
  CONTACT_TASK_TYPES,
  CONTACT_TYPE_COLORS,
  getContactDisplayName,
  getContactDuplicateMap,
  getContactHealth,
  getDuplicateCandidates,
  mapContactToForm,
} from "../lib/contactHelpers";
import { getCustomerDeleteProtection, getNextSequentialJobNumber } from "../lib/coreFlowHelpers";
import { formatDate, generateNumber } from "../lib/helpers";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HELP_TEXT } from "../lib/uploadRules";
import {
  Archive,
  ArchiveRestore,
  BellRing,
  Briefcase,
  Building2,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  File as FileIcon,
  FileImage,
  FileText,
  History,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  UserRound,
} from "lucide-react";

const EMPTY_TASK_FORM = {
  title: "",
  type: "follow_up",
  priority: "medium",
  due_date: "",
  assigned_to: "",
};

const EMPTY_INTERACTION_FORM = {
  type: "call",
  direction: "outbound",
  subject: "",
  summary: "",
  interaction_date: new Date().toISOString().slice(0, 16),
  next_step_date: "",
  visibility: "internal",
};

function formatFileSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(attachment) {
  const mimeType = String(attachment?.mime_type || "");
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  return "file";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
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

export default function ContactDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isModuleEnabled } = useModules();
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const fileInputRef = useRef(null);
  const [contacts, setContacts] = useState([]);
  const [contact, setContact] = useState(null);
  const [company, setCompany] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [leads, setLeads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showInteractionDialog, setShowInteractionDialog] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [merging, setMerging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [versionAttachment, setVersionAttachment] = useState(null);
  const [form, setForm] = useState({});
  const [noteText, setNoteText] = useState("");
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [interactionForm, setInteractionForm] = useState(EMPTY_INTERACTION_FORM);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        contactRecords,
        companyRecords,
        allLeads,
        allQuotes,
        allJobs,
        noteRecords,
        taskRecords,
        interactionRecords,
        attachmentRecords,
      ] = await Promise.all([
        crmApi.entities.Contact.list("-created_date", 1000),
        crmApi.entities.Company.list("-created_date", 1000),
        crmApi.entities.Lead.list("-created_date", 1000),
        crmApi.entities.Quote.list("-created_date", 1000),
        crmApi.entities.Job.list("-created_date", 1000),
        crmApi.entities.Note.filter({ related_id: id, related_type: "contact" }, "-created_date", 200),
        crmApi.entities.ContactTask.filter({ contact_id: id }, "-created_date", 200),
        crmApi.entities.ContactInteraction.filter({ contact_id: id }, "-created_date", 200),
        crmApi.entities.Attachment.filter({ related_id: id, related_type: "contact" }, "-created_date", 200),
      ]);

      const currentContact = contactRecords.find((item) => item.id === id) || null;
      const relatedCompany = currentContact
        ? companyRecords.find((item) => item.id === currentContact.company_id)
          || companyRecords.find((item) => item.name === currentContact.company_name)
          || null
        : null;

      setContacts(contactRecords);
      setContact(currentContact);
      setForm(mapContactToForm(currentContact || {}));
      setCompanies(companyRecords);
      setCompany(relatedCompany);
      setLeads(allLeads.filter((item) => item.contact_id === id));
      setQuotes(allQuotes.filter((item) => item.contact_id === id));
      setJobs(allJobs.filter((item) => item.contact_id === id));
      setNotes(noteRecords);
      setTasks(taskRecords);
      setInteractions(interactionRecords);
      setAttachments(attachmentRecords);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  const duplicateMap = useMemo(() => getContactDuplicateMap(contacts), [contacts]);
  const duplicateCandidates = useMemo(() => getDuplicateCandidates(contact, contacts), [contact, contacts]);
  const activityTimeline = useMemo(
    () => buildContactActivityTimeline({ interactions, notes, tasks, leads, quotes, jobs, attachments }),
    [attachments, interactions, jobs, leads, notes, quotes, tasks]
  );

  const fullName = getContactDisplayName(contact || {});
  const health = getContactHealth(contact, tasks);
  const isArchived = String(contact?.status || "").toLowerCase() === "archived";
  const deleteProtection = getCustomerDeleteProtection({
    leads: leads.length,
    quotes: quotes.length,
    jobs: jobs.length,
  });
  const visibleOpenWorkCount = (leadsEnabled ? leads.length : 0) + (quotesEnabled ? quotes.length : 0) + jobs.length;
  const openWorkHintParts = [
    leadsEnabled ? `${leads.length} leads` : null,
    quotesEnabled ? `${quotes.length} quotes` : null,
    `${jobs.length} jobs`,
  ].filter(Boolean);
  const pendingTasks = tasks.filter((task) => String(task.status || "").toLowerCase() !== "completed");
  const latestTouchDate = activityTimeline[0]?.date || contact?.last_contacted_date || "";

  const syncPrimaryCompanyContact = async (savedContact, currentContacts = contacts) => {
    if (!savedContact?.is_primary || !String(savedContact.company_id || savedContact.company_name || "").trim()) {
      return;
    }

    const matchingContacts = currentContacts.filter((candidate) => {
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

  const saveContact = async () => {
    const trimmedFirstName = String(form.first_name || "").trim();
    const trimmedLastName = String(form.last_name || "").trim();
    const trimmedEmail = String(form.email || "").trim();

    if (!trimmedFirstName && !trimmedLastName && !trimmedEmail) {
      toast({
        variant: "destructive",
        title: "Contact details required",
        description: "Add at least a first name, last name, or email before saving.",
      });
      return;
    }

    const selectedCompany = companies.find((item) => item.id === form.company_id) || null;
    const payload = {
      ...buildContactPayload(form, selectedCompany),
      row_version: contact.row_version,
    };

    const exactDuplicate = contacts.find((candidate) => candidate.id !== id && candidate.email && String(candidate.email).trim().toLowerCase() === String(payload.email || "").trim().toLowerCase());
    if (exactDuplicate) {
      const shouldOpen = window.confirm(`A contact with this email already exists for ${getContactDisplayName(exactDuplicate)}. Open that contact instead?`);
      if (shouldOpen) {
        navigate(`/contacts/${exactDuplicate.id}`);
      }
      return;
    }

    const updatedContact = await crmApi.entities.Contact.update(id, payload);

    if (updatedContact) {
      await syncPrimaryCompanyContact(updatedContact);
      const nextContactName = getContactDisplayName(updatedContact);
      await Promise.all([
        ...leads.map((item) =>
          crmApi.entities.Lead.update(item.id, {
            contact_name: nextContactName,
            company_id: updatedContact.company_id || "",
            company_name: updatedContact.company_name || "",
          })
        ),
        ...quotes.map((item) =>
          crmApi.entities.Quote.update(item.id, {
            contact_name: nextContactName,
            company_id: updatedContact.company_id || "",
            company_name: updatedContact.company_name || "",
          })
        ),
        ...jobs.map((item) =>
          crmApi.entities.Job.update(item.id, {
            contact_name: nextContactName,
            company_id: updatedContact.company_id || "",
            company_name: updatedContact.company_name || "",
          })
        ),
      ]);
    }

    setEditing(false);
    await loadData();
  };

  const addNote = async () => {
    const trimmedContent = String(noteText || "").trim();
    if (!trimmedContent) {
      toast({
        variant: "destructive",
        title: "Note required",
        description: "Write a note before adding it to this contact.",
      });
      return;
    }

    await crmApi.entities.Note.create({
      content: trimmedContent,
      related_id: id,
      related_type: "contact",
      type: "note",
    });
    setNoteText("");
    await loadData();
  };

  const addTask = async () => {
    if (!String(taskForm.title || "").trim()) {
      toast({
        variant: "destructive",
        title: "Task title required",
        description: "Add a follow-up title before saving the task.",
      });
      return;
    }

    await crmApi.entities.ContactTask.create({
      ...taskForm,
      contact_id: id,
      title: String(taskForm.title || "").trim(),
      assigned_to: String(taskForm.assigned_to || "").trim(),
    });

    if (taskForm.due_date) {
      await crmApi.entities.Contact.update(id, {
        next_follow_up_date: taskForm.due_date,
        row_version: contact.row_version,
      });
    }

    setTaskForm(EMPTY_TASK_FORM);
    setShowTaskDialog(false);
    await loadData();
  };

  const toggleTask = async (task) => {
    await crmApi.entities.ContactTask.update(task.id, {
      status: task.status === "completed" ? "pending" : "completed",
      row_version: task.row_version,
    });
    await loadData();
  };

  const addInteraction = async () => {
    if (!String(interactionForm.summary || "").trim()) {
      toast({
        variant: "destructive",
        title: "Interaction summary required",
        description: "Add a summary of what happened before logging the interaction.",
      });
      return;
    }

    await crmApi.entities.ContactInteraction.create({
      ...interactionForm,
      contact_id: id,
      subject: String(interactionForm.subject || "").trim(),
      summary: String(interactionForm.summary || "").trim(),
      interaction_date: interactionForm.interaction_date ? new Date(interactionForm.interaction_date).toISOString() : new Date().toISOString(),
      next_step_date: String(interactionForm.next_step_date || "").trim(),
    });

    await crmApi.entities.Contact.update(id, {
      last_contacted_date: String(interactionForm.interaction_date || "").slice(0, 10),
      next_follow_up_date: String(interactionForm.next_step_date || "").trim() || contact.next_follow_up_date || "",
      row_version: contact.row_version,
    });

    setInteractionForm(EMPTY_INTERACTION_FORM);
    setShowInteractionDialog(false);
    await loadData();
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
          related_type: "contact",
          name: file.name,
          mime_type: file.type || "application/octet-stream",
          size: file.size,
          data_base64: dataUrl,
        });
      }

      await loadData();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      setUploading(false);
      setDragActive(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const openPreview = (attachment) => {
    setPreviewAttachment(attachment);
  };

  const toggleArchive = async () => {
    const nextStatus = isArchived ? "active" : "archived";
    await crmApi.entities.Contact.update(id, { status: nextStatus, row_version: contact.row_version });
    await loadData();
  };

  const createLead = async () => {
    const createdLead = await crmApi.entities.Lead.create({
      title: `${contact.company_name || fullName} enquiry`,
      contact_id: id,
      contact_name: fullName,
      company_id: contact.company_id || "",
      company_name: contact.company_name || "",
      stage: "new_enquiry",
      source: "repeat_client",
      priority: contact.priority || "medium",
    });
    navigate(`/leads/${createdLead.id}`);
  };

  const createQuote = async () => {
    const allQuotes = await crmApi.entities.Quote.list("-created_date", 1000);
    const createdQuote = await crmApi.entities.Quote.create({
      title: `Quote for ${contact.company_name || fullName}`,
      quote_number: generateNumber("QTE", allQuotes.length),
      contact_id: id,
      contact_name: fullName,
      company_id: contact.company_id || "",
      company_name: contact.company_name || "",
      site_address: contact.address || "",
      status: "draft",
      assigned_to: contact.owner || "",
    });
    navigate(`/quotes/${createdQuote.id}`);
  };

  const createJob = async () => {
    const allJobs = await crmApi.entities.Job.list("-created_date", 1000);
    const createdJob = await crmApi.entities.Job.create({
      title: `Job for ${contact.company_name || fullName}`,
      job_number: getNextSequentialJobNumber(allJobs),
      contact_id: id,
      contact_name: fullName,
      company_id: contact.company_id || "",
      company_name: contact.company_name || "",
      status: "planning",
      quoted_value: 0,
      salesperson: contact.owner || "",
      site_address: contact.address || "",
      notes: contact.notes || "",
    });
    navigate(`/jobs/${createdJob.id}`);
  };

  const mergeDuplicate = async (duplicateContact) => {
    if (!contact || !duplicateContact) {
      return;
    }

    setMerging(true);
    try {
      const [
        allLeads,
        allQuotes,
        allJobs,
        duplicateNotes,
        duplicateTasks,
        duplicateInteractions,
      ] = await Promise.all([
        crmApi.entities.Lead.list("-created_date", 1000),
        crmApi.entities.Quote.list("-created_date", 1000),
        crmApi.entities.Job.list("-created_date", 1000),
        crmApi.entities.Note.filter({ related_id: duplicateContact.id, related_type: "contact" }, "-created_date", 200),
        crmApi.entities.ContactTask.filter({ contact_id: duplicateContact.id }, "-created_date", 200),
        crmApi.entities.ContactInteraction.filter({ contact_id: duplicateContact.id }, "-created_date", 200),
      ]);

      const mergedPayload = buildMergedContactPayload(contact, duplicateContact);
      const updatedPrimary = await crmApi.entities.Contact.update(contact.id, {
        ...mergedPayload,
        row_version: contact.row_version,
      });

      if (!updatedPrimary) {
        throw new Error("Could not update the primary contact.");
      }

      await syncPrimaryCompanyContact(updatedPrimary, contacts);

      const mergedName = getContactDisplayName(updatedPrimary);

      await Promise.all([
        ...allLeads.filter((item) => item.contact_id === duplicateContact.id).map((item) =>
          crmApi.entities.Lead.update(item.id, {
            contact_id: updatedPrimary.id,
            contact_name: mergedName,
            company_id: updatedPrimary.company_id || "",
            company_name: updatedPrimary.company_name || "",
          })
        ),
        ...allQuotes.filter((item) => item.contact_id === duplicateContact.id).map((item) =>
          crmApi.entities.Quote.update(item.id, {
            contact_id: updatedPrimary.id,
            contact_name: mergedName,
            company_id: updatedPrimary.company_id || "",
            company_name: updatedPrimary.company_name || "",
          })
        ),
        ...allJobs.filter((item) => item.contact_id === duplicateContact.id).map((item) =>
          crmApi.entities.Job.update(item.id, {
            contact_id: updatedPrimary.id,
            contact_name: mergedName,
            company_id: updatedPrimary.company_id || "",
            company_name: updatedPrimary.company_name || "",
          })
        ),
        ...duplicateNotes.map((item) =>
          crmApi.entities.Note.update(item.id, {
            related_id: updatedPrimary.id,
            row_version: item.row_version,
          })
        ),
        ...duplicateTasks.map((item) =>
          crmApi.entities.ContactTask.update(item.id, {
            contact_id: updatedPrimary.id,
            row_version: item.row_version,
          })
        ),
        ...duplicateInteractions.map((item) =>
          crmApi.entities.ContactInteraction.update(item.id, {
            contact_id: updatedPrimary.id,
            row_version: item.row_version,
          })
        ),
      ]);

      await crmApi.entities.Contact.delete(duplicateContact.id);
      setShowMergeDialog(false);
      await loadData();
      toast({
        title: "Contacts merged",
        description: `${getContactDisplayName(duplicateContact)} was merged into ${getContactDisplayName(updatedPrimary)}.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Merge failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setMerging(false);
    }
  };

  const deleteContact = async () => {
    if (!deleteProtection.canDelete) {
      toast({
        variant: "destructive",
        title: "Contact cannot be deleted",
        description: deleteProtection.message,
      });
      return;
    }

    const confirmed = window.confirm("Delete this contact? This will remove the contact record.");
    if (!confirmed) {
      return;
    }

    await crmApi.entities.Contact.delete(id);
    navigate("/contacts");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-4 lg:p-6 max-w-6xl mx-auto">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/contacts" className="hover:text-foreground">Contacts</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">Missing Contact</span>
        </div>
        <Card className="p-8 text-center text-muted-foreground">Contact not found.</Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/contacts" className="hover:text-foreground">Contacts</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate font-medium text-foreground">{fullName}</span>
      </div>

      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-bold tracking-tight text-foreground">{fullName}</h1>
            <StatusBadge label={contact.type || "client"} color={CONTACT_TYPE_COLORS[contact.type] || "slate"} />
            <StatusBadge label={contact.relationship_status || "active"} color={CONTACT_RELATIONSHIP_COLORS[contact.relationship_status] || "slate"} />
            <StatusBadge label={health.label} color={health.color} />
            {isArchived ? <StatusBadge label="archived" color="slate" /> : null}
            {contact.is_primary ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Primary contact</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {[contact.company_name, contact.title, contact.email, contact.phone || contact.mobile].filter(Boolean).join(" · ")}
          </p>
          {Array.isArray(contact.tags) && contact.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {contact.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`mailto:${contact.email}`, "_self")} disabled={!contact.email}>
            <Mail className="mr-1.5 h-4 w-4" />
            Email
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`tel:${contact.mobile || contact.phone}`, "_self")} disabled={!contact.mobile && !contact.phone}>
            <Phone className="mr-1.5 h-4 w-4" />
            Call
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInteractionDialog(true)}>
            <History className="mr-1.5 h-4 w-4" />
            Log Interaction
          </Button>
          {leadsEnabled ? (
            <Button variant="outline" size="sm" onClick={createLead}>
              <Target className="mr-1.5 h-4 w-4" />
              New Lead
            </Button>
          ) : null}
          {quotesEnabled ? (
            <Button variant="outline" size="sm" onClick={createQuote}>
              <FileText className="mr-1.5 h-4 w-4" />
              New Quote
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={createJob}>
            <Briefcase className="mr-1.5 h-4 w-4" />
            New Job
          </Button>
          {duplicateCandidates.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setShowMergeDialog(true)}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Merge Duplicate
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={toggleArchive}>
            {isArchived ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
            {isArchived ? "Restore" : "Archive"}
          </Button>
          <Button variant="destructive" size="sm" onClick={deleteContact} disabled={!deleteProtection.canDelete}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Briefcase} label="Open Work" value={String(visibleOpenWorkCount)} hint={openWorkHintParts.join(" · ")} />
        <MetricCard icon={ClipboardList} label="Pending Tasks" value={String(pendingTasks.length)} hint="Active follow-ups on this contact" />
        <MetricCard icon={History} label="Last Touch" value={latestTouchDate ? formatDate(latestTouchDate) : "—"} hint="Most recent activity or logged interaction" />
        <MetricCard icon={BellRing} label="Next Follow-up" value={contact.next_follow_up_date ? formatDate(contact.next_follow_up_date) : "—"} hint={contact.owner ? `Owned by ${contact.owner}` : "No owner assigned"} />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-border/80">
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 py-3">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="related">Related</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="grid gap-4 p-4 lg:grid-cols-2">
                  <Card className="rounded-xl border-border/80 p-5">
                    <h3 className="mb-4 text-sm font-semibold text-foreground">Pinned Information</h3>
                    <div className="grid gap-4 text-sm">
                      {[
                        ["Email", contact.email || "—", Mail],
                        ["Phone", contact.phone || "—", Phone],
                        ["Mobile", contact.mobile || "—", Phone],
                        ["Owner", contact.owner || "Unassigned", UserRound],
                        ["Preferred Channel", contact.preferred_channel || "—", MessageSquare],
                        ["Birthday", contact.birthday ? formatDate(contact.birthday) : "—", CalendarClock],
                      ].map(([label, value, Icon]) => (
                        <div key={label} className="flex gap-3">
                          <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-muted-foreground">{label}</p>
                            <p className="font-medium text-foreground">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="rounded-xl border-border/80 p-5">
                    <h3 className="mb-4 text-sm font-semibold text-foreground">Company & Address</h3>
                    <div className="grid gap-4 text-sm">
                      <div className="flex gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">Company</p>
                          {company ? (
                            <Link to={`/companies/${company.id}`} className="font-medium text-foreground hover:text-primary">
                              {company.name}
                            </Link>
                          ) : (
                            <p className="font-medium text-foreground">{contact.company_name || "No linked company"}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">Address</p>
                          <p className="font-medium text-foreground">
                            {[contact.address, contact.city, contact.state, contact.postal_code, contact.country].filter(Boolean).join(", ") || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">Title / Role</p>
                          <p className="font-medium text-foreground">{[contact.title, contact.role].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <History className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-muted-foreground">Created</p>
                          <p className="font-medium text-foreground">{formatDate(contact.created_date)}</p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="rounded-xl border-border/80 p-5 lg:col-span-2">
                    <h3 className="mb-4 text-sm font-semibold text-foreground">Profile Notes</h3>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{contact.notes || "No profile notes recorded yet."}</p>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="activity" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-4">
                  <Card className="rounded-xl border-border/80 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">Add Internal Note</h3>
                    <div className="flex gap-2">
                      <Textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add context, reminders, or private team notes..." rows={3} className="flex-1" />
                      <Button onClick={addNote} className="self-end">Add Note</Button>
                    </div>
                  </Card>

                  <Card className="rounded-xl border-border/80 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Activity Timeline</h3>
                        <p className="text-xs text-muted-foreground">Interactions, notes, tasks, and linked work activity.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowInteractionDialog(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Log Interaction
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {activityTimeline.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No activity has been logged for this contact yet.</p>
                      ) : (
                        activityTimeline.map((event) => (
                          <div key={event.id} className="rounded-xl border p-4">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <StatusBadge label={event.kind} color={event.color} />
                              <span className="text-xs text-muted-foreground">{formatDate(event.date)}</span>
                            </div>
                            <p className="font-medium text-foreground">{event.title}</p>
                            {event.description ? <p className="mt-1 text-sm text-muted-foreground">{event.description}</p> : null}
                            {event.href ? (
                              (String(event.href).startsWith("http") || String(event.href).startsWith("/filesystem")) ? (
                                <a href={event.href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                                  Open linked record
                                </a>
                              ) : (
                                <Link to={event.href} className="mt-2 inline-block text-sm font-medium text-primary hover:underline">
                                  Open linked record
                                </Link>
                              )
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="tasks" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-4">
                  <Card className="rounded-xl border-border/80 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Follow-up Tasks</h3>
                        <p className="text-xs text-muted-foreground">Actionable reminders linked directly to this contact.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShowTaskDialog(true)}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Task
                      </Button>
                    </div>
                  </Card>

                  <div className="space-y-3">
                    {tasks.length === 0 ? (
                      <Card className="rounded-xl border-border/80 p-5 text-sm text-muted-foreground">
                        No follow-up tasks yet.
                      </Card>
                    ) : (
                      tasks.map((task) => (
                        <Card key={task.id} className="rounded-xl border-border/80 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <StatusBadge label={task.status || "pending"} color={String(task.status || "").toLowerCase() === "completed" ? "emerald" : "amber"} />
                                <StatusBadge label={task.priority || "medium"} color={task.priority === "urgent" ? "red" : task.priority === "high" ? "orange" : "slate"} />
                              </div>
                              <p className={`font-medium text-foreground ${String(task.status || "").toLowerCase() === "completed" ? "line-through opacity-70" : ""}`}>{task.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{[task.type, task.assigned_to, task.due_date ? formatDate(task.due_date) : ""].filter(Boolean).join(" · ")}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => toggleTask(task)}>
                              {String(task.status || "").toLowerCase() === "completed" ? "Reopen" : "Complete"}
                            </Button>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="files" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-4">
                  <Card className="rounded-xl border-border/80 p-4">
                    <div className="flex flex-col gap-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Contact Documents</h3>
                        <p className="text-xs text-muted-foreground">Store emails, briefs, PDFs, signed forms, or supporting documents directly on the contact profile.</p>
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={ATTACHMENT_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          void uploadFiles(event.target.files);
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setDragActive(true);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragActive(true);
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault();
                          setDragActive(false);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDragActive(false);
                          void uploadFiles(event.dataTransfer.files);
                        }}
                        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                      >
                        <UploadCloud className="mx-auto mb-3 h-7 w-7 text-primary" />
                        <p className="text-sm font-semibold">{uploading ? "Uploading files..." : "Drop files here to upload"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{ATTACHMENT_HELP_TEXT}</p>
                        <div className="mt-4">
                          <span className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                            Choose Files
                          </span>
                        </div>
                      </button>

                      {uploadError ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                          {uploadError}
                        </div>
                      ) : null}
                    </div>
                  </Card>

                  {attachments.length === 0 ? (
                    <Card className="rounded-xl border-border/80 p-5 text-sm text-muted-foreground">
                      No files have been added to this contact yet.
                    </Card>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {attachments.map((attachment) => {
                        const kind = getAttachmentKind(attachment);
                        return (
                          <Card key={attachment.id} className="overflow-hidden rounded-xl border-border/80 p-0">
                            <div className="aspect-[4/3] border-b bg-muted/30">
                              <button
                                type="button"
                                className="flex h-full w-full items-center justify-center overflow-hidden"
                                onClick={() => openPreview(attachment)}
                              >
                                {kind === "image" ? (
                                  <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                                ) : kind === "pdf" ? (
                                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <FileText className="h-10 w-10" />
                                    <span className="text-xs font-medium uppercase tracking-wide">PDF Document</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <FileImage className="h-10 w-10" />
                                    <span className="text-xs font-medium uppercase tracking-wide">File</span>
                                  </div>
                                )}
                              </button>
                            </div>
                            <div className="space-y-3 p-3">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 text-muted-foreground">
                                  {kind === "image" ? <FileImage className="h-4 w-4" /> : kind === "pdf" ? <FileText className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatFileSize(attachment.size)} · {formatDate(attachment.created_date)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setVersionAttachment(attachment)}>
                                  Versions
                                </Button>
                                <Button size="sm" asChild>
                                  <a href={attachment.url} target="_blank" rel="noreferrer">
                                    Open
                                  </a>
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="related" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className={`grid gap-4 p-4 ${leadsEnabled || quotesEnabled ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
                  {leadsEnabled ? (
                    <Card className="rounded-xl border-border/80 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Leads</p>
                          <p className="text-2xl font-bold text-foreground">{leads.length}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={createLead}>New Lead</Button>
                      </div>
                      <div className="space-y-3">
                        {leads.length > 0 ? leads.map((lead) => (
                          <Link key={lead.id} to={`/leads/${lead.id}`} className="block rounded-lg border p-3 hover:bg-muted/30">
                            <p className="font-medium text-foreground">{lead.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{lead.stage || "new_enquiry"}</p>
                          </Link>
                        )) : <p className="text-sm text-muted-foreground">No linked leads yet.</p>}
                      </div>
                    </Card>
                  ) : null}

                  {quotesEnabled ? (
                    <Card className="rounded-xl border-border/80 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Quotes</p>
                          <p className="text-2xl font-bold text-foreground">{quotes.length}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={createQuote}>New Quote</Button>
                      </div>
                      <div className="space-y-3">
                        {quotes.length > 0 ? quotes.map((quote) => (
                          <Link key={quote.id} to={`/quotes/${quote.id}`} className="block rounded-lg border p-3 hover:bg-muted/30">
                            <p className="font-medium text-foreground">{quote.quote_number || quote.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{quote.status || "draft"}</p>
                          </Link>
                        )) : <p className="text-sm text-muted-foreground">No linked quotes yet.</p>}
                      </div>
                    </Card>
                  ) : null}

                  <Card className="rounded-xl border-border/80 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Jobs</p>
                        <p className="text-2xl font-bold text-foreground">{jobs.length}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={createJob}>New Job</Button>
                    </div>
                    <div className="space-y-3">
                      {jobs.length > 0 ? jobs.map((job) => (
                        <Link key={job.id} to={`/jobs/${job.id}`} className="block rounded-lg border p-3 hover:bg-muted/30">
                          <p className="font-medium text-foreground">{job.job_number || job.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{job.status || "planning"}</p>
                        </Link>
                      )) : <p className="text-sm text-muted-foreground">No linked jobs yet.</p>}
                    </div>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>

        <div className="grid min-h-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card className="rounded-2xl border-border/80 p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Company Snapshot</h3>
            {company ? (
              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <Link to={`/companies/${company.id}`} className="font-medium text-foreground hover:text-primary">{company.name}</Link>
                    <p className="text-muted-foreground">{company.type || "client"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p>{company.email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p>{company.phone || "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No linked company.</p>
            )}
          </Card>

          {duplicateCandidates.length > 0 ? (
            <Card className="rounded-2xl border-amber-300/60 bg-amber-50/70 p-5">
              <h3 className="mb-2 text-sm font-semibold text-amber-900">Possible Duplicates</h3>
              <div className="space-y-3">
                {duplicateCandidates.map((candidate) => (
                  <div key={candidate.id} className="rounded-lg border border-amber-200 bg-white/70 p-3">
                    <p className="font-medium text-foreground">{getContactDisplayName(candidate)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{[candidate.company_name, candidate.email].filter(Boolean).join(" · ")}</p>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setShowMergeDialog(true)}>
                  Merge Duplicate
                </Button>
              </div>
            </Card>
          ) : null}

          <RecordAuditPanel entityName="Contact" recordId={id} title="Contact Change History" limit={8} />

          {!deleteProtection.canDelete ? (
            <Card className="rounded-2xl border-amber-500/30 bg-amber-50/40 p-4">
              <p className="text-sm font-medium text-amber-800">Delete Protection</p>
              <p className="mt-1 text-sm text-amber-700">{deleteProtection.message}</p>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-6xl p-0">
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>Edit Contact</DialogTitle>
              <DialogDescription>Update the profile, linked company, ownership, tags, and follow-up settings.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1">
              <div className="px-6 py-5">
                <ContactFormFields form={form} setForm={setForm} companies={companies} />
              </div>
            </ScrollArea>
            <DialogFooter className="border-t px-6 py-4">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={saveContact}>Save Contact</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Follow-up Task</DialogTitle>
            <DialogDescription>Track a specific next step so it appears in the contact workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="contact-task-title">Title</Label>
              <Input id="contact-task-title" value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Task Type</Label>
                <Select value={taskForm.type} onValueChange={(value) => setTaskForm({ ...taskForm, type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_TASK_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={taskForm.priority} onValueChange={(value) => setTaskForm({ ...taskForm, priority: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "medium", "high", "urgent"].map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="contact-task-due-date">Due Date</Label>
                <Input id="contact-task-due-date" type="date" value={taskForm.due_date || ""} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="contact-task-assigned">Assigned To</Label>
                <Input id="contact-task-assigned" value={taskForm.assigned_to || ""} onChange={(event) => setTaskForm({ ...taskForm, assigned_to: event.target.value })} placeholder="Staff member name" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>Cancel</Button>
            <Button onClick={addTask}>Save Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInteractionDialog} onOpenChange={setShowInteractionDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Interaction</DialogTitle>
            <DialogDescription>Capture calls, emails, meetings, and other touch points with this contact.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Interaction Type</Label>
                <Select value={interactionForm.type} onValueChange={(value) => setInteractionForm({ ...interactionForm, type: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_INTERACTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Direction</Label>
                <Select value={interactionForm.direction} onValueChange={(value) => setInteractionForm({ ...interactionForm, direction: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="contact-interaction-subject">Subject</Label>
              <Input id="contact-interaction-subject" value={interactionForm.subject} onChange={(event) => setInteractionForm({ ...interactionForm, subject: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-interaction-summary">Summary</Label>
              <Textarea id="contact-interaction-summary" value={interactionForm.summary} onChange={(event) => setInteractionForm({ ...interactionForm, summary: event.target.value })} rows={4} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="contact-interaction-date">Interaction Date</Label>
                <Input id="contact-interaction-date" type="datetime-local" value={interactionForm.interaction_date} onChange={(event) => setInteractionForm({ ...interactionForm, interaction_date: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="contact-interaction-next-step">Next Step Date</Label>
                <Input id="contact-interaction-next-step" type="date" value={interactionForm.next_step_date} onChange={(event) => setInteractionForm({ ...interactionForm, next_step_date: event.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInteractionDialog(false)}>Cancel</Button>
            <Button onClick={addInteraction}>Log Interaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactMergeDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        primaryContact={contact}
        duplicateCandidates={duplicateMap.get(contact.id) || []}
        onConfirm={mergeDuplicate}
        loading={merging}
      />

      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.name || "File Preview"}</DialogTitle>
          </DialogHeader>
          {previewAttachment && getAttachmentKind(previewAttachment) === "image" ? (
            <div className="max-h-[75vh] overflow-auto rounded-lg border bg-muted/20">
              <img src={previewAttachment.url} alt={previewAttachment.name} className="h-auto w-full" />
            </div>
          ) : null}
          {previewAttachment && getAttachmentKind(previewAttachment) === "pdf" ? (
            <iframe
              src={previewAttachment.url}
              title={previewAttachment.name}
              className="h-[75vh] w-full rounded-lg border"
            />
          ) : null}
          {previewAttachment && getAttachmentKind(previewAttachment) === "file" ? (
            <div className="rounded-lg border bg-muted/20 p-6 text-sm">
              <p className="font-medium">This file type cannot be previewed inside JoinerFlow.</p>
              <p className="mt-1 text-muted-foreground">Open it in the right program to check the document.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <a href={previewAttachment.url} target="_blank" rel="noreferrer">Open File</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={previewAttachment.url} download={previewAttachment.name}>Download</a>
                </Button>
              </div>
            </div>
          ) : null}
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
