import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "../../lib/helpers";

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

export default function ReportsCharts({ pipelineData, jobStatusData, quoteHealthData, labourData }) {
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Lead Pipeline by Stage</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pipelineData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value, name) => name === "value" ? formatCurrency(value) : value} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Jobs by Status</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={jobStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" paddingAngle={3}>
                  {jobStatusData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {jobStatusData.map((row, index) => (
                <div key={row.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: COLORS[index % COLORS.length] }} /><span>{row.name}</span></div>
                  <span className="font-semibold">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Quote Health</h3>
          {quoteHealthData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No open quote pressure right now.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={quoteHealthData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4">Labour Hours by Operation</h3>
          {labourData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No time entries yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={labourData} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="hours" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </>
  );
}
