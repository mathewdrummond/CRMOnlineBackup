import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useModules } from "@/lib/ModuleContext";
import { formatCurrency, formatDate } from "@/lib/helpers";
import { ChevronRight } from "lucide-react";

function formatQty(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function emptyMovementForm() {
  return {
    quantity: 1,
    job_id: "none",
    note: "",
    expected_date: "",
    transaction_type: "adjustment_up",
    reason_code: "",
  };
}

export default function StockItemDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { isModuleEnabled } = useModules();
  const suppliersEnabled = isModuleEnabled("suppliers");
  const purchasingEnabled = isModuleEnabled("purchasing");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showReceive, setShowReceive] = useState(false);
  const [showAllocate, setShowAllocate] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [movementForm, setMovementForm] = useState(emptyMovementForm());
  const [editForm, setEditForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemDetail, allJobs, stockLocations, supplierCompanies] = await Promise.all([
        crmApi.stock.getItem(id),
        crmApi.entities.Job.list("-updated_date", 200),
        crmApi.entities.StockLocation.list("name", 200),
        suppliersEnabled ? crmApi.entities.Company.filter({ type: "supplier" }, "name", 200) : Promise.resolve([]),
      ]);
      setDetail(itemDetail);
      setJobs(allJobs);
      setLocations(stockLocations);
      setSuppliers(supplierCompanies);
      setEditForm({
        ...itemDetail.item,
        preferred_supplier_id: itemDetail.item.preferred_supplier_id || itemDetail.item.supplier_id || "none",
        location_id: itemDetail.item.location_id || "none",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id, suppliersEnabled]);

  const runMovement = async (kind) => {
    if (["allocate", "issue", "order"].includes(kind) && movementForm.job_id === "none") {
      toast({
        variant: "destructive",
        title: "Job required",
        description: "Choose the job this stock movement should be linked to.",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (kind === "receive") {
        await crmApi.stock.receive({
          stock_item_id: id,
          quantity: Number(movementForm.quantity || 0),
          job_id: movementForm.job_id === "none" ? "" : movementForm.job_id,
          note: movementForm.note,
        });
      } else if (kind === "allocate") {
        await crmApi.stock.allocate({
          stock_item_id: id,
          quantity: Number(movementForm.quantity || 0),
          job_id: movementForm.job_id === "none" ? "" : movementForm.job_id,
          note: movementForm.note,
        });
      } else if (kind === "issue") {
        await crmApi.stock.issue({
          stock_item_id: id,
          quantity: Number(movementForm.quantity || 0),
          job_id: movementForm.job_id === "none" ? "" : movementForm.job_id,
          note: movementForm.note,
        });
      } else if (kind === "adjust") {
        await crmApi.stock.adjust({
          stock_item_id: id,
          quantity: Number(movementForm.quantity || 0),
          transaction_type: movementForm.transaction_type,
          reason_code: movementForm.reason_code,
          note: movementForm.note,
        });
      } else if (kind === "order") {
        await crmApi.stock.createPurchaseOrder({
          stock_item_id: id,
          quantity: Number(movementForm.quantity || 0),
          linked_job_id: movementForm.job_id === "none" ? "" : movementForm.job_id,
          expected_date: movementForm.expected_date,
          note: movementForm.note,
        });
      }

      toast({
        title: "Stock updated",
        description: "The item balances and history have been refreshed.",
      });
      setShowReceive(false);
      setShowAllocate(false);
      setShowIssue(false);
      setShowAdjust(false);
      setShowOrder(false);
      setMovementForm(emptyMovementForm());
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const saveItem = async () => {
    setSubmitting(true);
    try {
      await crmApi.stock.updateItem(id, {
        ...editForm,
        preferred_supplier_id: editForm.preferred_supplier_id === "none" ? "" : editForm.preferred_supplier_id,
        location_id: editForm.location_id === "none" ? "" : editForm.location_id,
      });
      toast({
        title: "Item updated",
        description: "Master settings and reorder details were saved.",
      });
      setShowEdit(false);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !detail) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const item = detail.item;

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/stock" className="hover:text-foreground">Stock</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-medium text-foreground">{item.name}</span>
      </div>

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{item.name}</h1>
            <StatusBadge label={item.category} color={item.low_stock ? "amber" : "slate"} />
            {item.low_stock ? <StatusBadge label="Low stock" color="amber" /> : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.code || "No stock code"} · {item.supplier_name || "No supplier"} · {item.location_name || "No location"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowReceive(true)}>Receive</Button>
          <Button variant="outline" onClick={() => setShowAllocate(true)}>Allocate</Button>
          <Button onClick={() => setShowIssue(true)}>Issue</Button>
          {isAdmin && purchasingEnabled ? <Button variant="outline" onClick={() => setShowOrder(true)}>Create PO</Button> : null}
          {isAdmin ? <Button variant="outline" onClick={() => setShowAdjust(true)}>Adjust</Button> : null}
          {isAdmin ? <Button variant="outline" onClick={() => setShowEdit(true)}>Edit</Button> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">On Hand</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(item.on_hand)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(item.allocated)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(item.available)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">On Order</p>
          <p className="mt-2 text-2xl font-semibold">{formatQty(item.on_order)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Value</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency((Number(item.on_hand || 0) * Number(item.average_cost || item.cost_price || 0)))}</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr] mb-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Master Record</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-medium">{item.category}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Unit</dt>
              <dd className="font-medium">{item.unit}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Purchase Unit</dt>
              <dd className="font-medium">{item.purchase_unit}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Issue Unit</dt>
              <dd className="font-medium">{item.issue_unit}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reorder Point</dt>
              <dd className="font-medium">{formatQty(item.reorder_point)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target Level</dt>
              <dd className="font-medium">{formatQty(item.target_stock_level)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Average Cost</dt>
              <dd className="font-medium">{formatCurrency(item.average_cost || 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last Purchase</dt>
              <dd className="font-medium">{formatCurrency(item.last_purchase_price || 0)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Lead Time</dt>
              <dd className="font-medium">{item.lead_time_days || 0} days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last Movement</dt>
              <dd className="font-medium">{formatDate(item.last_transaction_date)}</dd>
            </div>
          </dl>
          {item.notes ? (
            <div className="mt-4 rounded-xl border p-3 text-sm text-muted-foreground">
              {item.notes}
            </div>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Signals</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Open allocations</p>
              <p className="mt-2 text-2xl font-semibold">{detail.allocations.filter((allocation) => Number(allocation.open_quantity || 0) > 0).length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Jobs currently holding this stock in reserve.</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Open purchase lines</p>
              <p className="mt-2 text-2xl font-semibold">{detail.purchase_lines.filter((line) => Number(line.quantity || 0) > Number(line.received_qty || 0)).length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Outstanding supplier lines linked to this item.</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Job demand</p>
              <p className="mt-2 text-2xl font-semibold">{detail.requirements.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Jobs currently planning this material.</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Offcuts tracked</p>
              <p className="mt-2 text-2xl font-semibold">{detail.offcuts.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Recorded offcuts currently linked to this stock item.</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="allocations" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="allocations" className="min-h-[42px] rounded-md border bg-background px-4">Allocations</TabsTrigger>
          {purchasingEnabled ? <TabsTrigger value="purchase" className="min-h-[42px] rounded-md border bg-background px-4">Purchase</TabsTrigger> : null}
          <TabsTrigger value="requirements" className="min-h-[42px] rounded-md border bg-background px-4">Job Demand</TabsTrigger>
          <TabsTrigger value="transactions" className="min-h-[42px] rounded-md border bg-background px-4">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="allocations">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Allocated</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Issued</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Open</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.allocations.map((allocation) => (
                    <tr key={allocation.id} className="border-b">
                      <td className="px-4 py-4">
                        <p className="font-medium">{allocation.job_number}</p>
                        <p className="text-xs text-muted-foreground">{allocation.job_title}</p>
                      </td>
                      <td className="px-4 py-4 text-right">{formatQty(allocation.quantity_allocated)}</td>
                      <td className="px-4 py-4 text-right">{formatQty(allocation.quantity_issued)}</td>
                      <td className="px-4 py-4 text-right">{formatQty(allocation.open_quantity)}</td>
                      <td className="px-4 py-4"><StatusBadge label={allocation.status} color={allocation.open_quantity > 0 ? "amber" : "green"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.allocations.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">No allocations yet.</div>
            )}
          </Card>
        </TabsContent>

        {purchasingEnabled ? <TabsContent value="purchase">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">PO</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ordered</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Received</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Outstanding</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.purchase_lines.map((line) => (
                    <tr key={line.id} className="border-b">
                      <td className="px-4 py-4">
                        <p className="font-medium">{line.po_id}</p>
                        <p className="text-xs text-muted-foreground">{line.description}</p>
                      </td>
                      <td className="px-4 py-4 text-right">{formatQty(line.quantity)}</td>
                      <td className="px-4 py-4 text-right">{formatQty(line.received_qty)}</td>
                      <td className="px-4 py-4 text-right">{formatQty((Number(line.quantity || 0) - Number(line.received_qty || 0)))}</td>
                      <td className="px-4 py-4 text-muted-foreground">{line.linked_job_number || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.purchase_lines.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">No purchase history yet.</div>
            )}
          </Card>
        </TabsContent> : null}

        <TabsContent value="requirements">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Required</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.requirements.map((requirement) => (
                    <tr key={requirement.id} className="border-b">
                      <td className="px-4 py-4">
                        <p className="font-medium">{requirement.job_number}</p>
                        <p className="text-xs text-muted-foreground">{requirement.job_title}</p>
                      </td>
                      <td className="px-4 py-4 text-right">{formatQty(requirement.required_quantity)}</td>
                      <td className="px-4 py-4 text-muted-foreground">{requirement.source || "manual"}</td>
                      <td className="px-4 py-4"><StatusBadge label={requirement.status || "planned"} color="slate" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.requirements.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">No job material requirements yet.</div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Movement</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">PO</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b">
                      <td className="px-4 py-4 text-muted-foreground">{formatDate(transaction.created_date)}</td>
                      <td className="px-4 py-4"><StatusBadge label={transaction.transaction_type} color="slate" /></td>
                      <td className="px-4 py-4 text-right">{formatQty(transaction.quantity)} {transaction.unit || ""}</td>
                      <td className="px-4 py-4 text-muted-foreground">{transaction.job_number || "—"}</td>
                      <td className="px-4 py-4 text-muted-foreground">{transaction.po_number || "—"}</td>
                      <td className="px-4 py-4 text-muted-foreground">{transaction.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.transactions.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">No transactions yet.</div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <MovementDialog
        open={showReceive}
        title={`Receive ${item.name}`}
        jobs={jobs}
        form={movementForm}
        setForm={setMovementForm}
        submitLabel="Receive"
        onClose={() => setShowReceive(false)}
        onSubmit={() => runMovement("receive")}
        submitting={submitting}
      />
      <MovementDialog
        open={showAllocate}
        title={`Allocate ${item.name}`}
        jobs={jobs}
        form={movementForm}
        setForm={setMovementForm}
        submitLabel="Allocate"
        onClose={() => setShowAllocate(false)}
        onSubmit={() => runMovement("allocate")}
        submitting={submitting}
        showJob
      />
      <MovementDialog
        open={showIssue}
        title={`Issue ${item.name}`}
        jobs={jobs}
        form={movementForm}
        setForm={setMovementForm}
        submitLabel="Issue"
        onClose={() => setShowIssue(false)}
        onSubmit={() => runMovement("issue")}
        submitting={submitting}
        showJob
      />
      {purchasingEnabled ? (
        <MovementDialog
          open={showOrder}
          title={`Create PO for ${item.name}`}
          jobs={jobs}
          form={movementForm}
          setForm={setMovementForm}
          submitLabel="Create PO"
          onClose={() => setShowOrder(false)}
          onSubmit={() => runMovement("order")}
          submitting={submitting}
          showJob
          showExpectedDate
        />
      ) : null}
      <MovementDialog
        open={showAdjust}
        title={`Adjust ${item.name}`}
        jobs={jobs}
        form={movementForm}
        setForm={setMovementForm}
        submitLabel="Adjust"
        onClose={() => setShowAdjust(false)}
        onSubmit={() => runMovement("adjust")}
        submitting={submitting}
        showAdjustmentFields
      />

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Stock Item</DialogTitle>
            <DialogDescription>Update supplier, location, reorder thresholds, and costing details for this stock item.</DialogDescription>
          </DialogHeader>
          {editForm ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editForm.name || ""} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={editForm.code || ""} onChange={(event) => setEditForm((current) => ({ ...current, code: event.target.value }))} />
              </div>
              {suppliersEnabled ? (
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select value={editForm.preferred_supplier_id || "none"} onValueChange={(value) => setEditForm((current) => ({ ...current, preferred_supplier_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="No supplier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No supplier</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={editForm.location_id || "none"} onValueChange={(value) => setEditForm((current) => ({ ...current, location_id: value }))}>
                  <SelectTrigger><SelectValue placeholder="No location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No location</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reorder point</Label>
                <Input type="number" value={editForm.reorder_point || 0} onChange={(event) => setEditForm((current) => ({ ...current, reorder_point: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Target level</Label>
                <Input type="number" value={editForm.target_stock_level || 0} onChange={(event) => setEditForm((current) => ({ ...current, target_stock_level: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Average cost</Label>
                <Input type="number" value={editForm.average_cost || 0} onChange={(event) => setEditForm((current) => ({ ...current, average_cost: Number(event.target.value || 0) }))} />
              </div>
              <div className="space-y-2">
                <Label>Last purchase price</Label>
                <Input type="number" value={editForm.last_purchase_price || 0} onChange={(event) => setEditForm((current) => ({ ...current, last_purchase_price: Number(event.target.value || 0) }))} />
              </div>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={saveItem} disabled={submitting}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MovementDialog({
  open,
  title,
  jobs,
  form,
  setForm,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
  showJob = false,
  showExpectedDate = false,
  showAdjustmentFields = false,
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{getStockItemMovementDescription(submitLabel)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value || 0) }))} />
          </div>
          {showJob ? (
            <div className="space-y-2">
              <Label>Job</Label>
              <Select value={form.job_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, job_id: value }))}>
                <SelectTrigger><SelectValue placeholder="No job" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>{job.job_number} · {job.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showExpectedDate ? (
            <div className="space-y-2">
              <Label>Expected date</Label>
              <Input type="date" value={form.expected_date || ""} onChange={(event) => setForm((current) => ({ ...current, expected_date: event.target.value }))} />
            </div>
          ) : null}
          {showAdjustmentFields ? (
            <>
              <div className="space-y-2">
                <Label>Adjustment type</Label>
                <Select value={form.transaction_type || "adjustment_up"} onValueChange={(value) => setForm((current) => ({ ...current, transaction_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment_up">Adjustment up</SelectItem>
                    <SelectItem value="adjustment_down">Adjustment down</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason code</Label>
                <Input value={form.reason_code || ""} onChange={(event) => setForm((current) => ({ ...current, reason_code: event.target.value }))} />
              </div>
            </>
          ) : null}
          <div className="space-y-2">
            <Label>Note</Label>
            <Input value={form.note || ""} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} disabled={submitting || !(Number(form.quantity) > 0)}>{submitLabel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getStockItemMovementDescription(submitLabel) {
  if (submitLabel === "Receive") {
    return "Record stock arriving into inventory and update this item quantity.";
  }
  if (submitLabel === "Issue") {
    return "Issue this stock item to a job and reduce available quantity.";
  }
  if (submitLabel === "Create PO") {
    return "Create a purchase order for this item with the selected job and expected date.";
  }
  return "Adjust this stock item with a counted quantity correction and reason.";
}
