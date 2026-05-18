import React from "react";
import {
  Archive,
  Ban,
  CheckCircle2,
  FileCheck2,
  Import,
  Lock,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import StatusBadge from "./StatusBadge";

export const REVIEW_STATES = {
  needs_review: { label: "Needs Review", color: "amber", icon: TriangleAlert, rowClass: "jf-review-row-needs-review" },
  ready_to_send: { label: "Ready to Send", color: "emerald", icon: CheckCircle2, rowClass: "jf-review-row-ready" },
  missing_cost: { label: "Missing Cost", color: "red", icon: TriangleAlert, rowClass: "jf-review-row-missing-cost bg-[#eedbd7]/40 dark:bg-[#3b241f]/45" },
  safe_to_print: { label: "Safe to Print", color: "emerald", icon: FileCheck2, rowClass: "jf-review-row-safe" },
  warning: { label: "Warning", color: "amber", icon: TriangleAlert, rowClass: "jf-review-row-warning" },
  archived: { label: "Archived", color: "slate", icon: Archive, rowClass: "jf-review-row-archived opacity-80" },
  locked: { label: "Locked", color: "locked", icon: Lock, rowClass: "jf-review-row-locked" },
  imported: { label: "Imported", color: "blue", icon: Import, rowClass: "jf-review-row-imported" },
  auto_added: { label: "Auto-Added", color: "accent", icon: Sparkles, rowClass: "jf-review-row-auto-added" },
  confirmed: { label: "Confirmed", color: "emerald", icon: CheckCircle2, rowClass: "jf-review-row-confirmed" },
  excluded: { label: "Excluded", color: "slate", icon: Ban, rowClass: "jf-review-row-excluded opacity-80" },
};

export function getReviewStateMeta(state) {
  return REVIEW_STATES[state] || REVIEW_STATES.needs_review;
}

export function getQuoteItemReviewState(item = {}) {
  if (String(item.status || "").toLowerCase() === "archived") return "archived";
  if (String(item.review_state || "").toLowerCase() === "excluded") return "excluded";
  if (String(item.review_state || "").toLowerCase() === "confirmed") return "confirmed";
  if (Number(item.unit_cost || 0) <= 0 && Number(item.total || 0) > 0) return "missing_cost";
  if (String(item.review_status || "").includes("needs_review")) return "needs_review";
  if (String(item.review_status || "").includes("confirmed")) return "confirmed";
  if (["global_auto_inclusion", "triggered_auto_inclusion"].includes(String(item.source || ""))) return "auto_added";
  if (item.is_price_locked === true) return "locked";
  if (item.import_id || String(item.source || "").includes("import")) return "imported";
  return "";
}

export function getReviewStateRowClass(state) {
  return state ? getReviewStateMeta(state).rowClass : "";
}

export default function ReviewStateBadge({ state, label, className = "" }) {
  if (!state && !label) return null;
  const meta = getReviewStateMeta(state);
  const Icon = meta.icon;
  return (
    <StatusBadge
      color={meta.color}
      className={`inline-flex items-center gap-1 ${className}`}
      label={(
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3" />
          {label || meta.label}
        </span>
      )}
    />
  );
}
