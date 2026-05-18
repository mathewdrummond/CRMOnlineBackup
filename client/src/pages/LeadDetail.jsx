import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import StaffMultiSelect from "../components/StaffMultiSelect";
import RecordAuditPanel from "../components/RecordAuditPanel";
import StatusBadge from "../components/StatusBadge";
import { LEAD_STAGES, formatCurrency, formatDate, getStageConfig, generateNumber } from "../lib/helpers";
import { buildLeadConversionJobPayload, getNextSequentialJobNumber } from "../lib/coreFlowHelpers";
import { getDefaultLeadCategory, getLeadCategoryForLead, sortLeadCategories } from "../lib/leadCategories";
import { useModules } from "@/lib/ModuleContext";
import { toast } from "@/components/ui/use-toast";
import { Edit2, Trash2, Plus, FileText, CheckCircle, Circle, MessageSquare, ChevronRight } from "lucide-react";

function getContactDisplayName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.full_name || contact.email || "Unnamed Contact";
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isModuleEnabled } = useModules();
  const quotesEnabled = isModuleEnabled("quotes");
  const [lead, setLead] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [showTask, setShowTask] = useState(false);
  const [showConvertJob, setShowConvertJob] = useState(false);
  const [convertJobNumber, setConvertJobNumber] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", type: "follow_up", priority: "medium", assigned_to: "" });
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    void loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) {
      setLead(null);
      setContacts([]);
      setCategories([]);
      setTasks([]);
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const [leadRecord, contactRecords, categoryRecords, taskRecords, noteRecords] = await Promise.all([
        crmApi.entities.Lead.get(id),
        crmApi.entities.Contact.list("-created_date", 500),
        crmApi.entities.LeadCategory.list("sort_order", 100),
        crmApi.entities.LeadTask.filter({ lead_id: id }),
        crmApi.entities.Note.filter({ related_id: id, related_type: "lead" }, "-created_date"),
      ]);
      setLead(leadRecord || null);
      setForm(leadRecord || {});
      setContacts(Array.isArray(contactRecords) ? contactRecords : []);
      setCategories(sortLeadCategories(Array.isArray(categoryRecords) ? categoryRecords : []));
      setTasks(Array.isArray(taskRecords) ? taskRecords : []);
      setNotes(Array.isArray(noteRecords) ? noteRecords : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Lead details could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const saveLead = async () => {
    const selectedContact = contacts.find((contact) => contact.id === form.contact_id) || null;
    const trimmedTitle = String(form.title || "").trim();
    const contactName = selectedContact ? getContactDisplayName(selectedContact) : String(form.contact_name || "").trim();

    if (!trimmedTitle) {
      toast({
        variant: "destructive",
        title: "Lead title required",
        description: "Add a title before saving the enquiry.",
      });
      return;
    }

    setSaving(true);
    try {
      await crmApi.entities.Lead.update(id, {
        ...form,
        title: trimmedTitle,
        contact_id: selectedContact?.id || "",
        contact_name: contactName,
        company_id: selectedContact?.company_id || "",
        company_name: selectedContact?.company_name || String(form.company_name || "").trim(),
        category_id: String(form.category_id || getDefaultLeadCategory(categories)?.id || "").trim(),
      });
      setEditing(false);
      await loadData();
      toast({
        title: "Lead updated",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead could not be saved",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteLead = async () => {
    if (!window.confirm("Delete this lead?")) return;
    setSaving(true);
    try {
      await crmApi.entities.Lead.delete(id);
      navigate("/leads");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead could not be deleted",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const addTask = async () => {
    if (!String(taskForm.title || "").trim()) {
      toast({
        variant: "destructive",
        title: "Task title required",
        description: "Add a task title before saving the task.",
      });
      return;
    }
    setSaving(true);
    try {
      await crmApi.entities.LeadTask.create({ ...taskForm, lead_id: id });
      setShowTask(false);
      setTaskForm({ title: "", type: "follow_up", priority: "medium", assigned_to: "" });
      await loadData();
      toast({
        title: "Lead task added",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead task could not be added",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (task) => {
    setSaving(true);
    try {
      await crmApi.entities.LeadTask.update(task.id, { status: task.status === "completed" ? "pending" : "completed" });
      await loadData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead task could not be updated",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await crmApi.entities.Note.create({ content: noteText, related_id: id, related_type: "lead", type: "note" });
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

  const convertToQuote = async () => {
    setSaving(true);
    try {
      const quotes = await crmApi.entities.Quote.list();
      const q = await crmApi.entities.Quote.create({
        title: lead.title, lead_id: id, contact_id: lead.contact_id,
        contact_name: lead.contact_name, company_id: lead.company_id,
        company_name: lead.company_name, site_address: lead.site_address,
        quote_number: generateNumber("QTE", quotes.length),
      });
      await crmApi.entities.Lead.update(id, { stage: "quote_in_progress" });
      navigate(`/quotes/${q.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Quote could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const openConvertToJob = async () => {
    setSaving(true);
    try {
      const jobs = await crmApi.entities.Job.list();
      setConvertJobNumber(getNextSequentialJobNumber(jobs));
      setShowConvertJob(true);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Job conversion could not be prepared",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const convertToJob = async () => {
    const trimmedJobNumber = String(convertJobNumber || "").trim().toUpperCase();
    if (!trimmedJobNumber) {
      toast({
        variant: "destructive",
        title: "Job number required",
        description: "Enter a job number before converting the enquiry.",
      });
      return;
    }

    setSaving(true);
    try {
      const jobs = await crmApi.entities.Job.list();
      const duplicateNumber = jobs.some(
        (job) => String(job.job_number || "").trim().toLowerCase() === trimmedJobNumber.toLowerCase()
      );
      if (duplicateNumber) {
        toast({
          variant: "destructive",
          title: "Duplicate job number",
          description: "That job number already exists.",
        });
        return;
      }

      const createdJob = await crmApi.entities.Job.create(buildLeadConversionJobPayload(lead, trimmedJobNumber));
      await crmApi.entities.Lead.update(id, { stage: "won" });
      setShowConvertJob(false);
      navigate(`/jobs/${createdJob.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead could not be converted",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateStage = async (stageValue) => {
    setSaving(true);
    try {
      await crmApi.entities.Lead.update(id, { stage: stageValue });
      await loadData();
      toast({
        title: "Lead stage updated",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lead stage could not be updated",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  if (!lead) {
    return (
      <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
        {loadError ? (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{loadError}</span>
              <Button type="button" variant="outline" onClick={() => void loadData()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <Card className="p-8 text-center text-muted-foreground">Lead not found.</Card>
      </div>
    );
  }

  const sc = getStageConfig(LEAD_STAGES, lead.stage);
  const leadCategory = getLeadCategoryForLead(lead, categories);
  const defaultCategory = getDefaultLeadCategory(categories);
  const sortedContacts = [...contacts].sort((left, right) =>
    getContactDisplayName(left).localeCompare(getContactDisplayName(right), undefined, { sensitivity: "base", numeric: true })
  );

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/leads" className="hover:text-foreground">Leads</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium truncate">{lead.title}</span>
      </div>
      {loadError ? (
        <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
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
            <h1 className="text-2xl font-bold">{lead.title}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
            <StatusBadge label={leadCategory.name} color={leadCategory.color} />
          </div>
          <p className="text-sm text-muted-foreground">{[lead.contact_name, lead.company_name].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={saving}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          <Button variant="outline" size="sm" onClick={() => void openConvertToJob()} disabled={saving}>Convert to Job</Button>
          {quotesEnabled ? <Button size="sm" onClick={() => void convertToQuote()} disabled={saving}><FileText className="w-3.5 h-3.5 mr-1" />Create Quote</Button> : null}
          <Button variant="ghost" size="sm" onClick={() => void deleteLead()} disabled={saving}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {/* Stage selector */}
      <Card className="p-3 mb-5">
        <div className="flex gap-1 overflow-x-auto">
          {LEAD_STAGES.map((stage, i) => {
            const currentIdx = LEAD_STAGES.findIndex(s => s.value === lead.stage);
            const isActive = stage.value === lead.stage;
            const isPast = currentIdx > i;
            return (
              <button key={stage.value} onClick={() => void updateStage(stage.value)} disabled={saving}
                className={`flex-1 min-w-[72px] py-1.5 px-1 rounded text-[11px] font-medium text-center transition-colors whitespace-nowrap
                  ${isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"} ${saving ? "opacity-60" : ""}`}>
                {stage.label}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Value", formatCurrency(lead.value)],
                ["Probability", `${lead.probability || 0}%`],
                ["Category", leadCategory.name],
                ["Source", lead.source?.replace(/_/g," ") || "—"],
                ["Expected Close", formatDate(lead.expected_close)],
                ["Assigned To", lead.assigned_to || "—"],
                ["Priority", lead.priority || "medium"],
              ].map(([k, v]) => (
                <div key={k}><span className="text-muted-foreground">{k}</span><p className="font-medium mt-0.5">{v}</p></div>
              ))}
            </div>
            {lead.site_address && <div className="mt-4 pt-4 border-t text-sm"><span className="text-muted-foreground">Site Address</span><p className="mt-0.5">{lead.site_address}</p></div>}
            {lead.description && <div className="mt-3 text-sm"><span className="text-muted-foreground">Description</span><p className="mt-0.5">{lead.description}</p></div>}
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-3">Notes</h3>
            <div className="flex gap-2 mb-4">
              <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." rows={2} className="flex-1" />
              <Button onClick={() => void addNote()} size="sm" className="self-end" disabled={saving}>Add</Button>
            </div>
            <div className="space-y-2">
              {notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : null}
              {notes.map(note => (
                <div key={note.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                  <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div><p className="text-sm">{note.content}</p><p className="text-xs text-muted-foreground mt-1">{formatDate(note.created_date)}</p></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <Card className="p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Tasks ({tasks.length})</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTask(true)} disabled={saving}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="space-y-2">
              {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>}
              {tasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 p-2 rounded hover:bg-muted/50">
                  <button onClick={() => void toggleTask(task)} className="mt-0.5 flex-shrink-0" disabled={saving}>
                    {task.status === "completed"
                      ? <CheckCircle className="w-4 h-4 text-primary" />
                      : <Circle className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                    {task.assigned_to && <p className="text-xs text-muted-foreground">{task.assigned_to}</p>}
                    {task.due_date && <p className="text-xs text-muted-foreground">{formatDate(task.due_date)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <RecordAuditPanel entityName="Lead" recordId={id} title="Lead Change History" limit={8} />
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update the enquiry details, contact information, and scheduling notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title || ""} onChange={e => setForm({...form, title: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Value</Label><Input type="number" value={form.value || ""} onChange={e => setForm({...form, value: parseFloat(e.target.value) || 0})} /></div>
              <div><Label>Probability %</Label><Input type="number" value={form.probability || ""} onChange={e => setForm({...form, probability: parseFloat(e.target.value) || 0})} /></div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category_id || defaultCategory?.id || "__none"} onValueChange={value => setForm({ ...form, category_id: value === "__none" ? "" : value })}>
                <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Use default category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Existing Contact</Label>
              <Select
                value={form.contact_id || "__none"}
                onValueChange={(value) => {
                  if (value === "__none") {
                    setForm({ ...form, contact_id: "", contact_name: "", company_id: "", company_name: "" });
                    return;
                  }

                  const selectedContact = contacts.find((contact) => contact.id === value);
                  setForm({
                    ...form,
                    contact_id: value,
                    contact_name: selectedContact ? getContactDisplayName(selectedContact) : form.contact_name,
                    company_id: selectedContact?.company_id || "",
                    company_name: selectedContact?.company_name || "",
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No existing contact</SelectItem>
                  {sortedContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {`${getContactDisplayName(contact)}${contact.company_name ? ` · ${contact.company_name}` : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.contact_id && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Name</Label><Input value={form.contact_name || ""} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
                <div><Label>Company Name</Label><Input value={form.company_name || ""} onChange={e => setForm({...form, company_name: e.target.value})} /></div>
              </div>
            )}
            <div>
              <Label>Site Address</Label>
              <AddressAutocompleteInput
                value={form.site_address || ""}
                onChange={(nextValue) => setForm({ ...form, site_address: nextValue })}
              />
            </div>
            <div>
              <Label>Assigned To</Label>
              <StaffMultiSelect
                value={form.assigned_to || ""}
                onChange={(nextValue) => setForm({ ...form, assigned_to: nextValue })}
              />
            </div>
            <div><Label>Expected Close</Label><Input type="date" value={form.expected_close || ""} onChange={e => setForm({...form, expected_close: e.target.value})} /></div>
            <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void saveLead()} disabled={saving}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showConvertJob} onOpenChange={setShowConvertJob}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert Enquiry To Job</DialogTitle>
            <DialogDescription>Create a live job record from this enquiry and preserve the customer details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="lead-convert-job-number">Job Number</Label>
              <Input id="lead-convert-job-number" value={convertJobNumber} onChange={(event) => setConvertJobNumber(event.target.value.toUpperCase())} />
            </div>
            <p className="text-sm text-muted-foreground">
              This will create a new job from the current enquiry details and move the enquiry to the won stage.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConvertJob(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void convertToJob()} disabled={saving}>Convert</Button>
            </div>
          </div>
      </DialogContent>
      </Dialog>

      <Dialog open={showTask} onOpenChange={setShowTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
            <DialogDescription>Add a follow-up task to this enquiry so it shows in pending work lists.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={taskForm.title} onChange={e => setTaskForm({...taskForm, title: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={taskForm.type} onValueChange={v => setTaskForm({...taskForm, type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["follow_up","call","email","site_visit","measure","other"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Due Date</Label><Input type="date" value={taskForm.due_date || ""} onChange={e => setTaskForm({...taskForm, due_date: e.target.value})} /></div>
            </div>
            <div>
              <Label>Assigned To</Label>
              <StaffMultiSelect
                value={taskForm.assigned_to || ""}
                onChange={(nextValue) => setTaskForm({ ...taskForm, assigned_to: nextValue })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTask(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void addTask()} disabled={saving || !taskForm.title}>Add Task</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
