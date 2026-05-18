import React, { useState } from "react";
import { FileText, RefreshCw, Sparkles } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "@/components/ui/use-toast";

const DRAFT_OPTIONS = [
  { value: "quote_summary", label: "Quote summary" },
  { value: "variation_draft", label: "Variation draft" },
  { value: "install_update", label: "Install update" },
  { value: "workshop_handover", label: "Workshop handover" },
  { value: "procurement_summary", label: "Procurement summary" },
  { value: "client_communication", label: "Client communication" },
];

export default function AiDraftPanel({ quoteId, jobId, defaultKind = "quote_summary" }) {
  const [kind, setKind] = useState(defaultKind);
  const [draft, setDraft] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [loading, setLoading] = useState(false);

  const generateDraft = async () => {
    setLoading(true);
    try {
      const response = await crmApi.ai.generateDocumentDraft({
        kind,
        quote_id: quoteId || undefined,
        job_id: jobId || undefined,
      });
      const nextDraft = response?.draft || null;
      setDraft(nextDraft);
      setDraftText(nextDraft?.draft_text || "");
      toast({
        title: "AI draft staged",
        description: "Review and edit the draft before using it.",
      });
    } catch (error) {
      toast({
        title: "AI draft failed",
        description: error?.message || "Unable to generate the draft.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-border/60 bg-white/75 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-lg font-semibold">AI Drafting</h2>
            <StatusBadge label="Review required" color="amber" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated text stays staged here and does not send, approve, or change totals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-56 rounded-md bg-white/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRAFT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" className="min-h-9 rounded-md" onClick={() => void generateDraft()} disabled={loading}>
            {draft ? <RefreshCw className="mr-1 h-4 w-4" /> : <FileText className="mr-1 h-4 w-4" />}
            {draft ? "Regenerate" : "Generate AI Summary"}
          </Button>
        </div>
      </div>

      {draft ? (
        <div className="mt-4 space-y-3">
          {draft.missing_data?.length ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Missing source data: {draft.missing_data.join(", ")}
            </div>
          ) : null}
          <Textarea
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            className="min-h-[220px] rounded-md bg-white font-mono text-sm"
            aria-label="Editable AI generated draft"
          />
          <p className="text-xs text-muted-foreground">
            Staged draft generated {draft.generated_at ? new Date(draft.generated_at).toLocaleString() : ""}. Final review is required before copying into any client-facing document.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

