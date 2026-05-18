import React, { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function ClockInWidget({ staff }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const today = format(now, "yyyy-MM-dd");

  const { data: todayClockIns = [] } = useQuery({
    queryKey: ["clockIns", today],
    queryFn: () => crmApi.entities.ClockIn.filter({ date: today }),
    refetchInterval: 10000,
  });

  const clockInMutation = useMutation({
    mutationFn: (data) => crmApi.entities.ClockIn.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clockIns"] }),
  });

  const clockOutMutation = useMutation({
    mutationFn: ({ id, clockOutTime, totalHours }) =>
      crmApi.entities.ClockIn.update(id, { clock_out_time: clockOutTime, total_hours: totalHours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clockIns"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmApi.entities.ClockIn.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clockIns"] }),
  });

  const activeStaff = staff.filter((s) => s.status === "active");

  const getActiveSession = (staffId) =>
    todayClockIns.find((c) => c.staff_id === staffId && !c.clock_out_time);

  const handleTap = (member) => {
    const session = getActiveSession(member.id);
    if (session) {
      const outTime = new Date();
      const hours = (outTime - new Date(session.clock_in_time)) / 1000 / 3600;
      clockOutMutation.mutate({
        id: session.id,
        clockOutTime: outTime.toISOString(),
        totalHours: Math.round(hours * 100) / 100,
      });
    } else {
      clockInMutation.mutate({
        staff_id: member.id,
        staff_name: member.name,
        clock_in_time: now.toISOString(),
        date: today,
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Clock In / Clock Out
          </CardTitle>
          <span className="text-lg font-mono text-muted-foreground">
            {format(now, "EEE d MMM · HH:mm:ss")}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeStaff.map((member) => {
            const session = getActiveSession(member.id);
            const isClockedIn = !!session;
            return (
              <button
                key={member.id}
                onClick={() => handleTap(member)}
                disabled={clockInMutation.isPending || clockOutMutation.isPending}
                className={`
                  relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-5 min-h-[110px]
                  text-center font-semibold text-base transition-all active:scale-95 select-none
                  ${isClockedIn
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800 shadow-md"
                    : "border-border bg-card text-foreground hover:border-primary hover:bg-muted"
                  }
                `}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0
                  ${isClockedIn ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                  {member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="leading-tight">{member.name}</span>
                {isClockedIn ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <LogOut className="h-3.5 w-3.5" />
                    Since {format(new Date(session.clock_in_time), "HH:mm")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <LogIn className="h-3.5 w-3.5" />
                    Tap to clock in
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {todayClockIns.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today's Activity</p>
            <div className="space-y-2">
              {todayClockIns.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-sm py-1">
                  <span className="font-medium">{entry.staff_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">
                      {format(new Date(entry.clock_in_time), "HH:mm")}
                      {entry.clock_out_time && ` → ${format(new Date(entry.clock_out_time), "HH:mm")}`}
                    </span>
                    {entry.clock_out_time ? (
                      <Badge variant="secondary">{entry.total_hours}h</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(entry.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}