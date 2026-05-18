import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { QUOTE_STATUSES, formatCurrency, formatDate, getStageConfig, generateNumber } from "../lib/helpers";
import { Plus, FileText, Search } from "lucide-react";

export default function Quotes() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ title: "", site_address: "" });

  useEffect(() => {
    crmApi.entities.Quote.list("-created_date", 200).then(setQuotes).finally(() => setLoading(false));
  }, []);

  const createQuote = async () => {
    const q = await crmApi.entities.Quote.create({
      ...form,
      quote_number: generateNumber("QTE", quotes.length),
      status: "draft",
    });
    setShowCreate(false);
    navigate(`/quotes/${q.id}`);
  };

  const filtered = quotes.filter(q =>
    `${q.title} ${q.quote_number} ${q.contact_name} ${q.company_name}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Quotes" subtitle={`${quotes.length} quotes · ${formatCurrency(quotes.reduce((s, q) => s + (q.total || 0), 0))} total`}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New Quote</Button>}
      />
      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search quotes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Quote #</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Title</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Client</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
              <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Created</th>
            </tr></thead>
            <tbody>
              {filtered.map(q => {
                const sc = getStageConfig(QUOTE_STATUSES, q.status);
                return (
                  <tr key={q.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/quotes/${q.id}`)}>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{q.quote_number}</td>
                    <td className="py-3 px-4 font-medium">{q.title}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{q.contact_name || q.company_name || "—"}</td>
                    <td className="py-3 px-4"><StatusBadge label={sc.label} color={sc.color} /></td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(q.total)}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(q.created_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={FileText} title="No quotes yet" description="Create a quote from a lead or directly" actionLabel="New Quote" onAction={() => setShowCreate(true)} />}
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Quote</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Kitchen cabinetry – Smith" /></div>
            <div><Label>Client Name</Label><Input value={form.contact_name || ""} onChange={e => setForm({...form, contact_name: e.target.value})} /></div>
            <div><Label>Site Address</Label><Input value={form.site_address} onChange={e => setForm({...form, site_address: e.target.value})} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createQuote} disabled={!form.title}>Create Quote</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}