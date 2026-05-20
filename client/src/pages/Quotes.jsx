import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PageHeader from "../components/PageHeader";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { QUOTE_STATUSES, formatCurrency, formatDate, generateNumber, getStageConfig } from "../lib/helpers";
import { getQuoteOperationalSummary, isOpenQuote } from "../lib/crmOpsInsights";
import { SortableHeader } from "@/components/ui/sortable-header";
import { useSortableRows } from "@/lib/tableSorting";
import { FileText, Plus, Search } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

function getContactDisplayName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.full_name || contact.email || "Unnamed Contact";
}

const QUOTE_SORT_COLUMNS = {
  quote_number: { accessor: ({ quote }) => quote.quote_number, type: "text" },
  title: { accessor: ({ quote }) => quote.title, type: "text" },
  client: { accessor: ({ quote }) => quote.contact_name || quote.company_name, type: "text" },
  status: { accessor: ({ operational }) => operational.normalizedStatus, type: "status" },
  health: { accessor: ({ operational }) => operational.health.label, type: "status" },
  total: { accessor: ({ quote }) => quote.total, type: "currency" },
  valid_until: { accessor: ({ quote }) => quote.valid_until || quote.created_date, type: "date" },
};

function QuotePathRail({ steps }) {
  return (
    <section className="jf-reference-panel p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quote path</p>
          <h2 className="font-heading text-lg font-semibold text-foreground">Clear path from enquiry to send</h2>
        </div>
        <p className="text-sm text-muted-foreground">Create, price, review, then issue with confidence.</p>
      </div>
      <ol className="grid gap-2 md:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.title} className="relative rounded-lg border border-border/55 bg-white/65 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">{index + 1}</span>
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Quotes() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [form, setForm] = useState({ title: "", site_address: "", contact_id: "", valid_until: "" });

  const loadData = async () => {
    setLoadError("");
    const [quoteRecords, contactRecords] = await Promise.all([
      crmApi.entities.Quote.list("-created_date", 300),
      crmApi.entities.Contact.list("-created_date", 1000),
    ]);
    setQuotes(Array.isArray(quoteRecords) ? quoteRecords : []);
    setContacts(Array.isArray(contactRecords) ? contactRecords : []);
  };

  const reloadData = async () => {
    setLoading(true);
    try {
      await loadData();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Quotes could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadData();
  }, []);

  const createQuote = async () => {
    const selectedContact = contacts.find((contact) => contact.id === form.contact_id) || null;
    setSubmitting(true);
    try {
      const q = await crmApi.entities.Quote.create({
        ...form,
        title: String(form.title || "").trim(),
        quote_number: generateNumber("QTE", quotes.length),
        status: "draft",
        contact_id: selectedContact?.id,
        contact_name: selectedContact ? getContactDisplayName(selectedContact) : "",
        company_id: selectedContact?.company_id || "",
        company_name: selectedContact?.company_name || "",
        valid_until: String(form.valid_until || "").trim(),
      });
      setShowCreate(false);
      setForm({ title: "", site_address: "", contact_id: "", valid_until: "" });
      navigate(`/quotes/${q.id}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Quote could not be created",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const sortedContacts = [...contacts].sort((left, right) =>
    getContactDisplayName(left).localeCompare(getContactDisplayName(right), undefined, { sensitivity: "base", numeric: true })
  );

  const quoteRows = useMemo(
    () =>
      quotes.map((quote) => ({
        quote,
        operational: getQuoteOperationalSummary(quote),
      })),
    [quotes]
  );

  const filtered = useMemo(
    () =>
      quoteRows.filter(({ quote, operational }) => {
        const matchesSearch = `${quote.title} ${quote.quote_number} ${quote.quote_option_name || ""} ${quote.version_status || ""} ${quote.contact_name} ${quote.company_name}`.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || operational.normalizedStatus === statusFilter;
        const matchesHealth = healthFilter === "all" || operational.health.label.toLowerCase().replace(/\s+/g, "_") === healthFilter;
        return matchesSearch && matchesStatus && matchesHealth;
      }),
    [healthFilter, quoteRows, search, statusFilter]
  );
  const { sortedRows: sortedQuotes, sortState, requestSort } = useSortableRows(filtered, QUOTE_SORT_COLUMNS);

  const pipelineQuoteRows = quoteRows.filter(({ quote }) => quote.is_primary_version || String(quote.version_status || "") === "accepted" || !quote.quote_family_id);
  const openQuotes = pipelineQuoteRows.filter(({ quote }) => isOpenQuote(quote));
  const quotesAwaitingDecision = openQuotes.filter(({ operational }) => ["Awaiting decision", "Follow up", "Expiring soon", "Expired"].includes(operational.health.label));
  const readyToSendQuotes = openQuotes.filter(({ operational }) => operational.health.label === "Ready to send");
  const expiringQuotes = openQuotes.filter(({ operational }) => operational.daysUntilValid != null && operational.daysUntilValid >= 0 && operational.daysUntilValid <= 7);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="jf-reference-page">
      <PageHeader
        title="Quotes"
        subtitle={`${quotes.length} quotes · ${formatCurrency(pipelineQuoteRows.reduce((sum, { quote }) => sum + (quote.total || 0), 0))} active pipeline total`}
        actions={<Button size="sm" className="jf-reference-action" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New Quote</Button>}
      />
      {loadError ? (
        <Alert className="mb-4 border-destructive/30 bg-destructive/5 text-destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <Button type="button" variant="outline" onClick={() => void reloadData()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <QuotePathRail
        steps={[
          { title: "Create quote", detail: "Name the job and link the customer." },
          { title: "Add pricing", detail: "Import or enter the costing lines." },
          { title: "Review quote list", detail: "Check sections, totals, and anything marked for review." },
          { title: "Print or send", detail: "Generate the quote or contract when it is ready." },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Open Quotes", value: openQuotes.length, hint: "Quotes still in play" },
          { label: "Awaiting Decision", value: quotesAwaitingDecision.length, hint: "Commercial follow-up queue" },
          { label: "Ready To Send", value: readyToSendQuotes.length, hint: "Prepared but not yet issued" },
          { label: "Expiring 7 Days", value: expiringQuotes.length, hint: "Validity about to lapse" },
        ].map((metric) => (
          <Card key={metric.label} className="jf-reference-metric p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
            <p className="mt-2 font-heading text-3xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search quotes..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 rounded-full bg-white/70 pl-9 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-full min-w-[208px] rounded-md bg-white/70 sm:w-52"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {[...new Map(QUOTE_STATUSES.map((status) => [getQuoteOperationalSummary({ status: status.value }).normalizedStatus, status.label])).entries()].map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="h-9 w-full min-w-[208px] rounded-md bg-white/70 sm:w-52"><SelectValue placeholder="All health" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All health</SelectItem>
            {["expired", "follow_up", "expiring_soon", "ready_to_send", "awaiting_decision", "needs_progress", "draft", "won", "archived"].map((value) => (
              <SelectItem key={value} value={value}>
                {value.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="jf-reference-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/25">
                <SortableHeader columnKey="quote_number" sortState={sortState} onSort={requestSort} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quote #</SortableHeader>
                <SortableHeader columnKey="title" sortState={sortState} onSort={requestSort} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Title</SortableHeader>
                <SortableHeader columnKey="client" sortState={sortState} onSort={requestSort} className="hidden px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:table-cell">Client</SortableHeader>
                <SortableHeader columnKey="status" sortState={sortState} onSort={requestSort} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</SortableHeader>
                <SortableHeader columnKey="health" sortState={sortState} onSort={requestSort} className="hidden px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">Health</SortableHeader>
                <SortableHeader columnKey="total" sortState={sortState} onSort={requestSort} align="right" className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Total</SortableHeader>
                <SortableHeader columnKey="valid_until" sortState={sortState} onSort={requestSort} className="hidden px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:table-cell">Valid Until</SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sortedQuotes.map(({ quote, operational }) => {
                const sc = getStageConfig(QUOTE_STATUSES, operational.normalizedStatus);
                return (
                  <tr key={quote.id} className="cursor-pointer border-b border-border/45 hover:bg-muted/25" onClick={() => navigate(`/quotes/${quote.id}`)}>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{quote.quote_number}</td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <p className="font-medium">{quote.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {operational.ageDays != null ? `${operational.ageDays} day${operational.ageDays === 1 ? "" : "s"} old` : "Recently created"}
                        </p>
                        {(quote.quote_option_name || quote.quote_version_number > 1 || quote.is_archived_version) ? (
                          <div className="flex flex-wrap gap-1">
                            {quote.quote_option_name ? <StatusBadge label={quote.quote_option_name} color="blue" /> : null}
                            {quote.quote_version_number > 1 ? <StatusBadge label={`V${quote.quote_version_number}`} color="slate" /> : null}
                            {quote.is_primary_version ? <StatusBadge label="Primary" color="green" /> : null}
                            {quote.is_archived_version ? <StatusBadge label="Archived option" color="slate" /> : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{quote.contact_name || quote.company_name || "—"}</td>
                    <td className="py-3 px-4"><StatusBadge label={sc.label} color={sc.color} /></td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <div className="space-y-1">
                        <StatusBadge label={operational.health.label} color={operational.health.color} />
                        <p className="text-xs text-muted-foreground">{operational.health.reason}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold">{formatCurrency(quote.total)}</td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{formatDate(quote.valid_until || quote.created_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={FileText} title="No quotes found" description="Refine the filters or create a new quote" actionLabel="New Quote" onAction={() => setShowCreate(true)} />}
      </Card>

      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) {
          setForm({ title: "", site_address: "", contact_id: "", valid_until: "" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Quote</DialogTitle>
            <DialogDescription>Capture the quote basics before pricing, files, and document printing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              Start with the basics. Pricing, files, and document printing all happen after the quote is created.
            </div>
            <div><Label>Job Name *</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Smith kitchen cabinetry" /></div>
            <div>
              <Label>Client Name</Label>
              <Select value={form.contact_id || "__none"} onValueChange={(value) => setForm({ ...form, contact_id: value === "__none" ? "" : value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No contact selected</SelectItem>
                  {sortedContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {`${getContactDisplayName(contact)}${contact.company_name ? ` · ${contact.company_name}` : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Site Address</Label>
              <AddressAutocompleteInput
                value={form.site_address}
                onChange={(nextValue) => setForm({ ...form, site_address: nextValue })}
              />
            </div>
            <div>
              <Label>Valid Until</Label>
              <Input type="date" value={form.valid_until || ""} onChange={(event) => setForm({ ...form, valid_until: event.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={createQuote} disabled={submitting || !String(form.title || "").trim()}>Create Quote</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
