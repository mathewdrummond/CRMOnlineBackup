import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/helpers";
import { formatHours, formatPercent } from "@/lib/reporting/reportingUtils";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = ["#1d4ed8", "#0f766e", "#d97706", "#be123c", "#7c3aed", "#0891b2", "#16a34a", "#9333ea"];

function formatAxisValue(value, chart) {
  if (chart?.valueType === "currency") {
    return formatCurrency(value);
  }
  if (chart?.valueType === "hours") {
    return formatHours(value);
  }
  if (chart?.valueType === "percent") {
    return formatPercent(value);
  }

  return Number(value || 0).toLocaleString("en-NZ");
}

function renderTooltip(chart) {
  return (value) => formatAxisValue(value, chart);
}

export default function ReportChartPanel({ chart, onOpenDrilldown }) {
  if (!chart) {
    return null;
  }

  const interactive = typeof onOpenDrilldown === "function";
  const openPoint = (point) => {
    if (!interactive || !Array.isArray(point?.source_records) || point.source_records.length === 0) {
      return;
    }

    onOpenDrilldown({
      title: point.label || chart.title,
      records: point.source_records,
    });
  };

  return (
    <Card className="rounded-2xl border-border/80 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{chart.title}</h3>
        {chart.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{chart.description}</p>
        ) : null}
      </div>

      {!Array.isArray(chart.data) || chart.data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 text-sm text-muted-foreground">
          No chart data for the current filters.
        </div>
      ) : chart.type === "pie" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart.data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={3}
                  onClick={openPoint}
                >
                  {chart.data.map((entry, index) => (
                    <Cell key={entry.key || index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={renderTooltip(chart)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {chart.data.map((entry, index) => (
              <button
                key={entry.key || entry.label || index}
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-muted/30"
                onClick={() => openPoint(entry)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="text-sm text-foreground">{entry.label}</span>
                </div>
                <span className="text-sm font-medium text-foreground">{formatAxisValue(entry.value, chart)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : chart.type === "line" ? (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart.data} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => formatAxisValue(value, chart)} />
              <Tooltip formatter={renderTooltip(chart)} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1d4ed8"
                strokeWidth={3}
                dot={{ r: 4, fill: "#1d4ed8" }}
                activeDot={{ r: 6 }}
                onClick={openPoint}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart.data} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => formatAxisValue(value, chart)} />
              <Tooltip formatter={renderTooltip(chart)} />
              <Bar dataKey="value" fill="#1d4ed8" radius={[6, 6, 0, 0]} onClick={openPoint} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
