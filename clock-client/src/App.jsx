import { useEffect, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ClockInTab from "@/components/time/ClockInTab";
import ProductionHandoverPack from "@/components/time/ProductionHandoverPack";

export default function App() {
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobOperations, setJobOperations] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [quoteItems, setQuoteItems] = useState([]);
  const [siteMeasures, setSiteMeasures] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [activeTimeEntries, setActiveTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const currentUser = await crmApi.auth.me();
      setUser(currentUser);

      const [activeStaff, allJobs, allOperations, handoverData] = await Promise.all([
        crmApi.entities.Staff.filter({ status: "active" }, "name", 100),
        crmApi.entities.Job.list("job_number", 200),
        crmApi.entities.JobOperation.list("-updated_date", 1000),
        crmApi.timeclock.getHandoverData(),
      ]);

      const activeJobs = allJobs.filter(
        (job) => !["complete", "completed", "cancelled", "inactive"].includes(String(job.status || "").toLowerCase())
      );

      setStaff(activeStaff);
      setJobs(activeJobs);
      setJobOperations(Array.isArray(allOperations) ? allOperations : []);
      setQuotes(Array.isArray(handoverData?.quotes) ? handoverData.quotes : []);
      setQuoteItems(Array.isArray(handoverData?.quoteItems) ? handoverData.quoteItems : []);
      setSiteMeasures(Array.isArray(handoverData?.siteMeasures) ? handoverData.siteMeasures : []);
      setAttachments(Array.isArray(handoverData?.attachments) ? handoverData.attachments : []);
      setActiveTimeEntries(Array.isArray(handoverData?.activeEntries) ? handoverData.activeEntries : []);
    } catch (loadError) {
      const status = loadError?.status;
      if (status === 401 || status === 403) {
        setError("Time clock access is not available yet. Confirm kiosk access is configured and that this device is allowed to reach the API.");
      } else {
        setError(loadError?.message || "The time clock could not load its live data.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto flex min-h-screen w-full max-w-[960px] items-center px-4 py-6">
          <Alert className="w-full border-amber-300 bg-amber-50/80 text-amber-950">
            <AlertTitle>Time clock unavailable</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <Button type="button" variant="outline" onClick={() => void loadData()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[1180px] px-3 py-3 md:px-4 md:py-4">
        <Tabs defaultValue="clock" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-muted/70 p-1.5">
            <TabsTrigger className="min-h-[52px] text-base" value="clock">Clock In / Out</TabsTrigger>
            <TabsTrigger className="min-h-[52px] text-base" value="handover">Handover Pack</TabsTrigger>
          </TabsList>
          <TabsContent value="clock" className="mt-0">
            <ClockInTab user={user} staff={staff} jobs={jobs} jobOperations={jobOperations} />
          </TabsContent>
          <TabsContent value="handover" className="mt-0">
            <ProductionHandoverPack
              jobs={jobs}
              quotes={quotes}
              quoteItems={quoteItems}
              jobOperations={jobOperations}
              siteMeasures={siteMeasures}
              attachments={attachments}
              activeEntries={activeTimeEntries}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
