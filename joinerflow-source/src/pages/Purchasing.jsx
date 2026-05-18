import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { PO_STATUSES, formatCurrency, formatDate, getStageConfig, generateNumber } from "../lib/helpers";
import { ShoppingCart, Plus, Search, Filter } from "lucide-react";

export default function Purchasing() {
  const navigate = useNavigate();
  const [pos, setPOs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ supplier_id: "", supplier_name: "", job_id: "", job_number: "", job_title: "", expected_date: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("job_id")) {
      setForm(f => ({ ...f, job_id: params.get("job_id"), job_number: params.get("job_number") || "", job_title: decodeURIComponent(params.get("job_title") || "") }));
      setShowCreate(true);
    }
    Promise.all([
      crmApi.entities.PurchaseOrder.list("-created_date", 200),
      crmApi.entities.Supplier.filter({ status: "active" }),
      crmApi.entities.Job.list("-created_date", 100),
    ]).then(([p, s, j]) => { setPOs(p); setSuppliers(s); setJobs(j); }).finally(() => setLoading(false));
  }, []);

  const createPO = async () => {
    const po = await crmApi.entities.PurchaseOrder.create({
      ...form,
      po_number: generateNumber("PO", pos.length),
      order_date: new Date().toISOString().split("T")[0],
      status: "draft",
    });
    setShowCreate(false);
    setForm({ supplier_id: "", supplier_name: "", job_id: "", job_number: "", job_title: "", expected_date: "" });
    navigate(`/purchasing/${po.id}`);
  };

  const filtered = pos.filter(p => {
    const matchSearch = `${p.po_number} ${p.supplier_name} ${p.job_title} ${p.job_number}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Purchasing" subtitle={`${pos.length} purchase orders · ${formatCurrency(pos.reduce((s,p)=>s+(p.total||0),0))} total`}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New PO</Button>}
      />
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">PO #</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Supplier</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Job</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Expected</th>
            </tr></thead>
            <tbody>
              {filtered.map(po => {
                const sc = getStageConfig(PO_STATUSES, po.status);
                return (
                  <tr key={po.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/purchasing/${po.id}`)}>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{po.po_number}</td>
                    <td className="py-3 px-4 font-medium">{po.supplier_name}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{po.job_number ? `${po.job_number} · ${po.job_title}` : "—"}</td>
                    <td className="py-3 px-4"><StatusBadge label={sc.label} color={sc.color} /></td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(po.total)}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(po.expected_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={ShoppingCart} title="No purchase orders" description="Create a PO for materials or services" actionLabel="New PO" onAction={() => setShowCreate(true)} />}
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Supplier *</Label>
              <Select value={form.supplier_id} onValueChange={v => {
                const s = suppliers.find(s => s.id === v);
                setForm({...form, supplier_id: v, supplier_name: s?.name || ""});
              }}>
                <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              {!form.supplier_id && <Input className="mt-2" placeholder="Or type supplier name" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})} />}
            </div>
            <div><Label>Job (optional)</Label>
              <Select value={form.job_id || "none"} onValueChange={v => {
                if (v === "none") { setForm({...form, job_id: "", job_number: "", job_title: ""}); return; }
                const j = jobs.find(j => j.id === v);
                setForm({...form, job_id: v, job_number: j?.job_number || "", job_title: j?.title || ""});
              }}>
                <SelectTrigger><SelectValue placeholder="Link to job..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.job_number} – {j.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_date} onChange={e => setForm({...form, expected_date: e.target.value})} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createPO} disabled={!form.supplier_name}>Create PO</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}