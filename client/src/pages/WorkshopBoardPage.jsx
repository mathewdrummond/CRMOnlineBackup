import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import WorkshopBoard from "@/components/jobs/WorkshopBoard";
import { getWorkshopStageLabel } from "@/lib/workshopBoard";

export default function WorkshopBoardPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [jobOperations, setJobOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [jobRecords, quoteRecords, operationRecords] = await Promise.all([
        crmApi.entities.Job.list("-updated_date", 500),
        crmApi.entities.Quote.list("-updated_date", 500),
        crmApi.entities.JobOperation.list("-updated_date", 1000),
      ]);
      setJobs(Array.isArray(jobRecords) ? jobRecords : []);
      setQuotes(Array.isArray(quoteRecords) ? quoteRecords : []);
      setJobOperations(Array.isArray(operationRecords) ? operationRecords : []);
    } catch (loadError) {
      setError(loadError?.message || "Workshop board could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleMoveStage = async (card, stageId, status) => {
    setSavingId(card.id);
    setError("");
    setMessage("");
    const previousJobs = jobs;
    const optimisticJobs = jobs.map((job) => String(job.id) === String(card.id) ? { ...job, status } : job);
    setJobs(optimisticJobs);
    try {
      const updated = await crmApi.entities.Job.update(card.id, {
        status,
        workshop_stage: stageId,
        workshop_stage_updated_at: new Date().toISOString(),
      });
      setJobs((records) => records.map((job) => String(job.id) === String(card.id) ? updated : job));
      setMessage(`${card.title} moved to ${getWorkshopStageLabel(stageId)}.`);
    } catch (saveError) {
      setJobs(previousJobs);
      setError(saveError?.message || "The job stage could not be updated.");
    } finally {
      setSavingId("");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[120rem] p-4 lg:p-6">
      <PageHeader
        title="Workshop Board"
        subtitle="Simple production progress board for the jobs moving through the workshop."
        actions={
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => void loadData()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Workshop Board Needs Attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-950">
          <AlertTitle>Stage Updated</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {savingId ? (
        <p className="mb-3 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Updating workshop stage...</p>
      ) : null}

      <WorkshopBoard
        jobs={jobs}
        quotes={quotes}
        jobOperations={jobOperations}
        onMoveStage={handleMoveStage}
        onPrintHandover={(card) => navigate(`/time-tracking?handoverJob=${encodeURIComponent(card.id)}`)}
        onAssignInstall={(card) => navigate(`/schedule?job=${encodeURIComponent(card.id)}`)}
      />
    </div>
  );
}
