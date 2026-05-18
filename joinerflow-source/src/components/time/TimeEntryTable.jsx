import React from "react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export default function TimeEntryTable({ entries, onDelete }) {
  if (!entries || entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Time Entries</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="hidden md:table-cell">Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-base py-4">
                    {entry.date ? format(new Date(entry.date), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-base font-medium py-4">{entry.staff_name}</TableCell>
                  <TableCell className="py-4">
                    <div className="text-base">{entry.job_name}</div>
                    <div className="text-sm text-muted-foreground">{entry.job_number}</div>
                  </TableCell>
                  <TableCell className="text-base font-mono py-4">{entry.hours}h</TableCell>
                  <TableCell className="hidden md:table-cell text-base text-muted-foreground max-w-[200px] truncate py-4">
                    {entry.description || "—"}
                  </TableCell>
                  <TableCell className="py-4">
                    {entry.exported ? (
                      <Badge variant="secondary" className="text-sm px-3 py-1">Exported</Badge>
                    ) : (
                      <Badge className="text-sm px-3 py-1 bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-4">
                    {!entry.exported && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(entry.id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}