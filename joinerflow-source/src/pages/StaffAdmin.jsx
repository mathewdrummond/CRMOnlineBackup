import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "../lib/helpers";

const EMPTY_FORM = { name: "", employee_id: "", email: "", hourly_rate: "", status: "active" };

export default function StaffAdmin() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");

  useEffect(() => { loadStaff(); }, []);

  const loadStaff = async () => {
    const s = await crmApi.entities.Staff.list("name", 200);
    setStaff(s);
    setLoading(false);
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowDialog(true); };
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, employee_id: s.employee_id, email: s.email || "", hourly_rate: s.hourly_rate || "", status: s.status }); setShowDialog(true); };

  const save = async () => {
    const data = { ...form, hourly_rate: parseFloat(form.hourly_rate) || 0 };
    if (editing) {
      await crmApi.entities.Staff.update(editing.id, data);
    } else {
      await crmApi.entities.Staff.create(data);
    }
    setShowDialog(false);
    loadStaff();
  };

  const remove = async (id) => {
    await crmApi.entities.Staff.delete(id);
    loadStaff();
  };

  const filtered = staff.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.employee_id?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Staff"
        subtitle="Manage employees and MYOB employee IDs"
        actions={
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add Staff</Button>
        }
      />

      <div className="mb-4">
        <Input placeholder="Search by name or employee ID..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No staff yet" description="Add your team members with their MYOB employee IDs" actionLabel="Add Staff" onAction={openCreate} />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filtered.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {s.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs">
                      {s.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ID: <span className="font-mono">{s.employee_id}</span>
                    {s.email && <span className="ml-3">{s.email}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{s.hourly_rate ? formatCurrency(s.hourly_rate) + "/hr" : "—"}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Smith" />
            </div>
            <div>
              <Label>MYOB Employee ID *</Label>
              <Input value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} placeholder="e.g. EMP001" className="font-mono" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" type="email" />
            </div>
            <div>
              <Label>Hourly Rate ($)</Label>
              <Input value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} placeholder="0.00" type="number" min="0" step="0.01" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || !form.employee_id}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}