import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "../components/StatusBadge";
import { LEAD_STAGES, formatCurrency, formatDate, getStageConfig, generateNumber } from "../lib/helpers";
import { ArrowLeft, Edit2, Trash2, Plus, FileText, CheckCircle, Circle, MessageSquare, ChevronRight } from "lucide-react";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [showTask, setShowTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", type: "follow_up", priority: "medium" });
  const [noteText, setNoteText] = useState("");

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    const [all, t, n] = await Promise.all([
      crmApi.entities.Lead.list(),
      crmApi.entities.LeadTask.filter({ lead_id: id }),
      crmApi.entities.Note.filter({ related_id: id, related_type: "lead" }, "-created_date"),
    ]);
    const l = all.find(x => x.id === id);
    setLead(l); setForm(l || {}); setTasks(t); setNotes(n);
  };

  const saveLead = async () => {
    await crmApi.entities.Lead.update(id, form);
    setEditing(false); loadData();
  };

  const deleteLead = async () => {
    if (!confirm("Delete this lead?")) return;
    await crmApi.entities.Lead.delete(id);
    navigate("/leads");
  };

  const addTask = async () => {
    await crmApi.entities.LeadTask.create({ ...taskForm, lead_id: id });
    setShowTask(false); setTaskForm({ title: "", type: "follow_up", priority: "medium" }); loadData();
  };

  const toggleTask = async (task) => {
    await crmApi.entities.LeadTask.update(task.id, { status: task.status === "completed" ? "pending" : "completed" });
    loadData();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await crmApi.entities.Note.create({ content: noteText, related_id: id, related_type: "lead", type: "note" });
    setNoteText(""); loadData();
  };

  const convertToQuote = async () => {
    const quotes = await crmApi.entities.Quote.list();
    const q = await crmApi.entities.Quote.create({
      title: lead.title, lead_id: id, contact_id: lead.contact_id,
      contact_name: lead.contact_name, company_id: lead.company_id,
      company_name: lead.company_name, site_address: lead.site_address,
      quote_number: generateNumber("QTE", quotes.length),
    });
    await crmApi.entities.Lead.update(id, { stage: "quote_in_progress" });
    navigate(`/quotes/${q.id}`);
  };

  if (!lead) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const sc = getStageConfig(LEAD_STAGES, lead.stage);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/leads" className="hover:text-foreground">Leads</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium truncate">{lead.title}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold">{lead.title}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
          </div>
          <p className="text-sm text-muted-foreground">{[lead.contact_name, lead.company_name].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          <Button size="sm" onClick={convertToQuote}><FileText className="w-3.5 h-3.5 mr-1" />Create Quote</Button>
          <Button variant="ghost" size="sm" onClick={deleteLead}><Trash2 className="w-3.5 h-3.5" /></Button>
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
              <button key={stage.value} onClick={() => crmApi.entities.Lead.update(id, { stage: stage.value }).then(loadData)}
                className={`flex-1 min-w-[72px] py-1.5 px-1 rounded text-[11px] font-medium text-center transition-colors whitespace-nowrap
                  ${isActive ? "bg-primary text-primary-foreground" : isPast ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
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
              <Button onClick={addNote} size="sm" className="self-end">Add</Button>
            </div>
            <div className="space-y-2">
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
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Tasks ({tasks.length})</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTask(true)}><Plus className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="space-y-2">
              {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>}
              {tasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 p-2 rounded hover:bg-muted/50">
                  <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0">
                    {task.status === "completed"
                      ? <CheckCircle className="w-4 h-4 text-primary" />
                      : <Circle className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                    {task.due_date && <p className="text-xs text-muted-foreground">{formatDate(task.due_date)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title || ""} onChange={e => setForm({...form, title: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Value</Label><Input type="number" value={form.value || ""} onChange={e => setForm({...form, value: parseFloat(e.target.value) || 0})} /></div>
              <div><Label>Probability %</Label><Input type="number" value={form.probability || ""} onChange={e => setForm({...form, probability: parseFloat(e.target.value) || 0})} /></div>
            </div>
            <div><Label>Contact Name</Label><Input value={form.contact_name || ""} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
            <div><Label>Site Address</Label><Input value={form.site_address || ""} onChange={e => setForm({...form, site_address: e.target.value})} /></div>
            <div><Label>Assigned To</Label><Input value={form.assigned_to || ""} onChange={e => setForm({...form, assigned_to: e.target.value})} /></div>
            <div><Label>Expected Close</Label><Input type="date" value={form.expected_close || ""} onChange={e => setForm({...form, expected_close: e.target.value})} /></div>
            <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={saveLead}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTask} onOpenChange={setShowTask}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTask(false)}>Cancel</Button>
              <Button onClick={addTask} disabled={!taskForm.title}>Add Task</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}