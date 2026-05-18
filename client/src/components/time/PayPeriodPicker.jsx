import React, { useState, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

const PERIODS = [
  { id: "week", label: "Week" },
  { id: "fortnight", label: "Fortnight" },
  { id: "custom", label: "Custom" },
];

const weekStart = (date) => startOfWeek(date, { weekStartsOn: 1 });
const weekEnd = (date) => endOfWeek(date, { weekStartsOn: 1 });

function resolvePresetAnchor(preset) {
  if (!preset?.anchorDate) {
    return weekStart(new Date());
  }

  const parsed = new Date(preset.anchorDate);
  return Number.isNaN(parsed.getTime()) ? weekStart(new Date()) : weekStart(parsed);
}

export default function PayPeriodPicker({ onRangeChange, preset = null }) {
  const [mode, setMode] = useState(preset?.mode || "week");
  const [anchor, setAnchor] = useState(resolvePresetAnchor(preset));
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const getRangeForAnchor = (a, m) => {
    if (m === "week") return { from: weekStart(a), to: weekEnd(a) };
    if (m === "fortnight") return { from: weekStart(a), to: addDays(weekStart(a), 13) };
    return null;
  };

  const currentRange = mode !== "custom" ? getRangeForAnchor(anchor, mode) : null;

  const navigate = (dir) => {
    const weeks = mode === "fortnight" ? 2 : 1;
    setAnchor((prev) => dir === "next" ? addWeeks(prev, weeks) : subWeeks(prev, weeks));
  };

  const handleModeChange = (m) => {
    setMode(m);
    if (m !== "custom") {
      const range = getRangeForAnchor(anchor, m);
      onRangeChange({ from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") });
    }
  };

  useEffect(() => {
    if (mode !== "custom") {
      const range = getRangeForAnchor(anchor, mode);
      onRangeChange({ from: format(range.from, "yyyy-MM-dd"), to: format(range.to, "yyyy-MM-dd") });
    }
  }, [anchor, mode]);

  useEffect(() => {
    if (!preset?.key) {
      return;
    }

    setMode(preset.mode || "week");
    setAnchor(resolvePresetAnchor(preset));
    setCustomFrom("");
    setCustomTo("");
  }, [preset?.key]);

  const handleCustomApply = () => {
    if (customFrom && customTo) onRangeChange({ from: customFrom, to: customTo });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold text-base">Pay Period</span>
        </div>

        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleModeChange(p.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === p.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {mode !== "custom" && currentRange && (
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="text-base font-medium min-w-[220px] text-center">
              {format(currentRange.from, "d MMM yyyy")} — {format(currentRange.to, "d MMM yyyy")}
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => navigate("next")}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" className="ml-2 text-sm" onClick={() => setAnchor(weekStart(new Date()))}>
              Today
            </Button>
          </div>
        )}

        {mode === "custom" && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-sm">From</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 text-base w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">To</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 text-base w-44" />
            </div>
            <Button onClick={handleCustomApply} disabled={!customFrom || !customTo} className="h-10">Apply</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
