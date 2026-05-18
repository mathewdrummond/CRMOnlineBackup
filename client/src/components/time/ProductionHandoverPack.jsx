import React, { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmApi } from "@/api/localApiClient";
import { formatFileSize, getAttachmentKind } from "@/lib/attachmentHelpers";
import { buildProductionHandoverPack, getAttachmentProductionVisibilityLabel } from "@/lib/productionHandover";
import { AlertTriangle, Download, Expand, File, FileImage, FileText, Printer, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

function getFileContentUrl(attachment, disposition = "inline") {
  if (!attachment?.id) return attachment?.url || "";
  return crmApi.filesystem.productionContentUrl(attachment.id, disposition);
}

function printUrl(url) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    window.setTimeout(() => frame.remove(), 3000);
  };
  document.body.appendChild(frame);
}

function printElement(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    window.print();
    return;
  }
  win.document.write(`
    <html>
      <head>
        <title>Production Handover Pack</title>
        <style>
          @page { size: A3 portrait; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #29251f; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          h1, h2, h3 { margin: 0 0 8px; }
          section { break-inside: avoid; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th, td { border: 1px solid rgba(103, 78, 54, 0.28); padding: 6px; text-align: left; vertical-align: top; }
          th { background: #eee7db; color: #4f4940; }
          .muted { color: #5f574e; }
          @media print {
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>${element.innerHTML}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function InfoList({ title, items, emptyText }) {
  return (
    <Card className="border-border/55">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length ? (
          <ul className="space-y-2 text-sm">
            {items.map((item, index) => (
              <li key={`${title}-${index}`} className="rounded-[10px] border border-border/55 bg-white/58 px-3 py-3">{item}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[10px] border border-dashed px-3 py-4 text-sm text-muted-foreground">{emptyText}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FilePreview({ attachment }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const viewerRef = useRef(null);
  const kind = getAttachmentKind(attachment);
  const inlineUrl = getFileContentUrl(attachment, "inline");
  const downloadUrl = getFileContentUrl(attachment, "attachment");

  if (!attachment) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-[360px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Choose a drawing, PDF, photo, or document to preview.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/50 bg-white/55 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{attachment.name || "Attached file"}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {attachment.file_source || "File"} · {formatFileSize(Number(attachment.size || 0))} · {getAttachmentProductionVisibilityLabel(attachment)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="jf-workshop-touch" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" className="jf-workshop-touch" onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" className="jf-workshop-touch" onClick={() => setRotation((value) => (value + 90) % 360)}>
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" className="jf-workshop-touch" onClick={() => viewerRef.current?.requestFullscreen?.()}>
              <Expand className="h-4 w-4" />
            </Button>
            <Button type="button" size="sm" className="jf-workshop-touch bg-[#4f5148] text-white hover:bg-[#3f4239]" onClick={() => printUrl(inlineUrl)}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={viewerRef} className="jf-workshop-file-viewer h-[72vh] min-h-[560px] overflow-auto p-3">
          {kind === "pdf" ? (
            <iframe
              title={`Preview ${attachment.name || "PDF"}`}
              src={inlineUrl}
              className="h-full min-h-[540px] w-full rounded-[8px] border bg-white"
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "top left" }}
            />
          ) : kind === "image" ? (
            <img
              src={inlineUrl}
              alt={attachment.name || "Attached image"}
              className="mx-auto max-w-none rounded-[8px] bg-white shadow"
              style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transformOrigin: "top center" }}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[8px] border bg-white p-6 text-center">
              <File className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-base font-semibold">Preview not available for this file type</p>
                <p className="mt-1 text-sm text-muted-foreground">Open or download it to view in the right program.</p>
              </div>
              <Button type="button" asChild className="min-h-[44px]">
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Open File
                </a>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductionHandoverPack({
  jobs = [],
  quotes = [],
  quoteItems = [],
  jobOperations = [],
  siteMeasures = [],
  attachments = [],
  activeEntries = [],
}) {
  const activeJobId = activeEntries.find((entry) => entry.job_id)?.job_id || "";
  const [selectedJobId, setSelectedJobId] = useState(activeJobId || jobs[0]?.id || "");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0] || null;
  const selectedQuote = quotes.find((quote) => quote.id === selectedJob?.quote_id) || null;
  const pack = useMemo(() => buildProductionHandoverPack({
    job: selectedJob,
    quote: selectedQuote,
    quoteItems: quoteItems.filter((item) => String(item.quote_id || "") === String(selectedJob?.quote_id || "")),
    jobOperations,
    siteMeasures,
    attachments,
  }), [attachments, jobOperations, quoteItems, selectedJob, selectedQuote, siteMeasures]);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState("");
  const [selectedPrintFileIds, setSelectedPrintFileIds] = useState([]);
  const selectedAttachment = pack.attachments.find((attachment) => attachment.id === selectedAttachmentId) || pack.attachments[0] || null;
  const selectedPrintFiles = pack.attachments.filter((attachment) => selectedPrintFileIds.includes(attachment.id));

  useEffect(() => {
    setSelectedPrintFileIds(pack.attachments.map((attachment) => attachment.id));
  }, [selectedJob?.id, pack.attachments]);

  if (!selectedJob) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-semibold">No active job selected</p>
          <p className="mt-1 text-sm text-muted-foreground">Start a timer on a job to show its workshop handover pack here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="jf-workshop-timer-active">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-700">Production Pack</Badge>
              {activeJobId === selectedJob.id ? <Badge variant="outline" className="border-emerald-300 text-emerald-800">Active timer job</Badge> : null}
            </div>
            <h2 className="mt-2 text-3xl font-bold leading-tight">{pack.jobNumber} · {pack.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{pack.clientName || "Client not recorded"}{pack.installDateLabel ? ` · Install ${pack.installDateLabel}` : ""}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={selectedJob.id} onValueChange={(value) => {
              setSelectedJobId(value);
              setSelectedAttachmentId("");
            }}>
              <SelectTrigger className="jf-workshop-touch min-h-[48px] min-w-[280px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.job_number} - {job.title || job.job_name || "Untitled Job"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" className="jf-workshop-action bg-[#4f5148] text-white hover:bg-[#3f4239]" onClick={() => printElement("production-handover-print")}>
              <Printer className="mr-2 h-4 w-4" />
              Print Handover Pack
            </Button>
          </div>
        </CardContent>
      </Card>

      <div id="production-handover-print" className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <InfoList title="Key Things to Know" items={pack.keyThings} emptyText="No key notes recorded." />
          <InfoList title="Items Requiring Attention" items={pack.warnings} emptyText="No urgent attention items." />
          <InfoList title="Client Requests" items={pack.clientRequests} emptyText="No client requests recorded." />
          <InfoList title="Install Notes" items={pack.installNotes} emptyText="No install notes recorded." />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">Quote Sections</CardTitle>
              <Badge variant="secondary">{pack.sectionGroups.length} sections</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {pack.sectionGroups.length ? pack.sectionGroups.map((section) => (
              <section key={section.key} className="rounded-[10px] border border-border/55">
                <div className="border-b border-border/45 bg-white/55 px-3 py-2">
                  <h3 className="text-base font-semibold">{section.label}</h3>
                </div>
                <div className="divide-y divide-border/45">
                  {section.items.map((item) => (
                    <div key={item.id} className="grid gap-2 px-3 py-2 text-sm sm:grid-cols-[1fr_120px_120px]">
                      <div>
                        <p className="font-medium">{item.description || "Line item"}</p>
                        {item.notes ? <p className="text-xs text-muted-foreground">{item.notes}</p> : null}
                      </div>
                      <p>{Number(item.quantity || 0)} {item.unit || "ea"}</p>
                      <p className="text-muted-foreground">{item.category || "Item"}</p>
                    </div>
                  ))}
                </div>
              </section>
            )) : (
              <p className="rounded-xl border border-dashed px-3 py-5 text-sm text-muted-foreground">No quote line items found for this job.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Special Hardware</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {pack.hardwareSummary.length ? pack.hardwareSummary.map((item) => (
                <div key={item.id} className="rounded-[10px] border border-border/55 bg-white/55 px-3 py-3 text-sm">
                  <p className="font-medium">{item.description}</p>
                  <p className="text-muted-foreground">{item.quantity} {item.unit}{item.supplier ? ` · ${item.supplier}` : ""}</p>
                </div>
              )) : (
                <p className="rounded-xl border border-dashed px-3 py-5 text-sm text-muted-foreground">No special hardware found in the quote list.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pending Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {pack.pendingItems.length ? pack.pendingItems.map((operation) => (
                <div key={operation.id} className="rounded-[10px] border border-border/55 bg-white/55 px-3 py-3 text-sm">
                  <p className="font-medium">{operation.title || operation.name || operation.operation || "Workflow task"}</p>
                  <p className="text-muted-foreground">{String(operation.status || "pending").replace(/_/g, " ")}</p>
                </div>
              )) : (
                <p className="rounded-xl border border-dashed px-3 py-5 text-sm text-muted-foreground">No pending workshop tasks found.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">Job Files</CardTitle>
              <Badge variant="secondary">{pack.attachments.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {pack.attachments.length ? pack.attachments.map((attachment) => {
              const kind = getAttachmentKind(attachment);
              const Icon = kind === "pdf" ? FileText : kind === "image" ? FileImage : File;
              const selected = selectedAttachment?.id === attachment.id;
              const selectedForPrint = selectedPrintFileIds.includes(attachment.id);
              return (
                <div
                  key={attachment.id}
                  className={`flex w-full items-start gap-3 rounded-[10px] border px-3 py-4 text-left transition ${selected ? "border-[#4f5148] bg-[#e7ded2]/60" : "border-border/55 bg-white/60 hover:border-primary/40"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${attachment.name || "file"} for printing`}
                    checked={selectedForPrint}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedPrintFileIds((ids) => checked
                        ? [...new Set([...ids, attachment.id])]
                        : ids.filter((id) => id !== attachment.id));
                    }}
                    className="mt-1 h-6 w-6 rounded border-border"
                  />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedAttachmentId(attachment.id)}>
                    <div className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-6 w-6 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold">{attachment.name || "Attached file"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{attachment.file_source || "File"} · {formatFileSize(Number(attachment.size || 0))}</p>
                      {attachment.document_information ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{attachment.document_information}</p> : null}
                    </div>
                    </div>
                  </button>
                </div>
              );
            }) : (
              <div className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5" />
                No production-visible files are attached to this job yet.
              </div>
            )}
            {pack.attachments.length ? (
              <Button type="button" variant="outline" className="jf-workshop-action mt-3 w-full" disabled={selectedPrintFiles.length === 0} onClick={() => selectedPrintFiles.forEach((attachment) => printUrl(getFileContentUrl(attachment, "inline")))}>
                <Printer className="mr-2 h-4 w-4" />
                Print Selected Files ({selectedPrintFiles.length})
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <FilePreview attachment={selectedAttachment} />
      </div>
    </div>
  );
}
