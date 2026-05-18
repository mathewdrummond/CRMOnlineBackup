import { Badge } from "@/components/ui/badge";

const colorMap = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  cyan: "bg-cyan-100 text-cyan-700 border-cyan-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  pink: "bg-pink-100 text-pink-700 border-pink-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  teal: "bg-teal-100 text-teal-700 border-teal-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  red: "bg-red-100 text-red-700 border-red-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
  green: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function StatusBadge({ label, color = "slate", className = "" }) {
  return (
    <Badge variant="outline" className={`${colorMap[color] || colorMap.slate} border font-medium text-xs ${className}`}>
      {label}
    </Badge>
  );
}