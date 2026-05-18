import { useEffect, useMemo, useState } from "react";
import { AlertCircle, FileWarning, MoonStar, PencilLine, ShieldAlert, TriangleAlert } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildDailyReviewQueue, TIME_REVIEW_FLAGS } from "@/lib/timeclock";
import { mapActivitySlipRecords, validateActivitySlipRecords } from "./ExportTab";

const FLAG_LABELS = {
  [TIME_REVIEW_FLAGS.overnight_timer]: "Overnight timer",
  [TIME_REVIEW_FLAGS.long_running_timer]: "Long-running timer",
  [TIME_REVIEW_FLAGS.unassigned_chargeable_time]: "Chargeable time missing job",
  [TIME_REVIEW_FLAGS.other_category]: "Other labour category",
  [TIME_REVIEW_FLAGS.manual_correction]: "Manual correction",
  [TIME_REVIEW_FLAGS.export_error]: "Export error",
};

function getFlagIcon(flag) {
  if (flag === TIME_REVIEW_FLAGS.overnight_timer) return MoonStar;
  if (flag === TIME_REVIEW_FLAGS.manual_correction) return PencilLine;
  if (flag === TIME_REVIEW_FLAGS.export_error) return FileWarning;
  return TriangleAlert;
}

export default function ReviewQueueTab({ staff = [], jobs = [] }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadQueue();
  }, []);

  const loadQueue = async () => {
    setLoading(true);
    setError("");
    try {
      const allEntries = await crmApi.entities.TimeEntry.list("-updated_date", 1000);
      setEntries(Array.isArray(allEntries) ? allEntries : []);
    } catch (loadError) {
      setError(loadError?.message || "The review queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const exportErrors = useMemo(() => {
    const completedEntries = entries.filter((entry) => String(entry.status || "").toLowerCase() === "completed" && !entry.voided);
    const records = mapActivitySlipRecords(completedEntries.filter((entry) => !entry.exported), staff, jobs, [], []);
    const validation = validateActivitySlipRecords(records);
    return validation.valid
      ? []
      : validation.errors.map((item) => {
          const matched = records.find((record) => record.id === item.id) || {};
          return {
            id: item.id,
            staff_name: matched.staff_name || matched.customer_name || "",
            job_number: matched.job_number || "",
            activity: matched.activity || "",
            missingFields: item.missingFields || [],
          };
        });
  }, [entries, jobs, staff]);

  const queue = useMemo(
    () => buildDailyReviewQueue(entries, exportErrors),
    [entries, exportErrors]
  );

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Review queue unavailable</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void loadQueue()}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-white/55">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Time Needing Attention</CardTitle>
              <p className="text-sm text-muted-foreground">Overnight timers, missing job links, Other category, manual corrections, and export problems surface here each day.</p>
            </div>
            <Badge variant={queue.length ? "destructive" : "secondary"}>{queue.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-muted border-t-primary" />
            </div>
          ) : queue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
              Nothing needs attention right now. That is a pretty nice sentence to be able to write.
            </div>
          ) : (
            queue.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{item.staff_name}</p>
                    <p className="text-sm text-muted-foreground">{item.job_label} · {item.activity}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(item.flags || []).map((flag) => {
                      const Icon = getFlagIcon(flag);
                      return (
                        <Badge key={flag} variant="outline" className="gap-1">
                          <Icon className="h-3.5 w-3.5" />
                          {FLAG_LABELS[flag] || flag}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                {item.type === "export_error" ? (
                  <p className="mt-2 text-sm text-amber-800">
                    Missing fields: {(item.error?.missingFields || []).join(", ") || "Validation failed"}
                  </p>
                ) : null}
                {item.entry?.voided ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <ShieldAlert className="h-4 w-4" />
                    Voided entry
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
