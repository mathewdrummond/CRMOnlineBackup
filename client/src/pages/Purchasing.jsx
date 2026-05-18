import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
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
import { useModules } from "@/lib/ModuleContext";
import { PO_STATUSES, formatCurrency, formatDate, formatDateForInput, getStageConfig, generateNumber } from "../lib/helpers";
import { toast } from "@/components/ui/use-toast";
import { ShoppingCart, Plus, Search, Filter } from "lucide-react";

export default function Purchasing() {
  const navigate = useNavigate();
  const { isModuleEnabled } = useModules();
  const suppliersEnabled = isModuleEnabled("suppliers");
  const [pos, setPOs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ supplier_id: "", supplier_name: "", job_id: "", job_number: "", job_title: "", expected_date: "" });

  const loadData = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [p, supplierCompanies, j] = await Promise.all([
        crmApi.entities.PurchaseOrder.list("-created_date", 200),
        suppliersEnabled ? ensureSupplierCompaniesSynced() : Promise.resolve([]),
        crmApi.entities.Job.list("-created_date", 100),
      ]);
      setPOs(Array.isArray(p) ? p : []);
      setSuppliers((Array.isArray(supplierCompanies) ? supplierCompanies : []).filter((company) => String(company.status || "active").toLowerCase() === "active"));
      setJobs(Array.isArray(j) ? j : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Purchase orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("job_id")) {
      setForm(f => ({ ...f, job_id: params.get("job_id"), job_number: params.get("job_number") || "", job_title: decodeURIComponent(params.get("job_title") || "") }));
      setShowCreate(true);
    }

    void loadData();
  }, [suppliersEnabled]);

  const createPO = async () => {
    setSubmitting(true);
    let supplierId = form.supplier_id;
    let supplierName = String(form.supplier_name || "").trim();

    try {
      if (suppliersEnabled && !supplierId && supplierName) {
        const createdSupplier = await crmApi.entities.Company.create({
          name: supplierName,
          type: "supplier",
          status: "active",
        });
        supplierId = createdSupplier.id;
        supplierName = createdSupplier.name;
      }

      const po = await crmApi.entities.PurchaseOrder.create({
        ...form,
        supplier_id: supplierId,
        supplier_name: supplierName,
        po_number: generateNumber("PO", pos.length),
        order_date: formatDateForInput(new Date()),
        status: "draft",
      });
      setShowCreate(false);
      setForm({ supplier_id: "", supplier_name: "", job_id: "", job_number: "", job_title: "", expected_date: "" });
      navigate(`/purchasing/${po.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Purchase order could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = pos.filter(p => {
    const matchSearch = `${p.po_number} ${p.supplier_name} ${p.job_title} ${p.job_number}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <PageHeader title="Purchasing" subtitle={`${pos.length} purchase orders · ${formatCurrency(pos.reduce((s,p)=>s+(p.total||0),0))} total`}
        actions={<Button size="sm" className="min-h-[40px]" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New PO</Button>}
      />
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
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)} className="h-10 pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 w-full min-w-[176px] sm:w-44"><Filter className="w-3.5 h-3.5 mr-1.5" /><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
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
                    <td className="py-3 px-4 font-medium">
                      {suppliersEnabled && po.supplier_id ? (
                        <Link to={`/suppliers/${po.supplier_id}`} className="hover:text-primary">
                          {po.supplier_name}
                        </Link>
                      ) : (
                        po.supplier_name
                      )}
                    </td>
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
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
            <DialogDescription>Choose the supplier, job link, and expected delivery date for this purchase order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>{suppliersEnabled ? "Supplier *" : "Supplier name *"}</Label>
              {suppliersEnabled ? (
                <>
                  <Select value={form.supplier_id} onValueChange={v => {
                    const s = suppliers.find(s => s.id === v);
                    setForm({...form, supplier_id: v, supplier_name: s?.name || ""});
                  }}>
                    <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                    <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                  {!form.supplier_id && <Input className="mt-2 min-h-[44px]" placeholder="Or type supplier name" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})} />}
                </>
              ) : (
                <Input className="min-h-[44px]" placeholder="Type supplier name" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value, supplier_id: ""})} />
              )}
            </div>
            <div><Label>Job (optional)</Label>
              <Select value={form.job_id || "none"} onValueChange={v => {
                if (v === "none") { setForm({...form, job_id: "", job_number: "", job_title: ""}); return; }
                const j = jobs.find(j => j.id === v);
                setForm({...form, job_id: v, job_number: j?.job_number || "", job_title: j?.title || ""});
              }}>
                <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="Link to job..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.job_number} – {j.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Expected Delivery</Label><Input className="min-h-[44px]" type="date" value={form.expected_date} onChange={e => setForm({...form, expected_date: e.target.value})} /></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button className="min-h-[44px]" variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>Cancel</Button>
              <Button className="min-h-[44px]" onClick={createPO} disabled={submitting || !form.supplier_name}>Create PO</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
