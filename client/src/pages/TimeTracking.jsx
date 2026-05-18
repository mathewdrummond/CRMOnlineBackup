import { Suspense, lazy, useEffect, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { useModules } from "@/lib/ModuleContext";
import PageHeader from "../components/PageHeader";
import { AlertCircle } from "lucide-react";

const ClockInTab = lazy(() => import("../components/time/ClockInTab"));
const TimesheetTab = lazy(() => import("../components/time/TimesheetTab"));
const ExportTab = lazy(() => import("../components/time/ExportTab"));
const ProductionHandoverPack = lazy(() => import("../components/time/ProductionHandoverPack"));
const ReviewQueueTab = lazy(() => import("../components/time/ReviewQueueTab"));

function TabLoading() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );
}

export default function TimeTracking({ initialTab = "clockin" }) {
  const { user, navigateToLogin } = useAuth();
  const { isModuleEnabled } = useModules();
  const [staff, setStaff] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobOperations, setJobOperations] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [quoteItems, setQuoteItems] = useState([]);
  const [siteMeasures, setSiteMeasures] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [activeTimeEntries, setActiveTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [exportDataLoaded, setExportDataLoaded] = useState(false);
  const [exportDataLoading, setExportDataLoading] = useState(false);
  const exportEnabled = isModuleEnabled("myob_export");

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    setActiveTab(initialTab === "export" && !exportEnabled ? "clockin" : initialTab);
  }, [exportEnabled, initialTab]);
  useEffect(() => {
    if (exportEnabled && activeTab === "export" && !exportDataLoaded && !exportDataLoading) {
      void loadExportData();
    }
  }, [activeTab, exportDataLoaded, exportDataLoading, exportEnabled]);

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [s, jobRecords, operationRecords, quoteRecords, quoteItemRecords, siteMeasureRecords, attachmentRecords, activeEntries] = await Promise.all([
        crmApi.entities.Staff.filter({ status: "active" }, "name", 100),
        crmApi.entities.Job.list("-created_date", 200),
        crmApi.entities.JobOperation.list("-updated_date", 1000),
        crmApi.entities.Quote.list("-updated_date", 500),
        crmApi.entities.QuoteItem.list("sort_order", 5000),
        crmApi.entities.SiteMeasure.list("-measure_date", 1000),
        crmApi.entities.Attachment.list("-updated_date", 5000),
        crmApi.entities.TimeEntry.filter({ status: "active" }, "-updated_date", 100),
      ]);

      const j = jobRecords.filter((job) => !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").toLowerCase()));
      setStaff(s);
      setJobs(j);
      setJobOperations(Array.isArray(operationRecords) ? operationRecords : []);
      setQuotes(Array.isArray(quoteRecords) ? quoteRecords : []);
      setQuoteItems(Array.isArray(quoteItemRecords) ? quoteItemRecords : []);
      setSiteMeasures(Array.isArray(siteMeasureRecords) ? siteMeasureRecords : []);
      setAttachments(Array.isArray(attachmentRecords) ? attachmentRecords : []);
      setActiveTimeEntries(Array.isArray(activeEntries) ? activeEntries : []);
    } catch (loadError) {
      const status = loadError?.status;
      if (status === 401 || status === 403) {
        navigateToLogin("/time-tracking");
        return;
      }

      setError(loadError?.message || "Time tracking could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const loadExportData = async () => {
    setExportDataLoading(true);
    setError("");

    try {
      const jobRecords = await crmApi.entities.Job.list("-created_date", 500);
      setAllJobs(jobRecords);
      setExportDataLoaded(true);
    } catch (loadError) {
      const status = loadError?.status;
      if (status === 401 || status === 403) {
        navigateToLogin("/time-tracking");
        return;
      }

      setError(loadError?.message || "MYOB export data could not be loaded.");
    } finally {
      setExportDataLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="jf-reference-page jf-workshop-screen max-w-[1600px]">
      <PageHeader title="Time Clock" subtitle={exportEnabled ? "Clock in, choose the job, open the handover pack, then get moving." : "Clock in, choose the job, open the handover pack, then get moving."} />
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Time Tracking Unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (activeTab === "export") {
                  void loadExportData();
                  return;
                }

                void loadData();
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <TabsList className="mb-0 flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger className="flex-1 px-4 sm:flex-none" value="clockin">Clock In / Out</TabsTrigger>
          <TabsTrigger className="flex-1 px-4 sm:flex-none" value="review">Time Needing Attention</TabsTrigger>
          <TabsTrigger className="flex-1 px-4 sm:flex-none" value="handover">Handover Pack</TabsTrigger>
          <TabsTrigger className="flex-1 px-4 sm:flex-none" value="timesheets">Timesheets</TabsTrigger>
          {exportEnabled ? <TabsTrigger className="flex-1 px-4 sm:flex-none" value="export">MYOB Export</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="mt-0" value="clockin">
          <Suspense fallback={<TabLoading />}>
            <ClockInTab user={user} staff={staff} jobs={jobs} jobOperations={jobOperations} />
          </Suspense>
        </TabsContent>
        <TabsContent className="mt-0" value="review">
          <Suspense fallback={<TabLoading />}>
            <ReviewQueueTab staff={staff} jobs={allJobs.length ? allJobs : jobs} />
          </Suspense>
        </TabsContent>
        <TabsContent className="mt-0" value="handover">
          <Suspense fallback={<TabLoading />}>
            <ProductionHandoverPack
              jobs={jobs}
              quotes={quotes}
              quoteItems={quoteItems}
              jobOperations={jobOperations}
              siteMeasures={siteMeasures}
              attachments={attachments}
              activeEntries={activeTimeEntries}
            />
          </Suspense>
        </TabsContent>
        <TabsContent className="mt-0" value="timesheets">
          <Suspense fallback={<TabLoading />}>
            <TimesheetTab staff={staff} jobs={jobs} />
          </Suspense>
        </TabsContent>
        {exportEnabled ? (
          <TabsContent className="mt-0" value="export">
            <Suspense fallback={<TabLoading />}>
              {exportDataLoading && !exportDataLoaded ? (
                <TabLoading />
              ) : exportDataLoaded ? (
                <ExportTab user={user} staff={staff} jobs={allJobs} />
              ) : (
                <div className="rounded-lg border border-dashed border-border/80 bg-card/40 p-8 text-sm text-muted-foreground">
                  Open the MYOB export tab to load export-ready job data.
                </div>
              )}
            </Suspense>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
