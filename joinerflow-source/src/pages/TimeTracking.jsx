import { useState, useEffect } from "react";
import { crmApi } from "@/api/localApiClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "../components/PageHeader";
import ClockInTab from "../components/time/ClockInTab";
import TimesheetTab from "../components/time/TimesheetTab";
import ExportTab from "../components/time/ExportTab";

export default function TimeTracking() {
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const u = await crmApi.auth.me();
    setUser(u);
    const [s, j] = await Promise.all([
      crmApi.entities.Staff.filter({ status: "active" }, "name", 100),
      crmApi.entities.Job.filter({ status: "active" }, "job_number", 200),
    ]);
    setStaff(s);
    setJobs(j);
    setLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <PageHeader title="Time Tracking" subtitle="SyncTime — Clock In, Timesheets & MYOB Export" />
      <Tabs defaultValue="clockin">
        <TabsList className="mb-6">
          <TabsTrigger value="clockin">Clock In / Out</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets</TabsTrigger>
          <TabsTrigger value="export">MYOB Export</TabsTrigger>
        </TabsList>
        <TabsContent value="clockin">
          <ClockInTab user={user} staff={staff} jobs={jobs} />
        </TabsContent>
        <TabsContent value="timesheets">
          <TimesheetTab staff={staff} jobs={jobs} />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab user={user} staff={staff} />
        </TabsContent>
      </Tabs>
    </div>
  );
}