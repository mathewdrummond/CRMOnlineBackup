import React, { useMemo, useState } from "react";
import { Camera, ClipboardCheck, FileText, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "./StatusBadge";

const CHECKLIST_ITEMS = [
  ["appliance_confirmed", "Appliance confirmed"],
  ["services_checked", "Services checked"],
  ["floor_level_checked", "Floor level checked"],
  ["wall_condition_checked", "Wall condition checked"],
  ["ceiling_checked", "Ceiling checked"],
  ["access_checked", "Access checked"],
];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function defaultMeasureForm(quote = {}, measure = null) {
  return {
    site_address: measure?.site_address || quote.site_address || "",
    measure_date: measure?.measure_date || new Date().toISOString().slice(0, 10),
    measured_by: measure?.measured_by || "",
    appliance_details: measure?.appliance_details || "",
    notes: measure?.notes || "",
    client_requests: measure?.client_requests || "",
    access_notes: measure?.access_notes || "",
    checklist: {
      appliance_confirmed: false,
      services_checked: false,
      floor_level_checked: false,
      wall_condition_checked: false,
      ceiling_checked: false,
      access_checked: false,
      ...(measure?.checklist || {}),
    },
    job_id: measure?.job_id || "",
    install_id: measure?.install_id || "",
    include_in_handover_pack: measure?.include_in_handover_pack !== false,
    status: measure?.status || "draft",
  };
}

export function getSiteMeasureChecklistProgress(measure = {}) {
  const checklist = measure.checklist || {};
  const complete = CHECKLIST_ITEMS.filter(([key]) => checklist[key] === true).length;
  return { complete, total: CHECKLIST_ITEMS.length };
}

export default function SiteMeasureWorkflow({
  quote,
  measures = [],
  attachments = [],
  staffRecords = [],
  linkedJobs = [],
  onSave,
  onUpload,
}) {
  const latestMeasure = measures[0] || null;
  const [form, setForm] = useState(() => defaultMeasureForm(quote, latestMeasure));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const progress = useMemo(() => getSiteMeasureChecklistProgress(form), [form]);
  const siteMeasureFiles = attachments.filter((attachment) => String(attachment.source || "") === "site-measure" || String(attachment.site_measure_id || "") === String(latestMeasure?.id || ""));

  const patchForm = (patch) => setForm((current) => ({ ...current, ...patch }));
  const patchChecklist = (key, checked) => setForm((current) => ({
    ...current,
    checklist: { ...(current.checklist || {}), [key]: checked === true },
  }));

  const saveMeasure = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await onSave?.({
        ...form,
        quote_id: quote.id,
        quote_number: quote.quote_number || "",
        status: progress.complete === progress.total ? "complete" : "draft",
      }, latestMeasure);
      setNotice(progress.complete === progress.total ? "Site measure saved and checklist complete." : "Site measure saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Site measure could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        await onUpload?.({
          file,
          file_base64: String(dataUrl).split(",")[1] || "",
          measure: latestMeasure,
          form,
        });
      }
      setNotice(`${files.length} site measure file${files.length === 1 ? "" : "s"} uploaded.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Site measure file upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Site Measure</h2>
          <p className="mt-1 text-sm text-muted-foreground">Capture the details that prevent expensive measure mistakes before pricing, production, or install.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={`${progress.complete}/${progress.total} checks`} color={progress.complete === progress.total ? "emerald" : "amber"} />
          {form.include_in_handover_pack ? <StatusBadge label="Handover pack" color="blue" /> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Site Address</Label>
              <Input value={form.site_address} onChange={(event) => patchForm({ site_address: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Measure Date</Label>
              <Input type="date" value={form.measure_date} onChange={(event) => patchForm({ measure_date: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Measured By</Label>
              <Select value={form.measured_by || "__none"} onValueChange={(value) => patchForm({ measured_by: value === "__none" ? "" : value })}>
                <SelectTrigger><SelectValue placeholder="Choose staff" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not selected</SelectItem>
                  {staffRecords.map((staff) => (
                    <SelectItem key={staff.id} value={staff.name || staff.full_name || staff.email || staff.id}>
                      {staff.name || staff.full_name || staff.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Linked Install / Job</Label>
              <Select value={form.job_id || "__none"} onValueChange={(value) => patchForm({ job_id: value === "__none" ? "" : value, install_id: value === "__none" ? "" : value })}>
                <SelectTrigger><SelectValue placeholder="Link when available" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No install linked yet</SelectItem>
                  {linkedJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number || job.title || "Linked job"}{job.install_date ? ` · ${job.install_date}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Appliance Details</Label>
            <Textarea aria-label="Appliance Details" rows={3} value={form.appliance_details} onChange={(event) => patchForm({ appliance_details: event.target.value })} placeholder="Appliance model, dimensions, ventilation, power/water needs..." />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Client Requests</Label>
              <Textarea aria-label="Client Requests" rows={4} value={form.client_requests} onChange={(event) => patchForm({ client_requests: event.target.value })} placeholder="Things the client specifically asked for on site." />
            </div>
            <div className="space-y-2">
              <Label>Access Notes</Label>
              <Textarea aria-label="Access Notes" rows={4} value={form.access_notes} onChange={(event) => patchForm({ access_notes: event.target.value })} placeholder="Parking, stairs, tight entry, lift, pets, gate codes..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Measure Notes</Label>
            <Textarea aria-label="Measure Notes" rows={4} value={form.notes} onChange={(event) => patchForm({ notes: event.target.value })} placeholder="Room conditions, risks, dimensions to double-check, anything unusual." />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Measure Checklist</p>
            </div>
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map(([key, label]) => (
                <label key={key} className="flex min-h-[40px] items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                  <Checkbox checked={form.checklist?.[key] === true} onCheckedChange={(checked) => patchChecklist(key, checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Photos, Sketches, PDFs</p>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm hover:bg-muted/30">
              <UploadCloud className="mb-2 h-6 w-6 text-primary" />
              <span className="font-medium">{uploading ? "Uploading..." : "Upload site measure files"}</span>
              <span className="mt-1 text-xs text-muted-foreground">Photos, sketches, and PDFs stay attached to this quote.</span>
              <Input className="sr-only" type="file" multiple accept="image/*,.pdf,.csv,.xlsx" onChange={(event) => void uploadFiles(event.target.files)} />
            </label>
            {siteMeasureFiles.length ? (
              <div className="mt-3 space-y-2">
                {siteMeasureFiles.map((file) => (
                  <div key={file.id || file.name} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.file_source || "Site measure file"}</p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No site measure photos or sketches uploaded yet.</p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 text-sm">
            <Checkbox checked={form.include_in_handover_pack} onCheckedChange={(checked) => patchForm({ include_in_handover_pack: checked === true })} />
            <span>
              <span className="block font-medium">Include in production handover pack</span>
              <span className="text-muted-foreground">Keeps measure notes visible when this quote becomes production work.</span>
            </span>
          </label>
        </div>
      </div>

      {notice ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div> : null}

      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={() => void saveMeasure()} disabled={saving}>
          {saving ? "Saving..." : "Save Site Measure"}
        </Button>
      </div>
    </Card>
  );
}
