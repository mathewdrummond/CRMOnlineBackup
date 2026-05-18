import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "../components/StatusBadge";
import { QUOTE_STATUSES, formatCurrency, getStageConfig, generateNumber } from "../lib/helpers";
import { ChevronRight, Plus, Trash2, Briefcase, Edit2, Send } from "lucide-react";

const CATS = ["labour","materials","hardware","subcontract","delivery","install","other"];

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [showItem, setShowItem] = useState(false);
  const [editingQuote, setEditingQuote] = useState(false);
  const [qForm, setQForm] = useState({});
  const [itemForm, setItemForm] = useState({ description: "", category: "materials", quantity: 1, unit: "ea", unit_cost: 0, markup_percent: 30, section: "General", is_optional: false });

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    const [q, i] = await Promise.all([
      crmApi.entities.Quote.list().then(all => all.find(x => x.id === id)),
      crmApi.entities.QuoteItem.filter({ quote_id: id }),
    ]);
    setQuote(q); setQForm(q || {}); setItems(i.sort((a,b) => (a.sort_order||0)-(b.sort_order||0)));
  };

  const recalc = async (lineItems) => {
    const subtotal = lineItems.filter(i => !i.is_optional).reduce((s, i) => s + (i.total || 0), 0);
    const gst = Math.round(subtotal * 10) / 100;
    await crmApi.entities.Quote.update(id, { subtotal, gst, total: subtotal + gst });
  };

  const addItem = async () => {
    const total = itemForm.unit_cost * itemForm.quantity * (1 + itemForm.markup_percent / 100);
    await crmApi.entities.QuoteItem.create({ ...itemForm, total, quote_id: id, sort_order: items.length });
    const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
    await recalc(updated); loadData();
    setShowItem(false);
    setItemForm({ description: "", category: "materials", quantity: 1, unit: "ea", unit_cost: 0, markup_percent: 30, section: "General", is_optional: false });
  };

  const deleteItem = async (itemId) => {
    await crmApi.entities.QuoteItem.delete(itemId);
    const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
    await recalc(updated); loadData();
  };

  const convertToJob = async () => {
    const jobs = await crmApi.entities.Job.list();
    const job = await crmApi.entities.Job.create({
      title: quote.title, job_number: generateNumber("JOB", jobs.length),
      quote_id: id, lead_id: quote.lead_id,
      contact_id: quote.contact_id, contact_name: quote.contact_name,
      company_id: quote.company_id, company_name: quote.company_name,
      quoted_value: quote.total, site_address: quote.site_address, status: "planning",
    });
    await crmApi.entities.Quote.update(id, { status: "accepted" });
    if (quote.lead_id) await crmApi.entities.Lead.update(quote.lead_id, { stage: "won" });
    navigate(`/jobs/${job.id}`);
  };

  if (!quote) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const sc = getStageConfig(QUOTE_STATUSES, quote.status);
  const sections = [...new Set(items.map(i => i.section || "General"))];
  const sellTotal = itemForm.unit_cost * itemForm.quantity * (1 + itemForm.markup_percent / 100);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link to="/quotes" className="hover:text-foreground">Quotes</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{quote.quote_number}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold">{quote.title}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
          </div>
          <p className="text-sm text-muted-foreground">{quote.quote_number} · Rev {quote.revision || 1}{quote.contact_name && ` · ${quote.contact_name}`}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setEditingQuote(true)}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          {quote.status === "draft" && <Button variant="outline" size="sm" onClick={() => crmApi.entities.Quote.update(id, { status: "sent" }).then(loadData)}><Send className="w-3.5 h-3.5 mr-1" />Mark Sent</Button>}
          {["sent","draft"].includes(quote.status) && <Button size="sm" onClick={convertToJob}><Briefcase className="w-3.5 h-3.5 mr-1" />Convert to Job</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Subtotal</p><p className="text-lg font-bold">{formatCurrency(quote.subtotal)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">GST</p><p className="text-lg font-bold">{formatCurrency(quote.gst)}</p></Card>
        <Card className="p-4 text-center bg-primary/5 border-primary/20"><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-bold text-primary">{formatCurrency(quote.total)}</p></Card>
        <Card className="p-4 text-center"><p className="text-xs text-muted-foreground">Items</p><p className="text-lg font-bold">{items.length}</p></Card>
      </div>

      <Card className="p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm">Line Items</h2>
          <Button size="sm" onClick={() => setShowItem(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
        </div>
        {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No items yet. Add items to build your quote.</p>}
        {sections.map(section => {
          const si = items.filter(i => (i.section || "General") === section);
          return (
            <div key={section} className="mb-4">
              <div className="flex justify-between py-2 px-3 bg-muted/50 rounded-t-lg">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section}</span>
                <span className="text-xs font-semibold">{formatCurrency(si.reduce((s,i)=>s+(i.total||0),0))}</span>
              </div>
              <div className="border border-t-0 rounded-b-lg overflow-hidden">
                {si.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2.5 px-3 border-b last:border-b-0 text-sm hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{item.description}</span>
                        {item.is_optional && <StatusBadge label="Optional" color="slate" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} × {formatCurrency(item.unit_cost)} + {item.markup_percent}%</p>
                    </div>
                    <StatusBadge label={item.category} color={item.category==="labour"?"blue":item.category==="materials"?"amber":"slate"} />
                    <span className="font-semibold w-20 text-right">{formatCurrency(item.total)}</span>
                    <button onClick={() => deleteItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Add item dialog */}
      <Dialog open={showItem} onOpenChange={setShowItem}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Description *</Label><Input value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={itemForm.category} onValueChange={v => setItemForm({...itemForm, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Section</Label><Input value={itemForm.section} onChange={e => setItemForm({...itemForm, section: e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div><Label>Qty</Label><Input type="number" value={itemForm.quantity} onChange={e => setItemForm({...itemForm, quantity: parseFloat(e.target.value)||1})} /></div>
              <div><Label>Unit</Label><Input value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})} /></div>
              <div><Label>Cost</Label><Input type="number" value={itemForm.unit_cost} onChange={e => setItemForm({...itemForm, unit_cost: parseFloat(e.target.value)||0})} /></div>
              <div><Label>Markup%</Label><Input type="number" value={itemForm.markup_percent} onChange={e => setItemForm({...itemForm, markup_percent: parseFloat(e.target.value)||0})} /></div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg flex justify-between text-sm">
              <span className="text-muted-foreground">Line Total</span>
              <span className="font-bold">{formatCurrency(sellTotal)}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowItem(false)}>Cancel</Button>
              <Button onClick={addItem} disabled={!itemForm.description}>Add Item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit quote dialog */}
      <Dialog open={editingQuote} onOpenChange={setEditingQuote}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Quote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={qForm.title||""} onChange={e => setQForm({...qForm, title: e.target.value})} /></div>
            <div><Label>Client Name</Label><Input value={qForm.contact_name||""} onChange={e => setQForm({...qForm, contact_name: e.target.value})} /></div>
            <div><Label>Site Address</Label><Input value={qForm.site_address||""} onChange={e => setQForm({...qForm, site_address: e.target.value})} /></div>
            <div><Label>Notes</Label><Textarea value={qForm.notes||""} onChange={e => setQForm({...qForm, notes: e.target.value})} rows={3} /></div>
            <div><Label>Exclusions</Label><Textarea value={qForm.exclusions||""} onChange={e => setQForm({...qForm, exclusions: e.target.value})} rows={2} /></div>
            <div><Label>Valid Until</Label><Input type="date" value={qForm.valid_until||""} onChange={e => setQForm({...qForm, valid_until: e.target.value})} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingQuote(false)}>Cancel</Button>
              <Button onClick={async () => { await crmApi.entities.Quote.update(id, qForm); setEditingQuote(false); loadData(); }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}