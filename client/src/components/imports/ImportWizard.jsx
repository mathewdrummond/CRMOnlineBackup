import React, { useMemo, useState } from "react";
import { FileUp, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ReviewStateBadge from "@/components/ReviewStateBadge";
import {
  IMPORT_WIZARD_STEPS,
  detectImportType,
  explainImportIssue,
  getImportWizardStepIndex,
  validateImportFile,
} from "@/lib/importWizard";

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "Unknown size";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportWizard({
  title = "Import file",
  description = "Upload the file, review what JoinerFlow found, then confirm only when it looks right.",
  fileInfo,
  status = "Waiting for file",
  acceptedExtensions = [".csv", ".xlsx", ".pdf"],
  rows = [],
  warnings = [],
  errors = [],
  onFile,
  onParse,
  onCancel,
  onRollback,
  confirmActions,
  parseLabel = "Review Import",
  successSummary,
  helpText,
  children,
}) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const issues = [...(errors || []), ...(warnings || [])].filter(Boolean);
  const currentStep = getImportWizardStepIndex(status, Boolean(fileInfo?.name), rows.length > 0);
  const detectedType = fileInfo?.name ? detectImportType(fileInfo.name, title) : "Waiting for file";
  const accept = acceptedExtensions.join(",");

  const explainedIssues = useMemo(
    () => issues.map((issue) => ({ raw: issue, explanation: explainImportIssue(issue) })),
    [issues]
  );

  const handleFile = (file) => {
    const result = validateImportFile(file, { acceptedExtensions });
    if (!result.valid) {
      setLocalError(result.message);
      return;
    }
    setLocalError("");
    void onFile?.(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <Card className="overflow-hidden rounded-xl border-border/80">
      <div className="border-b bg-muted/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <ReviewStateBadge state={issues.length > 0 ? "needs_review" : rows.length > 0 ? "imported" : ""} label={rows.length > 0 ? "Review Imported Items" : undefined} />
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
          </div>
          <Badge variant="secondary" className="w-fit">{status}</Badge>
        </div>

        <ol className="mt-4 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
          {IMPORT_WIZARD_STEPS.map((step, index) => {
            const complete = index < currentStep;
            const active = index === currentStep;
            return (
              <li
                key={step}
                className={`rounded-lg border px-3 py-2 text-xs ${active ? "border-primary bg-primary/10 text-primary" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-background text-muted-foreground"}`}
              >
                <span className="font-medium">{index + 1}. {step}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
        <div
          className={`rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <FileUp className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">{fileInfo?.name || "Drop a file here"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fileInfo?.name
              ? `${formatFileSize(fileInfo.size)} · ${detectedType}${fileInfo.row_count ? ` · ${fileInfo.row_count} rows` : ""}`
              : `${acceptedExtensions.join(", ")} · single file · max 25MB`}
          </p>
          <Input className="mt-4" type="file" accept={accept} onChange={(event) => handleFile(event.target.files?.[0])} />
          {localError ? (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive">
              {localError}
            </div>
          ) : null}
          {fileInfo?.name ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {onCancel ? (
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                  <X className="mr-1.5 h-4 w-4" />
                  Cancel Import
                </Button>
              ) : null}
              {onParse ? (
                <Button type="button" size="sm" className="min-h-[40px]" onClick={() => void onParse()}>
                  {parseLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detected Type</p>
            <p className="mt-1 text-sm text-foreground">{detectedType}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helpText || "Nothing changes until you confirm the import."}</p>
          </div>

          {explainedIssues.length > 0 ? (
            <div className="space-y-2">
              {explainedIssues.map((issue, index) => (
                <div key={`${issue.raw}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-medium">Needs attention</p>
                  <p className="mt-1">{issue.explanation}</p>
                </div>
              ))}
            </div>
          ) : rows.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              <p className="font-medium">Ready to confirm</p>
              <p className="mt-1">Review the rows below. Confirming will apply the visible import choices.</p>
            </div>
          ) : null}

          {successSummary ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4" />
                <p>{successSummary}</p>
              </div>
            </div>
          ) : null}

          {children || null}

          {(confirmActions || onRollback) ? (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              {onRollback ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void onRollback()}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Undo Import
                </Button>
              ) : null}
              {confirmActions || null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
