import React from "react";
import { Badge } from "@/components/ui/badge";

const colorMap = {
  blue: "bg-[#e3eaf0] text-[#40586c] border-[#c7d3dd] dark:bg-[#22303a] dark:text-[#cfdeea] dark:border-[#43596b]",
  cyan: "bg-[#e3eaf0] text-[#40586c] border-[#c7d3dd] dark:bg-[#22303a] dark:text-[#cfdeea] dark:border-[#43596b]",
  purple: "bg-[#eadfeb] text-[#654b69] border-[#d4c1d8] dark:bg-[#33273a] dark:text-[#ead3ef] dark:border-[#60466a]",
  pink: "bg-[#eedbd7] text-[#7e4038] border-[#d7ada5] dark:bg-[#3b241f] dark:text-[#f1cbc3] dark:border-[#7a4b42]",
  orange: "bg-[#efe0cf] text-[#794c2e] border-[#d8b48c] dark:bg-[#3a2a1d] dark:text-[#efcfab] dark:border-[#765335]",
  amber: "bg-[#f2e2c6] text-[#7a5621] border-[#dfc38e] dark:bg-[#3d301b] dark:text-[#efd190] dark:border-[#745c2f]",
  teal: "bg-[#e6ece0] text-[#4f6540] border-[#c9d7be] dark:bg-[#263321] dark:text-[#dbe8d2] dark:border-[#506143]",
  emerald: "bg-[#e6ece0] text-[#4f6540] border-[#c9d7be] dark:bg-[#263321] dark:text-[#dbe8d2] dark:border-[#506143]",
  red: "bg-[#eedbd7] text-[#7e4038] border-[#d7ada5] dark:bg-[#3b241f] dark:text-[#f1cbc3] dark:border-[#7a4b42]",
  slate: "bg-[#e7ded2] text-[#4f4137] border-[#d5c7b7] dark:bg-[#302a24] dark:text-[#e6d7c4] dark:border-[#5c5145]",
  green: "bg-[#e6ece0] text-[#4f6540] border-[#c9d7be] dark:bg-[#263321] dark:text-[#dbe8d2] dark:border-[#506143]",
  accent: "bg-[#efe0cf] text-[#794c2e] border-[#d8b48c] dark:bg-[#3a2a1d] dark:text-[#efcfab] dark:border-[#765335]",
  locked: "bg-[#ddd6ce] text-[#514942] border-[#c9bfb5] dark:bg-[#2c2925] dark:text-[#d9cdbd] dark:border-[#555049]",
};

const reviewStateColorMap = {
  needs_review: "amber",
  needs_reviewed: "amber",
  review: "amber",
  warning: "amber",
  warnings: "amber",
  missing_cost: "red",
  missing_costs: "red",
  ready_to_send: "green",
  safe_to_print: "green",
  confirmed: "green",
  complete: "green",
  completed: "green",
  archived: "slate",
  locked: "locked",
  imported: "blue",
  import: "blue",
  auto_added: "accent",
  auto_addition: "accent",
  auto_inclusion: "accent",
  excluded: "slate",
  deleted: "slate",
};

function normalizeBadgeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function StatusBadge({ label, color = "slate", className = "" }) {
  const inferredColor = typeof label === "string" ? reviewStateColorMap[normalizeBadgeKey(label)] : null;
  const resolvedColor = inferredColor || color;
  return (
    <Badge variant="outline" className={`${colorMap[resolvedColor] || colorMap.slate} border font-semibold text-[11px] tracking-[0.01em] ${className}`}>
      {label}
    </Badge>
  );
}

export { colorMap as statusBadgeColorMap, reviewStateColorMap };
