import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import { CONTACT_RELATIONSHIP_COLORS, CONTACT_TYPE_COLORS, getContactDisplayName } from "@/lib/contactHelpers";

export default function ContactMergeDialog({
  open,
  onOpenChange,
  primaryContact,
  duplicateCandidates,
  onConfirm,
  loading = false,
}) {
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedId(String(duplicateCandidates?.[0]?.id || ""));
    }
  }, [duplicateCandidates, open]);

  const selectedDuplicate = (duplicateCandidates || []).find((candidate) => String(candidate.id) === selectedId) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Merge Duplicate Contact
          </DialogTitle>
          <DialogDescription>
            Keep the current contact as the primary record and move linked history, work items, notes, and follow-ups from the duplicate into it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card/80 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Primary Contact</p>
            {primaryContact ? (
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">{getContactDisplayName(primaryContact)}</p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={primaryContact.type || "client"} color={CONTACT_TYPE_COLORS[primaryContact.type] || "slate"} />
                  <StatusBadge label={primaryContact.relationship_status || "active"} color={CONTACT_RELATIONSHIP_COLORS[primaryContact.relationship_status] || "slate"} />
                </div>
                <p className="text-sm text-muted-foreground">{[primaryContact.company_name, primaryContact.email].filter(Boolean).join(" · ") || "No company or email set"}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border bg-card/80 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Choose Duplicate</p>
            <div className="space-y-2">
              {(duplicateCandidates || []).map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => setSelectedId(String(candidate.id))}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${String(candidate.id) === selectedId ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <p className="font-medium text-foreground">{getContactDisplayName(candidate)}</p>
                  <p className="text-sm text-muted-foreground">{[candidate.company_name, candidate.email].filter(Boolean).join(" · ") || "No company or email set"}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedDuplicate ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            This will delete <span className="font-semibold">{getContactDisplayName(selectedDuplicate)}</span> after linked records are moved into <span className="font-semibold">{getContactDisplayName(primaryContact)}</span>.
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => selectedDuplicate && onConfirm?.(selectedDuplicate)} disabled={!selectedDuplicate || loading}>
            {loading ? "Merging..." : "Merge Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
