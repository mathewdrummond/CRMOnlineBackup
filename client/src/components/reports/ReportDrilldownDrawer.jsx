import { Link } from "react-router-dom";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/helpers";
import { formatHours } from "@/lib/reporting/reportingUtils";

export default function ReportDrilldownDrawer({ open, onOpenChange, drilldown }) {
  const records = Array.isArray(drilldown?.records) ? drilldown.records : [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto h-[85vh] max-w-6xl rounded-t-2xl">
        <DrawerHeader className="border-b border-border/70">
          <DrawerTitle>{drilldown?.title || "Source Records"}</DrawerTitle>
          <DrawerDescription>
            {records.length.toLocaleString("en-NZ")} source record{records.length === 1 ? "" : "s"} behind the selected result.
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-auto px-4 pb-6">
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 py-3">Record</TableHead>
                <TableHead className="px-4 py-3">Type</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
                <TableHead className="px-4 py-3">Date</TableHead>
                <TableHead className="px-4 py-3">Customer</TableHead>
                <TableHead className="px-4 py-3">Job</TableHead>
                <TableHead className="px-4 py-3 text-right">Amount</TableHead>
                <TableHead className="px-4 py-3 text-right">Hours</TableHead>
                <TableHead className="px-4 py-3 text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No source records are available for this selection.
                  </TableCell>
                </TableRow>
              ) : records.map((record, index) => (
                <TableRow key={`${record.entity}:${record.id}:${index}`}>
                  <TableCell className="px-4 py-3 align-top">
                    <div className="min-w-[220px]">
                      <div className="font-medium text-foreground">{record.title || record.label || "Untitled record"}</div>
                      {record.subtitle ? (
                        <div className="mt-1 text-sm text-muted-foreground">{record.subtitle}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {record.entity}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {record.status ? (
                      <Badge variant="outline" className="bg-muted/30 text-foreground">
                        {record.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {record.date ? formatDate(record.date) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {record.customer || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {record.job_label || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm text-foreground">
                    {Number(record.amount || 0) !== 0 ? formatCurrency(record.amount) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm text-foreground">
                    {Number(record.hours || 0) !== 0 ? formatHours(record.hours) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {record.href ? (
                      <Link
                        to={record.href}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        Open
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
