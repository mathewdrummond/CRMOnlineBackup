import React, { useState, useEffect, useMemo } from "react";
import { crmApi } from "@/api/localApiClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
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

  const { data: todayClockIns = [], error: clockInsError } = useQuery({
    queryKey: ["clockIns", today],
    queryFn: () => crmApi.entities.ClockIn.filter({ date: today }),
    refetchInterval: 10000,
  });

  const clockInMutation = useMutation({
    mutationFn: (data) => crmApi.entities.ClockIn.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clockIns"] }),
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Clock in failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: ({ id, clockOutTime, totalHours }) =>
      crmApi.entities.ClockIn.update(id, { clock_out_time: clockOutTime, total_hours: totalHours }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clockIns"] }),
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Clock out failed",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmApi.entities.ClockIn.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clockIns"] }),
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Clock session could not be deleted",
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    },
  });

  const activeStaff = staff.filter((s) => s.status === "active");
  const staffById = useMemo(
    () =>
      new Map(
        staff.map((member) => [
          member.id,
          {
            ...member,
            name: member.name || member.staff_name || "",
          },
        ])
      ),
    [staff]
  );
  const resolvedClockIns = useMemo(
    () =>
      todayClockIns
        .map((entry) => {
          const member = staffById.get(entry.staff_id);
          return member
            ? {
                ...entry,
                staff_name: member.name,
              }
            : entry;
        })
        .sort((left, right) => String(left.clock_in_time || "").localeCompare(String(right.clock_in_time || ""))),
    [staffById, todayClockIns]
  );

  const getActiveSession = (staffId) =>
    resolvedClockIns.find((c) => c.staff_id === staffId && !c.clock_out_time);

  useEffect(() => {
    let active = true;

    const staleEntries = todayClockIns.filter((entry) => {
      const member = staffById.get(entry.staff_id);
      return member && member.name && entry.staff_name !== member.name;
    });

    if (staleEntries.length === 0) {
      return undefined;
    }

    void (async () => {
      try {
        await Promise.all(
          staleEntries.map((entry) =>
            crmApi.entities.ClockIn.update(entry.id, {
              staff_name: staffById.get(entry.staff_id)?.name || entry.staff_name,
            })
          )
        );
        if (active) {
          queryClient.invalidateQueries({ queryKey: ["clockIns"] });
        }
      } catch {
        // Keep the widget usable even if background name reconciliation fails.
      }
    })();

    return () => {
      active = false;
    };
  }, [queryClient, staffById, todayClockIns]);

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
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b border-border/50 bg-white/55 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Clock className="h-7 w-7 text-primary" />
            Clock In / Clock Out
          </CardTitle>
          <span className="min-w-[15ch] text-left font-mono text-xl font-semibold text-foreground tabular-nums sm:text-right sm:text-2xl">
            {format(now, "EEE d MMM · HH:mm:ss")}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        {clockInsError ? (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{clockInsError instanceof Error ? clockInsError.message : "Clock activity could not be loaded."}</span>
              <Button type="button" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["clockIns"] })}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {activeStaff.map((member) => {
            const session = getActiveSession(member.id);
            const isClockedIn = !!session;
            return (
              <button
                key={member.id}
                onClick={() => handleTap(member)}
                disabled={clockInMutation.isPending || clockOutMutation.isPending}
                className={`
                  relative flex min-h-[156px] flex-col items-center justify-center gap-3 rounded-[10px] border px-4 py-5
                  text-center text-lg font-semibold transition-all active:scale-[0.98] select-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2
                  ${isClockedIn
                    ? "border-[#c9d7be] bg-[#e6ece0] text-[#4f6540] shadow-md"
                    : "border-border/60 bg-white/70 text-foreground hover:border-primary/40 hover:bg-muted/35"
                  }
                `}
              >
                <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold
                  ${isClockedIn ? "bg-[#4f6540] text-white" : "bg-muted text-muted-foreground"}`}>
                  {member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <span className="line-clamp-2 leading-tight">{member.name}</span>
                {isClockedIn ? (
                  <span className="flex items-center gap-1 text-sm text-[#4f6540]">
                    <LogOut className="h-3.5 w-3.5" />
                    Clocked in since {format(new Date(session.clock_in_time), "HH:mm")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <LogIn className="h-3.5 w-3.5" />
                    Tap to clock in
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {resolvedClockIns.length > 0 && (
          <div className="space-y-2 border-t border-border/45 pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Today's Activity</p>
            <div className="space-y-2">
              {resolvedClockIns.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 rounded-[10px] border border-border/55 bg-white/55 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-base font-semibold">{entry.staff_name}</span>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {format(new Date(entry.clock_in_time), "HH:mm")}
                      {entry.clock_out_time && ` → ${format(new Date(entry.clock_out_time), "HH:mm")}`}
                    </span>
                    {entry.clock_out_time ? (
                      <Badge variant="secondary">{entry.total_hours}h</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                    )}
                    <button
                      onClick={() => {
                        if (!window.confirm(`Delete ${entry.staff_name}'s clock session?`)) {
                          return;
                        }
                        deleteMutation.mutate(entry.id);
                      }}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-destructive"
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
