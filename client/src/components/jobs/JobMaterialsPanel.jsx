import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useModules } from "@/lib/ModuleContext";
import { formatCurrency } from "@/lib/helpers";
import { AlertTriangle, Boxes, ClipboardList, ShoppingCart } from "lucide-react";

function formatQty(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function emptyMaterialForm() {
  return {
    id: "",
    stock_item_id: "none",
    required_quantity: 1,
    note: "",
  };
}

function emptyMovementForm() {
  return {
    stock_item_id: "none",
    quantity: 1,
    note: "",
    expected_date: "",
  };
}

export default function JobMaterialsPanel({ job }) {
  const { isAdmin } = useAuth();
  const { isModuleEnabled } = useModules();
  const purchasingEnabled = isModuleEnabled("purchasing");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [showRequirement, setShowRequirement] = useState(false);
  const [showAllocate, setShowAllocate] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [materialForm, setMaterialForm] = useState(emptyMaterialForm());
  const [movementForm, setMovementForm] = useState(emptyMovementForm());
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [materialsSummary, items] = await Promise.all([
        crmApi.stock.getJobMaterials(job.id),
        crmApi.stock.listItems(),
      ]);
      setSummary(materialsSummary);
      setStockItems(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [job.id]);

  const saveRequirement = async () => {
    setSubmitting(true);
    try {
      await crmApi.stock.saveJobMaterial(job.id, {
        id: materialForm.id || undefined,
        stock_item_id: materialForm.stock_item_id === "none" ? "" : materialForm.stock_item_id,
        required_quantity: Number(materialForm.required_quantity || 0),
        note: materialForm.note,
      });
      toast({
        title: "Material requirement saved",
        description: "The job materials plan has been updated.",
      });
      setShowRequirement(false);
      setMaterialForm(emptyMaterialForm());
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const runMovement = async (kind) => {
    setSubmitting(true);
    try {
      const payload = {
        stock_item_id: movementForm.stock_item_id === "none" ? "" : movementForm.stock_item_id,
        quantity: Number(movementForm.quantity || 0),
        job_id: job.id,
        note: movementForm.note,
      };

      if (kind === "allocate") {
        await crmApi.stock.allocate(payload);
      } else if (kind === "issue") {
        await crmApi.stock.issue(payload);
      } else if (kind === "order") {
        await crmApi.stock.createPurchaseOrder({
          stock_item_id: payload.stock_item_id,
          quantity: payload.quantity,
          linked_job_id: job.id,
          note: payload.note,
          expected_date: movementForm.expected_date,
        });
      }

      toast({
        title: kind === "order" ? "Purchase order created" : "Materials updated",
        description: "The job stock position has been refreshed.",
      });

      setShowAllocate(false);
      setShowIssue(false);
      setShowOrder(false);
      setMovementForm(emptyMovementForm());
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const editRequirement = (row) => {
    setMaterialForm({
      id: row.requirement.id,
      stock_item_id: row.item.id,
      required_quantity: row.required_quantity,
      note: row.requirement.note || "",
    });
    setShowRequirement(true);
  };

  const deleteRequirement = async (row) => {
    await crmApi.stock.deleteJobMaterial(job.id, row.requirement.id);
    toast({
      title: "Requirement removed",
      description: "The job material row has been removed.",
    });
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Required</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(summary?.totals?.required_quantity || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(summary?.totals?.allocated_quantity || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Issued</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(summary?.totals?.issued_quantity || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">On Order</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(summary?.totals?.on_order_quantity || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Short</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{formatQty(summary?.totals?.shortage_quantity || 0)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowRequirement(true)}>
          <ClipboardList className="w-4 h-4 mr-2" />
          Add Material
        </Button>
        <Button variant="outline" onClick={() => setShowAllocate(true)}>
          <Boxes className="w-4 h-4 mr-2" />
          Allocate Stock
        </Button>
        <Button variant="outline" onClick={() => setShowIssue(true)}>
          <ShoppingCart className="w-4 h-4 mr-2" />
          Issue Stock
        </Button>
        {isAdmin && purchasingEnabled ? (
          <Button variant="outline" onClick={() => setShowOrder(true)}>
            <AlertTriangle className="w-4 h-4 mr-2" />
            Order Shortage
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Required</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Allocated</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Issued</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">On Order</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Short</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary?.requirements?.map((row) => (
                <tr key={row.requirement.id} className="border-b">
                  <td className="px-4 py-4">
                    <Link to={`/stock/${row.item.id}`} className="hover:text-primary">
                      <p className="font-medium">{row.item.name}</p>
                      <p className="text-xs text-muted-foreground">{row.item.code || "No code"} · {formatCurrency((row.required_quantity || 0) * Number(row.item.average_cost || row.item.cost_price || 0))}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-right">{formatQty(row.required_quantity)}</td>
                  <td className="px-4 py-4 text-right">{formatQty(row.open_allocated_quantity)}</td>
                  <td className="px-4 py-4 text-right">{formatQty(row.issued_quantity)}</td>
                  <td className="px-4 py-4 text-right">{formatQty(row.on_order_quantity)}</td>
                  <td className="px-4 py-4 text-right font-semibold text-red-600">{formatQty(row.shortage_quantity)}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setMovementForm({ ...emptyMovementForm(), stock_item_id: row.item.id, quantity: row.shortage_quantity || 1 });
                        setShowAllocate(true);
                      }}>
                        Allocate
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => editRequirement(row)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteRequirement(row)}>
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!summary?.requirements?.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No job materials planned yet.
          </div>
        ) : null}
      </Card>

      <Dialog open={showRequirement} onOpenChange={setShowRequirement}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{materialForm.id ? "Edit material requirement" : "Add material requirement"}</DialogTitle>
            <DialogDescription>Plan the stock item, required quantity, and note for this job material requirement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Stock item</Label>
              <Select value={materialForm.stock_item_id} onValueChange={(value) => setMaterialForm((current) => ({ ...current, stock_item_id: value }))}>
                <SelectTrigger><SelectValue placeholder="Select stock item" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select stock item</SelectItem>
                  {stockItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.code || item.name} · {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Required quantity</Label>
              <Input type="number" value={materialForm.required_quantity} onChange={(event) => setMaterialForm((current) => ({ ...current, required_quantity: Number(event.target.value || 0) }))} />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Input value={materialForm.note} onChange={(event) => setMaterialForm((current) => ({ ...current, note: event.target.value }))} />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setShowRequirement(false)}>Cancel</Button>
              <Button onClick={saveRequirement} disabled={submitting || materialForm.stock_item_id === "none"}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MovementDialog
        open={showAllocate}
        title="Allocate stock to job"
        items={stockItems}
        form={movementForm}
        setForm={setMovementForm}
        submitLabel="Allocate"
        onClose={() => setShowAllocate(false)}
        onSubmit={() => runMovement("allocate")}
        submitting={submitting}
      />
      <MovementDialog
        open={showIssue}
        title="Issue stock to job"
        items={stockItems}
        form={movementForm}
        setForm={setMovementForm}
        submitLabel="Issue"
        onClose={() => setShowIssue(false)}
        onSubmit={() => runMovement("issue")}
        submitting={submitting}
      />
      {purchasingEnabled ? (
        <MovementDialog
          open={showOrder}
          title="Create purchase order"
          items={stockItems}
          form={movementForm}
          setForm={setMovementForm}
          submitLabel="Create PO"
          onClose={() => setShowOrder(false)}
          onSubmit={() => runMovement("order")}
          submitting={submitting}
          showExpectedDate
        />
      ) : null}
    </div>
  );
}

function MovementDialog({
  open,
  title,
  items,
  form,
  setForm,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
  showExpectedDate = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{getJobMaterialMovementDescription(submitLabel)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Stock item</Label>
            <Select value={form.stock_item_id} onValueChange={(value) => setForm((current) => ({ ...current, stock_item_id: value }))}>
              <SelectTrigger><SelectValue placeholder="Select stock item" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select stock item</SelectItem>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.code || item.name} · {item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value || 0) }))} />
          </div>
          {showExpectedDate ? (
            <div className="space-y-2">
              <Label>Expected date</Label>
              <Input type="date" value={form.expected_date || ""} onChange={(event) => setForm((current) => ({ ...current, expected_date: event.target.value }))} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Note</Label>
            <Input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} disabled={submitting || form.stock_item_id === "none" || !(Number(form.quantity) > 0)}>{submitLabel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getJobMaterialMovementDescription(submitLabel) {
  if (submitLabel === "Issue") {
    return "Issue stock to this job and reduce available inventory.";
  }
  if (submitLabel === "Create PO") {
    return "Create a purchase order for this job material requirement.";
  }
  return "Reserve stock against this job material requirement.";
}
