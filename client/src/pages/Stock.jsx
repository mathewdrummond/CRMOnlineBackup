import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useModules } from "@/lib/ModuleContext";
import { formatCurrency, formatDate } from "@/lib/helpers";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  PackagePlus,
  Search,
  ShoppingCart,
  Warehouse,
} from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  { value: "sheet", label: "Sheet materials" },
  { value: "hardware", label: "Hardware" },
  { value: "edgebanding", label: "Edgebanding" },
  { value: "consumable", label: "Consumables" },
  { value: "component", label: "Purchased components" },
  { value: "offcut", label: "Offcuts / remnants" },
];

function formatQty(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function categoryLabel(value) {
  const match = CATEGORY_OPTIONS.find((option) => option.value === value);
  return match?.label || value || "Unknown";
}

function movementBadge(transactionType) {
  const normalized = String(transactionType || "").toLowerCase();
  if (["received", "returned", "adjustment_up"].includes(normalized)) {
    return { label: normalized.replace("_", " "), color: "green" };
  }
  if (["issued", "adjustment_down", "writeoff", "consumed"].includes(normalized)) {
    return { label: normalized.replace("_", " "), color: "red" };
  }
  if (["allocated", "unallocated"].includes(normalized)) {
    return { label: normalized.replace("_", " "), color: "amber" };
  }
  return { label: normalized.replace("_", " "), color: "slate" };
}

function defaultItemForm() {
  return {
    name: "",
    code: "",
    category: "sheet",
    unit: "sheet",
    stock_unit: "sheet",
    issue_unit: "sheet",
    purchase_unit: "sheet",
    preferred_supplier_id: "none",
    location_id: "none",
    reorder_point: 0,
    target_stock_level: 0,
    lead_time_days: 0,
    average_cost: 0,
    last_purchase_price: 0,
    notes: "",
  };
}

function defaultQuantityForm(item = null) {
  return {
    stock_item_id: item?.id || "",
    quantity: 1,
    job_id: "none",
    note: "",
    expected_date: "",
    transaction_type: "adjustment_up",
    reason_code: "",
  };
}

export default function Stock() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { isModuleEnabled } = useModules();
  const suppliersEnabled = isModuleEnabled("suppliers");
  const purchasingEnabled = isModuleEnabled("purchasing");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dashboard, setDashboard] = useState(null);
  const [items, setItems] = useState([]);
  const [shortages, setShortages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showAllocate, setShowAllocate] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemForm, setItemForm] = useState(defaultItemForm());
  const [quantityForm, setQuantityForm] = useState(defaultQuantityForm());
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [stockDashboard, stockItems, stockShortages, stockTransactions, stockLocations, supplierCompanies, allJobs] = await Promise.all([
        crmApi.stock.getDashboard(),
        crmApi.stock.listItems(),
        crmApi.stock.listShortages(),
        crmApi.stock.listTransactions(50),
        crmApi.entities.StockLocation.list("name", 200),
        suppliersEnabled ? crmApi.entities.Company.filter({ type: "supplier" }, "name", 200) : Promise.resolve([]),
        crmApi.entities.Job.list("-updated_date", 200),
      ]);
      setDashboard(stockDashboard);
      setItems(stockItems);
      setShortages(stockShortages);
      setTransactions(stockTransactions);
      setLocations(stockLocations);
      setSuppliers(supplierCompanies);
      setJobs(allJobs);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Stock could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [suppliersEnabled]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || `${item.name || ""} ${item.code || ""} ${item.supplier_name || ""} ${item.location_name || ""}`.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesLocation = locationFilter === "all" || item.location_id === locationFilter;
      const matchesStockFilter =
        stockFilter === "all"
          || (stockFilter === "low" && item.low_stock)
          || (stockFilter === "allocated" && Number(item.allocated || 0) > 0)
          || (stockFilter === "on_order" && Number(item.on_order || 0) > 0)
          || (stockFilter === "inactive" && item.is_active === false);

      return matchesSearch && matchesCategory && matchesLocation && matchesStockFilter;
    });
  }, [categoryFilter, items, locationFilter, search, stockFilter]);

  const openQuantityDialog = (kind, item) => {
    setSelectedItem(item);
    setQuantityForm(defaultQuantityForm(item));
    if (kind === "receive") {
      setShowReceive(true);
    } else if (kind === "allocate") {
      setShowAllocate(true);
    } else if (kind === "issue") {
      setShowIssue(true);
    } else if (kind === "adjust") {
      setShowAdjust(true);
    } else if (kind === "order") {
      setShowOrder(true);
    }
  };

  const handleCreateItem = async () => {
    setSubmitting(true);
    try {
      await crmApi.stock.createItem({
        ...itemForm,
        preferred_supplier_id: itemForm.preferred_supplier_id === "none" ? "" : itemForm.preferred_supplier_id,
        location_id: itemForm.location_id === "none" ? "" : itemForm.location_id,
      });
      toast({
        title: "Stock item created",
        description: "The item is now ready for receiving, allocation, and purchasing.",
      });
      setShowCreate(false);
      setItemForm(defaultItemForm());
      await loadData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Stock item could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMovement = async (kind) => {
    if (!selectedItem) {
      return;
    }

    if (["allocate", "issue", "order"].includes(kind) && quantityForm.job_id === "none") {
      toast({
        variant: "destructive",
        title: "Job required",
        description: "Select the job this stock should be reserved, issued, or ordered for.",
      });
      return;
    }

    const payload = {
      stock_item_id: selectedItem.id,
      quantity: Number(quantityForm.quantity || 0),
      job_id: quantityForm.job_id === "none" ? "" : quantityForm.job_id,
      note: quantityForm.note,
    };

    setSubmitting(true);
    try {
      if (kind === "receive") {
        await crmApi.stock.receive(payload);
      } else if (kind === "allocate") {
        await crmApi.stock.allocate(payload);
      } else if (kind === "issue") {
        await crmApi.stock.issue(payload);
      } else if (kind === "adjust") {
        await crmApi.stock.adjust({
          stock_item_id: selectedItem.id,
          quantity: Number(quantityForm.quantity || 0),
          transaction_type: quantityForm.transaction_type,
          reason_code: quantityForm.reason_code,
          note: quantityForm.note,
        });
      } else if (kind === "order") {
        await crmApi.stock.createPurchaseOrder({
          stock_item_id: selectedItem.id,
          quantity: Number(quantityForm.quantity || 0),
          linked_job_id: quantityForm.job_id === "none" ? "" : quantityForm.job_id,
          expected_date: quantityForm.expected_date,
          note: quantityForm.note,
        });
      }

      toast({
        title:
          kind === "receive"
            ? "Stock received"
            : kind === "allocate"
              ? "Stock allocated"
              : kind === "issue"
                ? "Stock issued"
                : kind === "order"
                  ? "Purchase order created"
                  : "Stock adjusted",
        description: `${selectedItem.name} has been updated.`,
      });

      setShowReceive(false);
      setShowAllocate(false);
      setShowIssue(false);
      setShowAdjust(false);
      setShowOrder(false);
      setSelectedItem(null);
      setQuantityForm(defaultQuantityForm());
      await loadData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Stock movement failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <PageHeader
        title="Stock"
        subtitle={`${dashboard?.counts?.items || 0} items · ${formatCurrency(dashboard?.valuation?.stock_value || 0)} on hand value`}
        actions={
          isAdmin ? (
            <Button className="min-h-[40px]" onClick={() => setShowCreate(true)}>
              <PackagePlus className="w-4 h-4 mr-2" />
              New Item
            </Button>
          ) : null
        }
      />
      {loadError ? (
        <Alert className="mb-6 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void loadData()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Items</p>
          <p className="mt-2 text-2xl font-semibold">{dashboard?.counts?.items || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Low Stock</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{dashboard?.counts?.low_stock || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Job Shortages</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{dashboard?.counts?.shortages || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">On Order</p>
          <p className="mt-2 text-2xl font-semibold">{dashboard?.counts?.on_order_items || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Overdue POs</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{dashboard?.counts?.overdue_purchase_orders || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Stock Value</p>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(dashboard?.valuation?.stock_value || 0)}</p>
        </Card>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="dashboard" className="min-h-[42px] rounded-md border bg-background px-4">Dashboard</TabsTrigger>
          <TabsTrigger value="items" className="min-h-[42px] rounded-md border bg-background px-4">Items</TabsTrigger>
          <TabsTrigger value="shortages" className="min-h-[42px] rounded-md border bg-background px-4">Shortages</TabsTrigger>
          <TabsTrigger value="transactions" className="min-h-[42px] rounded-md border bg-background px-4">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold">Shortages Affecting Jobs</h2>
                  <p className="text-sm text-muted-foreground">Items that are short against planned work.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/stock")}>Open stock</Button>
              </div>
              <div className="space-y-3">
                {shortages.slice(0, 6).map((row) => (
                  <div key={row.requirement?.id || `${row.job?.id}-${row.item?.id}`} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">{row.item?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {row.job?.job_number} · {row.job?.title}
                        </p>
                      </div>
                      <StatusBadge label={`${formatQty(row.shortage_quantity)} short`} color="red" />
                    </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/stock/${row.item?.id}`)}>View item</Button>
                        {isAdmin && purchasingEnabled ? <Button size="sm" onClick={() => openQuantityDialog("order", row.item)}>Create PO</Button> : null}
                      </div>
                  </div>
                ))}
                {shortages.length === 0 && (
                  <EmptyState
                    icon={ClipboardList}
                    title="No active shortages"
                    description="Planned job materials are currently covered by stock, allocations, or purchase orders."
                  />
                )}
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h2 className="font-semibold">Low Stock</h2>
                </div>
                <div className="space-y-3">
                  {dashboard?.low_stock_items?.slice(0, 6).map((item) => (
                    <Link key={item.id} to={`/stock/${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border p-3 hover:bg-muted/30">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {formatQty(item.available)} available · reorder at {formatQty(item.reorder_point)}
                        </p>
                      </div>
                      <StatusBadge label={item.low_stock ? "Low" : "OK"} color={item.low_stock ? "amber" : "green"} />
                    </Link>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Boxes className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold">Stock by Category</h2>
                </div>
                <div className="space-y-3">
                  {dashboard?.stock_by_category?.map((row) => (
                    <div key={row.key} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{row.label}</p>
                        <p className="text-sm text-muted-foreground">{row.items} items</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        On hand {formatQty(row.on_hand)} · Allocated {formatQty(row.allocated)} · Available {formatQty(row.available)} · On order {formatQty(row.on_order)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 pl-9" placeholder="Search stock items..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 w-full sm:w-52">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-10 w-full sm:w-52">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="h-10 w-full sm:w-52">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="allocated">Allocated</SelectItem>
                <SelectItem value="on_order">On order</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">On Hand</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Allocated</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Available</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">On Order</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-b align-top">
                      <td className="px-4 py-4">
                        <button type="button" className="text-left hover:text-primary" onClick={() => navigate(`/stock/${item.id}`)}>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.code || "No code"} · {item.supplier_name || "No supplier"}</p>
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge label={categoryLabel(item.category)} color={item.low_stock ? "amber" : "slate"} />
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{item.location_name || "Unassigned"}</td>
                      <td className="px-4 py-4 text-right font-medium">{formatQty(item.on_hand)}</td>
                      <td className="px-4 py-4 text-right font-medium">{formatQty(item.allocated)}</td>
                      <td className="px-4 py-4 text-right font-medium">{formatQty(item.available)}</td>
                      <td className="px-4 py-4 text-right font-medium">{formatQty(item.on_order)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openQuantityDialog("receive", item)}>Receive</Button>
                          <Button size="sm" variant="outline" onClick={() => openQuantityDialog("allocate", item)}>Allocate</Button>
                          <Button size="sm" onClick={() => openQuantityDialog("issue", item)}>Issue</Button>
                          {isAdmin && purchasingEnabled ? <Button size="sm" variant="outline" onClick={() => openQuantityDialog("order", item)}>PO</Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredItems.length === 0 && (
              <EmptyState
                icon={Warehouse}
                title="No stock items"
                description="Try broadening the filters or create the first stock item."
                actionLabel={isAdmin ? "New Item" : undefined}
                onAction={isAdmin ? () => setShowCreate(true) : undefined}
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="shortages">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Required</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Allocated</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">On Order</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Short</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shortages.map((row) => (
                    <tr key={row.requirement?.id || `${row.job?.id}-${row.item?.id}`} className="border-b">
                      <td className="px-4 py-4">
                        <p className="font-medium">{row.job?.job_number}</p>
                        <p className="text-xs text-muted-foreground">{row.job?.title}</p>
                      </td>
                      <td className="px-4 py-4">
                        <button type="button" className="text-left hover:text-primary" onClick={() => navigate(`/stock/${row.item?.id}`)}>
                          <p className="font-medium">{row.item?.name}</p>
                          <p className="text-xs text-muted-foreground">{row.item?.code}</p>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-right">{formatQty(row.required_quantity)}</td>
                      <td className="px-4 py-4 text-right">{formatQty(row.open_allocated_quantity)}</td>
                      <td className="px-4 py-4 text-right">{formatQty(row.on_order_quantity)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-red-600">{formatQty(row.shortage_quantity)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openQuantityDialog("allocate", row.item)}>Allocate</Button>
                          {isAdmin && purchasingEnabled ? <Button size="sm" onClick={() => openQuantityDialog("order", row.item)}>Order</Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shortages.length === 0 && (
              <EmptyState
                icon={AlertTriangle}
                title="No shortages"
                description="Nothing currently needs ordering or reallocation for planned jobs."
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Item</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Movement</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Job / PO</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => {
                    const badge = movementBadge(transaction.transaction_type);
                    return (
                      <tr key={transaction.id} className="border-b">
                        <td className="px-4 py-4 text-muted-foreground">{formatDate(transaction.created_date)}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium">{transaction.stock_item_name}</p>
                          <p className="text-xs text-muted-foreground">{transaction.stock_item_code}</p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge label={badge.label} color={badge.color} />
                        </td>
                        <td className="px-4 py-4 text-right">{formatQty(transaction.quantity)} {transaction.unit || ""}</td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {transaction.job_number ? `${transaction.job_number} · ${transaction.job_title}` : transaction.po_number || "—"}
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">{transaction.note || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {transactions.length === 0 && (
              <EmptyState
                icon={ShoppingCart}
                title="No stock history yet"
                description="Receiving, issuing, allocating, and adjusting stock will all appear here."
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Stock Item</DialogTitle>
            <DialogDescription>Define the stock item, units, supplier, location, and reorder thresholds.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Item name</Label>
              <Input value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Internal code</Label>
              <Input value={itemForm.code} onChange={(event) => setItemForm((current) => ({ ...current, code: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={itemForm.category} onValueChange={(value) => setItemForm((current) => ({ ...current, category: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base unit</Label>
              <Input value={itemForm.unit} onChange={(event) => setItemForm((current) => ({
                ...current,
                unit: event.target.value,
                purchase_unit: event.target.value,
                stock_unit: event.target.value,
                issue_unit: event.target.value,
              }))} />
            </div>
            {suppliersEnabled ? (
              <div className="space-y-2">
                <Label>Preferred supplier</Label>
                <Select value={itemForm.preferred_supplier_id} onValueChange={(value) => setItemForm((current) => ({ ...current, preferred_supplier_id: value }))}>
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
              <Select value={itemForm.location_id} onValueChange={(value) => setItemForm((current) => ({ ...current, location_id: value }))}>
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
              <Input type="number" value={itemForm.reorder_point} onChange={(event) => setItemForm((current) => ({ ...current, reorder_point: Number(event.target.value || 0) }))} />
            </div>
            <div className="space-y-2">
              <Label>Target stock level</Label>
              <Input type="number" value={itemForm.target_stock_level} onChange={(event) => setItemForm((current) => ({ ...current, target_stock_level: Number(event.target.value || 0) }))} />
            </div>
            <div className="space-y-2">
              <Label>Average cost</Label>
              <Input type="number" value={itemForm.average_cost} onChange={(event) => setItemForm((current) => ({ ...current, average_cost: Number(event.target.value || 0) }))} />
            </div>
            <div className="space-y-2">
              <Label>Last purchase price</Label>
              <Input type="number" value={itemForm.last_purchase_price} onChange={(event) => setItemForm((current) => ({ ...current, last_purchase_price: Number(event.target.value || 0) }))} />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateItem} disabled={submitting || !itemForm.name.trim()}>Create Item</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StockMovementDialog
        open={showReceive}
        title={`Receive ${selectedItem?.name || "Stock"}`}
        jobs={jobs}
        form={quantityForm}
        setForm={setQuantityForm}
        submitting={submitting}
        submitLabel="Receive Stock"
        onClose={() => setShowReceive(false)}
        onSubmit={() => handleMovement("receive")}
      />

      <StockMovementDialog
        open={showAllocate}
        title={`Allocate ${selectedItem?.name || "Stock"}`}
        jobs={jobs}
        showJob
        form={quantityForm}
        setForm={setQuantityForm}
        submitting={submitting}
        submitLabel="Allocate"
        onClose={() => setShowAllocate(false)}
        onSubmit={() => handleMovement("allocate")}
      />

      <StockMovementDialog
        open={showIssue}
        title={`Issue ${selectedItem?.name || "Stock"}`}
        jobs={jobs}
        showJob
        form={quantityForm}
        setForm={setQuantityForm}
        submitting={submitting}
        submitLabel="Issue to Job"
        onClose={() => setShowIssue(false)}
        onSubmit={() => handleMovement("issue")}
      />

      {purchasingEnabled ? (
        <StockMovementDialog
          open={showOrder}
          title={`Create PO for ${selectedItem?.name || "Stock"}`}
          jobs={jobs}
          showJob
          showExpectedDate
          form={quantityForm}
          setForm={setQuantityForm}
          submitting={submitting}
          submitLabel="Create Purchase Order"
          onClose={() => setShowOrder(false)}
          onSubmit={() => handleMovement("order")}
        />
      ) : null}

      <StockMovementDialog
        open={showAdjust}
        title={`Adjust ${selectedItem?.name || "Stock"}`}
        jobs={jobs}
        showAdjustmentFields
        form={quantityForm}
        setForm={setQuantityForm}
        submitting={submitting}
        submitLabel="Apply Adjustment"
        onClose={() => setShowAdjust(false)}
        onSubmit={() => handleMovement("adjust")}
      />
    </div>
  );
}

function StockMovementDialog({
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
          <DialogDescription>{getStockMovementDescription(submitLabel)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" min="0" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value || 0) }))} />
          </div>
          {showAdjustmentFields && (
            <>
              <div className="space-y-2">
                <Label>Adjustment type</Label>
                <Select value={form.transaction_type} onValueChange={(value) => setForm((current) => ({ ...current, transaction_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment_up">Adjustment up</SelectItem>
                    <SelectItem value="adjustment_down">Adjustment down</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason code</Label>
                <Input value={form.reason_code} onChange={(event) => setForm((current) => ({ ...current, reason_code: event.target.value }))} placeholder="Count variance, damage, write-off..." />
              </div>
            </>
          )}
          {showJob && (
            <div className="space-y-2">
              <Label>Job</Label>
              <Select value={form.job_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, job_id: value }))}>
                <SelectTrigger><SelectValue placeholder="No job selected" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No job</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>{job.job_number} · {job.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {showExpectedDate && (
            <div className="space-y-2">
              <Label>Expected date</Label>
              <Input type="date" value={form.expected_date} onChange={(event) => setForm((current) => ({ ...current, expected_date: event.target.value }))} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Note</Label>
            <Input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
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

function getStockMovementDescription(submitLabel) {
  if (submitLabel === "Receive Stock") {
    return "Record stock arriving into inventory and update available on-hand quantity.";
  }
  if (submitLabel === "Allocate") {
    return "Reserve stock against a job without removing it from on-hand inventory.";
  }
  if (submitLabel === "Issue to Job") {
    return "Issue stock to a job and reduce available on-hand quantity.";
  }
  if (submitLabel === "Create Purchase Order") {
    return "Create a purchase order for this stock item linked to the selected job.";
  }
  return "Apply a counted stock correction with an adjustment type, reason, and note.";
}
