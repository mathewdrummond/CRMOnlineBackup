import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "../components/StatusBadge";
import { JOB_STATUSES, OPERATIONS, formatCurrency, formatDate, getStageConfig, generateNumber } from "../lib/helpers";
import { ChevronRight, Edit2, Plus, DollarSign, Clock, ShoppingCart, MessageSquare } from "lucide-react";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [operations, setOperations] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [showOp, setShowOp] = useState(false);
  const [opForm, setOpForm] = useState({ operation: "design", estimated_hours: 0, assigned_to: "" });
  const [noteText, setNoteText] = useState("");

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    const [all, ops, time, pos, n] = await Promise.all([
      crmApi.entities.Job.list(),
      crmApi.entities.JobOperation.filter({ job_id: id }),
      crmApi.entities.TimeEntry.filter({ job_id: id }),
      crmApi.entities.PurchaseOrder.filter({ job_id: id }),
      crmApi.entities.Note.filter({ related_id: id, related_type: "job" }, "-created_date"),
    ]);
    const j = all.find(x => x.id === id);
    setJob(j); setForm(j || {}); setOperations(ops); setTimeEntries(time); setPurchaseOrders(pos); setNotes(n);
  };

  const saveJob = async () => { await crmApi.entities.Job.update(id, form); setEditing(false); loadData(); };

  const addOperation = async () => {
    await crmApi.entities.JobOperation.create({ ...opForm, job_id: id, job_number: job.job_number, job_title: job.title, sort_order: operations.length });
    setShowOp(false); setOpForm({ operation: "design", estimated_hours: 0, assigned_to: "" }); loadData();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await crmApi.entities.Note.create({ content: noteText, related_id: id, related_type: "job", type: "note" });
    setNoteText(""); loadData();
  };

  if (!job) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const sc = getStageConfig(JOB_STATUSES, job.status);
  const totalLabourHours = timeEntries.reduce((s, t) => s + (t.hours || 0), 0);
  const totalLabourCost = timeEntries.reduce((s, t) => s + (t.total_cost || 0), 0);
  const totalPO = purchaseOrders.reduce((s, p) => s + (p.total || 0), 0);
  const totalCost = totalLabourCost + totalPO;
  const margin = job.quoted_value > 0 ? ((job.quoted_value - totalCost) / job.quoted_value * 100) : 0;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/jobs" className="hover:text-foreground">Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{job.job_number}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-mono text-muted-foreground">{job.job_number}</span>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
          </div>
          <p className="text-sm text-muted-foreground">{[job.contact_name, job.site_address].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          <Select value={job.status} onValueChange={v => crmApi.entities.Job.update(id, { status: v }).then(loadData)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{JOB_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Profitability */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {[
          { label: "Quoted", value: formatCurrency(job.quoted_value) },
          { label: "Labour", value: `${totalLabourHours.toFixed(1)}h`, sub: formatCurrency(totalLabourCost) },
          { label: "Materials", value: formatCurrency(totalPO), sub: `${purchaseOrders.length} POs` },
          { label: "Total Cost", value: formatCurrency(totalCost) },
        ].map(item => (
          <Card key={item.label} className="p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-bold">{item.value}</p>
            {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
          </Card>
        ))}
        <Card className={`p-4 ${margin >= 30 ? "bg-emerald-50 border-emerald-200" : margin >= 15 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
          <p className="text-xs text-muted-foreground">Margin</p>
          <p className="text-lg font-bold">{margin.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(job.quoted_value - totalCost)}</p>
        </Card>
      </div>

      <Tabs defaultValue="operations">
        <TabsList className="mb-4">
          <TabsTrigger value="operations">Operations ({operations.length})</TabsTrigger>
          <TabsTrigger value="time">Time ({timeEntries.length})</TabsTrigger>
          <TabsTrigger value="purchasing">Purchasing ({purchaseOrders.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="operations">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Operations</h3>
              <Button size="sm" onClick={() => setShowOp(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              {operations.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No operations yet.</p>}
              {operations.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(op => {
                const oc = getStageConfig(OPERATIONS, op.operation);
                return (
                  <div key={op.id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge label={oc.label} color={oc.color} />
                        {op.assigned_to && <span className="text-sm">{op.assigned_to}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {op.start_date && `${formatDate(op.start_date)} → ${formatDate(op.end_date)} · `}
                        {op.estimated_hours > 0 && `${op.estimated_hours}h est`}
                      </p>
                    </div>
                    <Select value={op.status} onValueChange={v => crmApi.entities.JobOperation.update(op.id, { status: v }).then(loadData)}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["pending","scheduled","in_progress","completed","on_hold"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="time">
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Time Entries</h3>
            {timeEntries.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No time recorded.</p> : (
              <div className="space-y-2">
                {timeEntries.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm">
                    <div className="flex-1">
                      <p className="font-medium">{t.staff_name}</p>
                      <p className="text-xs text-muted-foreground">{t.operation?.replace(/_/g," ")} · {formatDate(t.date)}</p>
                    </div>
                    <span className="font-semibold">{t.hours?.toFixed(1)}h</span>
                    <span className="text-muted-foreground">{formatCurrency(t.total_cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="purchasing">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Purchase Orders</h3>
              <Button size="sm" onClick={() => navigate(`/purchasing?job_id=${id}&job_number=${job.job_number}&job_title=${encodeURIComponent(job.title)}`)}><Plus className="w-3.5 h-3.5 mr-1" />New PO</Button>
            </div>
            {purchaseOrders.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No POs yet.</p> : (
              <div className="space-y-2">
                {purchaseOrders.map(po => (
                  <div key={po.id} className="flex items-center gap-3 p-3 rounded-lg border text-sm cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/purchasing/${po.id}`)}>
                    <div className="flex-1">
                      <p className="font-medium">{po.po_number} · {po.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(po.order_date)}</p>
                    </div>
                    <StatusBadge label={po.status?.replace(/_/g," ")} color={po.status==="received"?"emerald":po.status==="sent"?"blue":"slate"} />
                    <span className="font-semibold">{formatCurrency(po.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-5">
            <h3 className="font-semibold text-sm mb-4">Notes</h3>
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
        </TabsContent>
      </Tabs>

      <Dialog open={showOp} onOpenChange={setShowOp}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Operation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Operation</Label>
              <Select value={opForm.operation} onValueChange={v => setOpForm({...opForm, operation: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={opForm.start_date||""} onChange={e => setOpForm({...opForm, start_date: e.target.value})} /></div>
              <div><Label>End Date</Label><Input type="date" value={opForm.end_date||""} onChange={e => setOpForm({...opForm, end_date: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Est. Hours</Label><Input type="number" value={opForm.estimated_hours} onChange={e => setOpForm({...opForm, estimated_hours: parseFloat(e.target.value)||0})} /></div>
              <div><Label>Assigned To</Label><Input value={opForm.assigned_to} onChange={e => setOpForm({...opForm, assigned_to: e.target.value})} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowOp(false)}>Cancel</Button>
              <Button onClick={addOperation}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Job</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title||""} onChange={e => setForm({...form, title: e.target.value})} /></div>
            <div><Label>Site Address</Label><Input value={form.site_address||""} onChange={e => setForm({...form, site_address: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date</Label><Input type="date" value={form.start_date||""} onChange={e => setForm({...form, start_date: e.target.value})} /></div>
              <div><Label>Due Date</Label><Input type="date" value={form.due_date||""} onChange={e => setForm({...form, due_date: e.target.value})} /></div>
            </div>
            <div><Label>Install Date</Label><Input type="date" value={form.install_date||""} onChange={e => setForm({...form, install_date: e.target.value})} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes||""} onChange={e => setForm({...form, notes: e.target.value})} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={saveJob}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}