import { useState, useEffect } from "react";
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
import { Plus, Truck, Search } from "lucide-react";

const CAT_COLORS = { board_supplier:"blue", hardware:"amber", stone:"purple", glass:"cyan", paint_finish:"pink", edging:"teal", general:"slate", subcontractor:"orange" };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", category: "general", payment_terms: "30_days" });

  useEffect(() => {
    crmApi.entities.Supplier.list("-created_date", 200).then(setSuppliers).finally(() => setLoading(false));
  }, []);

  const createSupplier = async () => {
    await crmApi.entities.Supplier.create(form);
    setShowCreate(false); setForm({ name: "", category: "general", payment_terms: "30_days" });
    crmApi.entities.Supplier.list("-created_date", 200).then(setSuppliers);
  };

  const filtered = suppliers.filter(s => `${s.name} ${s.contact_name} ${s.email}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Suppliers" subtitle={`${suppliers.length} suppliers`}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />Add Supplier</Button>}
      />
      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Contact</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Terms</th>
            </tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted/30">
                  <td className="py-3 px-4 font-medium">{s.name}</td>
                  <td className="py-3 px-4"><StatusBadge label={s.category?.replace(/_/g," ")||"general"} color={CAT_COLORS[s.category]||"slate"} /></td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{s.contact_name || "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{s.phone || "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{s.payment_terms?.replace(/_/g," ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={Truck} title="No suppliers yet" actionLabel="Add Supplier" onAction={() => setShowCreate(true)} />}
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["board_supplier","hardware","stone","glass","paint_finish","edging","general","subcontractor","other"].map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={v => setForm({...form, payment_terms: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["COD","7_days","14_days","30_days","60_days"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Person</Label><Input value={form.contact_name||""} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
              <div><Label>Phone</Label><Input value={form.phone||""} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            </div>
            <div><Label>Email</Label><Input value={form.email||""} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createSupplier} disabled={!form.name}>Add Supplier</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}