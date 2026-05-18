import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { ensureSupplierCompaniesSynced } from "../lib/suppliers";
import { toast } from "@/components/ui/use-toast";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useSortableRows } from "@/lib/tableSorting";
import { Plus, Truck, Search } from "lucide-react";

const CAT_COLORS = { board_supplier:"blue", hardware:"amber", stone:"purple", glass:"cyan", paint_finish:"pink", edging:"teal", general:"slate", subcontractor:"orange" };
const SUPPLIER_SORT_COLUMNS = {
  name: { accessor: (supplier) => supplier.name, type: "text" },
  status: { accessor: (supplier) => supplier.status || "active", type: "status" },
  category: { accessor: (supplier) => supplier.category || supplier.type, type: "text" },
  contact: { accessor: (supplier) => supplier.contact_name, type: "text" },
  phone: { accessor: (supplier) => supplier.phone, type: "text" },
  terms: { accessor: (supplier) => supplier.payment_terms, type: "text" },
};

export default function Suppliers() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "supplier", category: "general", payment_terms: "30_days" });

  const loadSuppliers = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const nextSuppliers = await ensureSupplierCompaniesSynced();
      setSuppliers(Array.isArray(nextSuppliers) ? nextSuppliers : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Suppliers could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  const createSupplier = async () => {
    setSubmitting(true);
    try {
      const createdSupplier = await crmApi.entities.Company.create({
        name: String(form.name || "").trim(),
        type: form.type || "supplier",
        category: String(form.category || "").trim() || "general",
        payment_terms: String(form.payment_terms || "").trim() || "30_days",
        contact_name: String(form.contact_name || "").trim(),
        phone: String(form.phone || "").trim(),
        email: String(form.email || "").trim(),
        status: "active",
      });
      setShowCreate(false);
      setForm({ name: "", type: "supplier", category: "general", payment_terms: "30_days" });
      await loadSuppliers();
      navigate(`/suppliers/${createdSupplier.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Supplier could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(
    () =>
      suppliers.filter((supplier) => {
        const normalizedStatus = String(supplier.status || "active").toLowerCase();
        const matchesStatus = statusFilter === "all" || normalizedStatus === statusFilter;
        const matchesSearch = `${supplier.name} ${supplier.contact_name} ${supplier.email} ${supplier.phone}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesStatus && matchesSearch;
      }),
    [search, statusFilter, suppliers]
  );
  const { sortedRows: sortedSuppliers, sortState, requestSort } = useSortableRows(filtered, SUPPLIER_SORT_COLUMNS);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Suppliers" subtitle={`${suppliers.length} suppliers`}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />Add Supplier</Button>}
      />
      {loadError ? (
        <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadSuppliers()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <SortableHeader columnKey="name" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground">Name</SortableHeader>
              <SortableHeader columnKey="status" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground">Status</SortableHeader>
              <SortableHeader columnKey="category" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground">Category</SortableHeader>
              <SortableHeader columnKey="contact" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Contact</SortableHeader>
              <SortableHeader columnKey="phone" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Phone</SortableHeader>
              <SortableHeader columnKey="terms" sortState={sortState} onSort={requestSort} className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Terms</SortableHeader>
            </tr></thead>
            <tbody>
              {sortedSuppliers.map(s => (
                <tr key={s.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/suppliers/${s.id}`)}>
                  <td className="py-3 px-4 font-medium">{s.name}</td>
                  <td className="py-3 px-4"><StatusBadge label={String(s.status || "active").replace(/_/g," ")} color={String(s.status || "active").toLowerCase() === "archived" ? "slate" : "green"} /></td>
                  <td className="py-3 px-4"><StatusBadge label={(s.category || s.type)?.replace(/_/g," ")||"general"} color={CAT_COLORS[s.category]||"slate"} /></td>
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
          <DialogHeader>
            <DialogTitle>New Supplier</DialogTitle>
            <DialogDescription>Create a supplier company record for supplier-linked pricing and quote costing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="supplier-name">Name *</Label><Input id="supplier-name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="supplier-type">Type</Label>
                <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                  <SelectTrigger id="supplier-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">Supplier</SelectItem>
                    <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="supplier-category">Category</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger id="supplier-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{["board_supplier","hardware","stone","glass","paint_finish","edging","general","subcontractor","other"].map(c => <SelectItem key={c} value={c}>{c.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label htmlFor="supplier-payment-terms">Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={v => setForm({...form, payment_terms: v})}>
                  <SelectTrigger id="supplier-payment-terms"><SelectValue /></SelectTrigger>
                  <SelectContent>{["COD","7_days","14_days","30_days","60_days"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="supplier-contact-name">Contact Person</Label><Input id="supplier-contact-name" value={form.contact_name||""} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
              <div><Label htmlFor="supplier-phone">Phone</Label><Input id="supplier-phone" value={form.phone||""} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            </div>
            <div><Label htmlFor="supplier-email">Email</Label><Input id="supplier-email" value={form.email||""} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={createSupplier} disabled={submitting || !form.name}>Add Supplier</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
