import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { LEAD_STAGES, formatCurrency, formatDate, getStageConfig } from "../lib/helpers";
import { Plus, Target, LayoutGrid, List, Search } from "lucide-react";

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState("kanban");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", value: "", stage: "new_enquiry", source: "phone", priority: "medium", description: "" });

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = () => crmApi.entities.Lead.list("-created_date", 200).then(setLeads).finally(() => setLoading(false));

  const createLead = async () => {
    await crmApi.entities.Lead.create({ ...form, value: parseFloat(form.value) || 0 });
    setShowCreate(false);
    setForm({ title: "", value: "", stage: "new_enquiry", source: "phone", priority: "medium", description: "" });
    loadLeads();
  };

  const filtered = leads.filter(l =>
    l.title?.toLowerCase().includes(search.toLowerCase()) ||
    l.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-full">
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} leads · ${formatCurrency(filtered.reduce((s, l) => s + (l.value || 0), 0))} pipeline`}
        actions={
          <div className="flex gap-2">
            <div className="flex bg-muted rounded-lg p-0.5">
              <button onClick={() => setView("kanban")} className={`px-3 py-1.5 rounded-md transition-colors ${view === "kanban" ? "bg-card shadow-sm" : ""}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md transition-colors ${view === "list" ? "bg-card shadow-sm" : ""}`}><List className="w-3.5 h-3.5" /></button>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New Lead</Button>
          </div>
        }
      />
      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {LEAD_STAGES.filter(s => !["lost"].includes(s.value)).map(stage => {
            const stageLeads = filtered.filter(l => l.stage === stage.value);
            return (
              <div key={stage.value} className="flex-shrink-0 w-64">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge label={stage.label} color={stage.color} />
                    <span className="text-xs text-muted-foreground">{stageLeads.length}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatCurrency(stageLeads.reduce((s, l) => s + (l.value || 0), 0))}</span>
                </div>
                <div className="space-y-2 min-h-20">
                  {stageLeads.map(lead => (
                    <Link key={lead.id} to={`/leads/${lead.id}`}>
                      <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer group">
                        <p className="text-sm font-medium group-hover:text-primary transition-colors mb-1">{lead.title}</p>
                        {lead.contact_name && <p className="text-xs text-muted-foreground mb-2">{lead.contact_name}</p>}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{formatCurrency(lead.value)}</span>
                          {lead.expected_close && <span className="text-xs text-muted-foreground">{formatDate(lead.expected_close)}</span>}
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Lead</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Contact</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Stage</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Value</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Close Date</th>
              </tr></thead>
              <tbody>
                {filtered.map(lead => {
                  const sc = getStageConfig(LEAD_STAGES, lead.stage);
                  return (
                    <tr key={lead.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                      <td className="py-3 px-4 font-medium">{lead.title}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{lead.contact_name || "—"}</td>
                      <td className="py-3 px-4"><StatusBadge label={sc.label} color={sc.color} /></td>
                      <td className="py-3 px-4 text-right font-semibold">{formatCurrency(lead.value)}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(lead.expected_close)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <EmptyState icon={Target} title="No leads found" actionLabel="New Lead" onAction={() => setShowCreate(true)} />}
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Kitchen renovation – Smith" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Value ($)</Label><Input type="number" value={form.value} onChange={e => setForm({...form, value: e.target.value})} placeholder="0" /></div>
              <div><Label>Source</Label>
                <Select value={form.source} onValueChange={v => setForm({...form, source: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["referral","website","phone","walk_in","trade_show","social_media","advertising","repeat_client","other"].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low","medium","high","urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Expected Close</Label><Input type="date" value={form.expected_close || ""} onChange={e => setForm({...form, expected_close: e.target.value})} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createLead} disabled={!form.title}>Create Lead</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}