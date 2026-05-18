import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordAuditPanel from "../components/RecordAuditPanel";
import StatusBadge from "../components/StatusBadge";
import { GST_RATE, PO_STATUSES, formatCurrency, formatDate, formatDateForInput, getStageConfig } from "../lib/helpers";
import { ChevronRight, Plus, Trash2, Send, CheckCircle } from "lucide-react";

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const [po, setPO] = useState(null);
  const [items, setItems] = useState([]);
  const [showItem, setShowItem] = useState(false);
  const [itemForm, setItemForm] = useState({ description: "", quantity: 1, unit: "ea", unit_price: 0 });

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    const [all, i] = await Promise.all([
      crmApi.entities.PurchaseOrder.list().then(all => all.find(x => x.id === id)),
      crmApi.entities.POItem.filter({ po_id: id }),
    ]);
    setPO(all); setItems(i.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)));
  };

  const recalc = async (lineItems) => {
    const subtotal = lineItems.reduce((s, i) => s + (i.total || 0), 0);
    const gst = Math.round(subtotal * GST_RATE * 100) / 100;
    await crmApi.entities.PurchaseOrder.update(id, { subtotal, gst, total: subtotal + gst });
  };

  const addItem = async () => {
    const total = itemForm.unit_price * itemForm.quantity;
    await crmApi.entities.POItem.create({ ...itemForm, total, po_id: id, sort_order: items.length });
    const updated = await crmApi.entities.POItem.filter({ po_id: id });
    await recalc(updated); loadData();
    setShowItem(false);
    setItemForm({ description: "", quantity: 1, unit: "ea", unit_price: 0 });
  };

  const deleteItem = async (itemId) => {
    await crmApi.entities.POItem.delete(itemId);
    const updated = await crmApi.entities.POItem.filter({ po_id: id });
    await recalc(updated); loadData();
  };

  if (!po) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const sc = getStageConfig(PO_STATUSES, po.status);

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/purchasing" className="hover:text-foreground">Purchasing</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{po.po_number}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold">{po.po_number}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
          </div>
          <p className="text-sm text-muted-foreground">{po.supplier_name}{po.job_title && ` · ${po.job_number} ${po.job_title}`}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {po.status === "draft" && <Button variant="outline" size="sm" onClick={() => crmApi.entities.PurchaseOrder.update(id, { status: "sent" }).then(loadData)}><Send className="w-3.5 h-3.5 mr-1" />Mark Sent</Button>}
          {["sent","part_received"].includes(po.status) && <Button size="sm" onClick={() => crmApi.entities.PurchaseOrder.update(id, { status: "received", received_date: formatDateForInput(new Date()) }).then(loadData)}><CheckCircle className="w-3.5 h-3.5 mr-1" />Mark Received</Button>}
          <Select value={po.status} onValueChange={v => crmApi.entities.PurchaseOrder.update(id, { status: v }).then(loadData)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{PO_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Subtotal</p><p className="text-lg font-bold">{formatCurrency(po.subtotal)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">GST</p><p className="text-lg font-bold">{formatCurrency(po.gst)}</p></Card>
        <Card className="p-4 text-center bg-primary/5"><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold text-primary">{formatCurrency(po.total)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Expected</p><p className="text-sm font-semibold mt-0.5">{formatDate(po.expected_date)}</p></Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">Line Items</h2>
          <Button size="sm" onClick={() => setShowItem(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No items yet.</p>}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 py-3 px-4 border-b last:border-b-0 text-sm hover:bg-muted/20">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{item.description}</p>
                <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} × {formatCurrency(item.unit_price)}</p>
              </div>
              <span className="font-semibold w-20 text-right">{formatCurrency(item.total)}</span>
              <button onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-5">
        <RecordAuditPanel entityName="PurchaseOrder" recordId={id} title="Purchase Order Change History" limit={10} />
      </div>

      <Dialog open={showItem} onOpenChange={setShowItem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
            <DialogDescription>Enter the purchased item details and line total for this purchase order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Description *</Label><Input value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Qty</Label><Input type="number" value={itemForm.quantity} onChange={e => setItemForm({...itemForm, quantity: parseFloat(e.target.value)||1})} /></div>
              <div><Label>Unit</Label><Input value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})} /></div>
              <div><Label>Unit Price</Label><Input type="number" value={itemForm.unit_price} onChange={e => setItemForm({...itemForm, unit_price: parseFloat(e.target.value)||0})} /></div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg flex justify-between text-sm">
              <span className="text-muted-foreground">Line Total</span>
              <span className="font-bold">{formatCurrency(itemForm.unit_price * itemForm.quantity)}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowItem(false)}>Cancel</Button>
              <Button onClick={addItem} disabled={!itemForm.description}>Add Item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
