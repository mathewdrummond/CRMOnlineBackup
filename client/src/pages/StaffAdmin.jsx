import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "../lib/helpers";

const EMPTY_FORM = { name: "", employee_id: "", employee_record_id: "", email: "", phone: "", staff_type: "Employee", hourly_rate: "", status: "active" };

export default function StaffAdmin() {
  const { isAdmin } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");

  useEffect(() => { loadStaff(); }, []);

  const loadStaff = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const s = await crmApi.entities.Staff.list("name", 200);
      setStaff(Array.isArray(s) ? s : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Staff could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowDialog(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name: s.name,
      employee_id: s.employee_id,
      employee_record_id: s.employee_record_id || "",
      email: s.email || "",
      phone: s.phone || "",
      staff_type: s.staff_type || s.type || "Employee",
      hourly_rate: s.hourly_rate || "",
      status: s.status,
    });
    setShowDialog(true);
  };

  const save = async () => {
    const data = {
      ...form,
      employee_id: String(form.employee_id || "").trim(),
      employee_record_id: String(form.employee_record_id || "").trim(),
      email: String(form.email || "").trim(),
      phone: String(form.phone || "").trim(),
      staff_type: String(form.staff_type || "Employee").trim() || "Employee",
      hourly_rate: parseFloat(form.hourly_rate) || 0,
    };

    setSaving(true);
    try {
      if (editing) {
        await crmApi.entities.Staff.update(editing.id, data);
      } else {
        await crmApi.entities.Staff.create(data);
      }
      setShowDialog(false);
      await loadStaff();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Staff record could not be saved",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const target = staff.find((member) => member.id === id);
    const confirmed = window.confirm(`Delete ${target?.name || "this staff member"}?`);
    if (!confirmed) {
      return;
    }

    try {
      await crmApi.entities.Staff.delete(id);
      await loadStaff();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Staff record could not be deleted",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const filtered = staff.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
      <PageHeader
        title="Staff"
        subtitle="Manage employees, MYOB card IDs, and the active Timeclock team"
        actions={
          <Button className="min-h-[44px]" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add Staff</Button>
        }
      />
      {loadError ? (
        <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadStaff()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4">
        <Input placeholder="Search by name, employee ID, or phone..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 max-w-sm" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No staff yet" description="Add your team members with their MYOB employee IDs" actionLabel="Add Staff" onAction={openCreate} />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {filtered.map(s => (
              <div key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-muted/30">
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
                    {s.employee_record_id && <span className="ml-3">Record: <span className="font-mono">{s.employee_record_id}</span></span>}
                    {s.staff_type && <span className="ml-3">{s.staff_type}</span>}
                    {s.phone && <span className="ml-3">{s.phone}</span>}
                    {s.email && <span className="ml-3">{s.email}</span>}
                  </div>
                </div>
                {isAdmin ? (
                  <div className="text-right">
                    <p className="font-semibold">{s.hourly_rate ? formatCurrency(s.hourly_rate) + "/hr" : "—"}</p>
                  </div>
                ) : null}
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive" onClick={() => remove(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
            <DialogDescription>Maintain staff contact details, MYOB identifiers, rates, and active timeclock status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full Name *</Label>
              <Input className="min-h-[44px]" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Smith" />
            </div>
            <div>
              <Label>MYOB Employee ID *</Label>
              <Input value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} placeholder="e.g. EMP001" className="min-h-[44px] font-mono" />
            </div>
            <div>
              <Label>MYOB Employee Record ID</Label>
              <Input value={form.employee_record_id} onChange={e => setForm({ ...form, employee_record_id: e.target.value })} placeholder="Optional MYOB record ID" className="min-h-[44px] font-mono" />
            </div>
            <div>
              <Label>Email</Label>
              <Input className="min-h-[44px]" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" type="email" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input className="min-h-[44px]" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="027..." />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.staff_type} onValueChange={v => setForm({ ...form, staff_type: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Employee">Employee</SelectItem>
                  <SelectItem value="Contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin ? (
              <div>
                <Label>Hourly Rate ($)</Label>
                <Input className="min-h-[44px]" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} placeholder="0.00" type="number" min="0" step="0.01" />
              </div>
            ) : null}
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button className="min-h-[44px]" variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button className="min-h-[44px]" onClick={() => void save()} disabled={saving || !form.name || !form.employee_id}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
