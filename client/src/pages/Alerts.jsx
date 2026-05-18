import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { useModules } from "@/lib/ModuleContext";
import { formatDate } from "../lib/helpers";
import { getJobOperationalSummary, getQuoteOperationalSummary, isActiveJob, isOpenQuote } from "../lib/crmOpsInsights";
import { AlertTriangle, Briefcase, CheckSquare, FileText, Target, Users } from "lucide-react";

function isPendingLeadTask(task) {
  return String(task.status || "").toLowerCase() !== "completed";
}

function isPendingContactTask(task) {
  return String(task.status || "").toLowerCase() !== "completed";
}

function parseDateValue(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export default function Alerts() {
  const { isModuleEnabled } = useModules();
  const contactsEnabled = isModuleEnabled("contacts");
  const leadsEnabled = isModuleEnabled("leads");
  const quotesEnabled = isModuleEnabled("quotes");
  const [leadTasks, setLeadTasks] = useState([]);
  const [jobOperations, setJobOperations] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [leads, setLeads] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [contactTasks, setContactTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");

  const loadData = async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [taskRecords, operationRecords, quoteRecords, leadRecords, jobRecords, contactRecords, contactTaskRecords] = await Promise.all([
      leadsEnabled ? crmApi.entities.LeadTask.list("-created_date") : Promise.resolve([]),
      crmApi.entities.JobOperation.list("-created_date"),
      quotesEnabled ? crmApi.entities.Quote.list("-created_date") : Promise.resolve([]),
      leadsEnabled ? crmApi.entities.Lead.list("-created_date") : Promise.resolve([]),
      crmApi.entities.Job.list("-created_date"),
      contactsEnabled ? crmApi.entities.Contact.list("-created_date") : Promise.resolve([]),
      contactsEnabled ? crmApi.entities.ContactTask.list("-created_date") : Promise.resolve([]),
      ]);
      setLeadTasks(Array.isArray(taskRecords) ? taskRecords : []);
      setJobOperations(Array.isArray(operationRecords) ? operationRecords : []);
      setQuotes(Array.isArray(quoteRecords) ? quoteRecords : []);
      setLeads(Array.isArray(leadRecords) ? leadRecords : []);
      setJobs(Array.isArray(jobRecords) ? jobRecords : []);
      setContacts(Array.isArray(contactRecords) ? contactRecords : []);
      setContactTasks(Array.isArray(contactTaskRecords) ? contactTaskRecords : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Attention Center could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [contactsEnabled, leadsEnabled, quotesEnabled]);

  useEffect(() => {
    const filterStillAvailable = filter === "all"
      || (filter === "contact" && contactsEnabled)
      || (filter === "lead" && leadsEnabled)
      || (filter === "quote" && quotesEnabled)
      || filter === "job";

    if (!filterStillAvailable) {
      setFilter("all");
    }
  }, [contactsEnabled, filter, leadsEnabled, quotesEnabled]);

  const leadLookup = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const contactLookup = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

  const pendingItems = useMemo(() => {
    const today = Date.now();

    const contactFollowUpItems = contacts
      .filter((contact) => {
        const dueTime = parseDateValue(contact.next_follow_up_date);
        return dueTime > 0 && dueTime < today && String(contact.status || "").toLowerCase() !== "archived";
      })
      .map((contact) => ({
        id: `contact-follow-up-${contact.id}`,
        type: "contact",
        title: [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact follow-up",
        subtitle: [contact.company_name, contact.owner].filter(Boolean).join(" · ") || "Contact follow-up overdue",
        date: contact.next_follow_up_date,
        href: `/contacts/${contact.id}`,
        badge: "follow up overdue",
        badgeColor: "red",
        icon: Users,
        priorityRank: 0,
      }));

    const contactTaskItems = contactTasks
      .filter((task) => isPendingContactTask(task) && parseDateValue(task.due_date) > 0 && parseDateValue(task.due_date) < today)
      .map((task) => {
        const contact = contactLookup.get(task.contact_id);
        return {
          id: `contact-task-${task.id}`,
          type: "contact",
          title: task.title || "Contact task overdue",
          subtitle: contact ? ([contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || "Contact") : "Contact task",
          date: task.due_date || task.created_date,
          href: task.contact_id ? `/contacts/${task.contact_id}` : "/contacts",
          badge: task.priority || "pending",
          badgeColor: task.priority === "urgent" || task.priority === "high" ? "red" : "amber",
          icon: Users,
          priorityRank: task.priority === "urgent" || task.priority === "high" ? 0 : 2,
        };
      });

    const leadItems = leadTasks
      .filter((task) => isPendingLeadTask(task))
      .map((task) => ({
        id: `lead-${task.id}`,
        type: "lead",
        title: task.title,
        subtitle: leadLookup.get(task.lead_id)?.title || "Lead task",
        date: task.due_date || task.created_date,
        href: task.lead_id ? `/leads/${task.lead_id}` : "/leads",
        badge: task.priority || "pending",
        badgeColor: task.priority === "high" || task.priority === "urgent" ? "red" : task.priority === "medium" ? "amber" : "slate",
        icon: Target,
        priorityRank: task.priority === "high" || task.priority === "urgent" ? 1 : 3,
      }));

    const quoteItems = quotes
      .filter((quote) => isOpenQuote(quote))
      .map((quote) => ({
        quote,
        operational: getQuoteOperationalSummary(quote),
      }))
      .filter(({ operational }) => ["Expired", "Follow up", "Expiring soon"].includes(operational.health.label))
      .map(({ quote, operational }) => ({
        id: `quote-${quote.id}`,
        type: "quote",
        title: quote.quote_number || quote.title || "Quote",
        subtitle: [quote.title, quote.contact_name || quote.company_name].filter(Boolean).join(" · "),
        date: quote.valid_until || quote.created_date,
        href: `/quotes/${quote.id}`,
        badge: operational.health.label,
        badgeColor: operational.health.color,
        icon: FileText,
        priorityRank: operational.health.rank,
      }));

    const jobItems = jobs
      .filter((job) => isActiveJob(job))
      .map((job) => ({
        job,
        operational: getJobOperationalSummary(job, jobOperations),
      }))
      .filter(({ operational }) => operational.health.rank <= 4)
      .map(({ job, operational }) => ({
        id: `job-${job.id}`,
        type: "job",
        title: job.job_number || job.title || "Job",
        subtitle: [job.title, operational.nextTaskName ? `Next: ${operational.nextTaskName}` : operational.health.reason].filter(Boolean).join(" · "),
        date: operational.installDate || job.due_date || job.updated_date || job.created_date,
        href: `/jobs/${job.id}`,
        badge: operational.health.label,
        badgeColor: operational.health.color,
        icon: Briefcase,
        priorityRank: operational.health.rank,
      }));

    return [
      ...(contactsEnabled ? [...contactFollowUpItems, ...contactTaskItems] : []),
      ...(leadsEnabled ? leadItems : []),
      ...(quotesEnabled ? quoteItems : []),
      ...jobItems,
    ]
      .sort((left, right) => {
        const priorityDifference = Number(left.priorityRank || 0) - Number(right.priorityRank || 0);
        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return parseDateValue(left.date) - parseDateValue(right.date);
      });
  }, [contactLookup, contactTasks, contacts, contactsEnabled, jobs, jobOperations, leadLookup, leadTasks, leadsEnabled, quotes, quotesEnabled]);

  const filteredItems = pendingItems.filter((item) => filter === "all" || item.type === filter);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const availableFilters = [
    { value: "all", label: "All" },
    contactsEnabled ? { value: "contact", label: "Contacts" } : null,
    leadsEnabled ? { value: "lead", label: "Leads" } : null,
    quotesEnabled ? { value: "quote", label: "Quotes" } : null,
    { value: "job", label: "Jobs" },
  ].filter(Boolean);

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Attention Center"
        subtitle={`${pendingItems.length} urgent items across the currently enabled modules`}
        actions={
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
            {availableFilters.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === option.value ? "bg-card shadow-sm" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
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

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No urgent items right now</p>
          </Card>
        ) : filteredItems.map((item) => {
          const Icon = item.icon || AlertTriangle;
          return (
            <Link key={item.id} to={item.href} className="block">
              <Card className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.title}</p>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                      </div>
                      <StatusBadge label={item.badge} color={item.badgeColor} className="text-[10px]" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{formatDate(item.date)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
