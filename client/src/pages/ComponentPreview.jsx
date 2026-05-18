import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  PackageCheck,
  Search,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const previewRows = [
  { job: "JOB-1001", client: "Tui Apartments", status: "Ready", health: "On track", value: "$18,420" },
  { job: "JOB-1002", client: "Grey Lynn Villa", status: "Scheduled", health: "Watch", value: "$42,850" },
  { job: "JOB-1003", client: "Retail Fitout", status: "Production", health: "At risk", value: "$31,900" },
];

export default function ComponentPreview() {
  const [dialogOpen, setDialogOpen] = useState(true);

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6" data-testid="component-preview">
      <PageHeader
        title="Component Preview"
        subtitle="Stable visual baselines for shared UI primitives, dense data surfaces, forms, and overlays."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2"><Search className="h-4 w-4" />Secondary</Button>
            <Button className="gap-2"><PackageCheck className="h-4 w-4" />Primary action</Button>
          </div>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Operational Cards</CardTitle>
            <CardDescription>Cards, badges, status chips, icons, and table density.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Ready Jobs", "12", CheckCircle2, "green"],
                ["Install Watch", "4", Clock3, "amber"],
                ["Needs Review", "2", AlertTriangle, "red"],
              ].map(([label, value, Icon, color]) => (
                <div key={label} className="rounded-xl border bg-muted/10 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{value}</p>
                  <div className="mt-2"><StatusBadge label={color === "green" ? "Healthy" : color === "amber" ? "Watch" : "Risk"} color={color} /></div>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">Job</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Health</th>
                    <th className="px-4 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.job}>
                      <td className="px-4 py-3 font-medium">{row.job}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.client}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{row.status}</Badge></td>
                      <td className="px-4 py-3">{row.health}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forms & Feedback</CardTitle>
            <CardDescription>Inputs, selects, tabs, alerts, and compact form rhythm.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle>Quote ready for review</AlertTitle>
              <AlertDescription>Pricing, materials, and installation notes are aligned for approval.</AlertDescription>
            </Alert>

            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="preview-job">Job name</Label>
                    <Input id="preview-job" value="Kitchen install" readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select defaultValue="ready">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ready">Ready</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3 text-sm">
                  <Checkbox checked readOnly />
                  <span>
                    <span className="block font-medium">Include production handover</span>
                    <span className="block text-muted-foreground">Show workshop-ready files and notes.</span>
                  </span>
                </label>
              </TabsContent>
              <TabsContent value="notes">
                <Textarea value="Client prefers morning install. Confirm access by Friday." readOnly rows={4} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview Dialog</DialogTitle>
            <DialogDescription>Stable overlay baseline covering dialog spacing, typography, and controls.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This dialog intentionally opens on the preview route so visual checks cover overlay primitives.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
