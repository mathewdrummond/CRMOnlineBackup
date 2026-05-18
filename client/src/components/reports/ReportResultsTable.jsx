import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { readColumnText } from "@/lib/reporting/reportingUtils";
import { cn } from "@/lib/utils";

function getPrimaryHref(row) {
  const primaryRecord = Array.isArray(row?.source_records) ? row.source_records[0] : null;
  return String(primaryRecord?.href || "").trim();
}

export default function ReportResultsTable({
  definition,
  rows = [],
  visibleColumns = [],
  sort,
  page,
  totalPages,
  totalRows,
  onSortChange,
  onPageChange,
  onOpenDrilldown,
}) {
  const columns = (definition?.columns || []).filter((column) => visibleColumns.includes(column.key));

  return (
    <Card className="rounded-2xl border-border/80 p-0 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Report Results</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalRows.toLocaleString("en-NZ")} row{totalRows === 1 ? "" : "s"} matching the current report state.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const isSorted = sort?.column === column.key;
                return (
                  <TableHead key={column.key} className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-muted-foreground transition hover:text-foreground"
                      onClick={() => onSortChange(column.key)}
                    >
                      <span>{column.label}</span>
                      {isSorted ? (
                        sort?.direction === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                );
              })}
              <TableHead className="px-4 py-3 text-right">Drill-down</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No rows to show for the selected filters.
                </TableCell>
              </TableRow>
            ) : rows.map((row) => {
              const primaryHref = getPrimaryHref(row);
              return (
                <TableRow
                  key={row.id}
                  className={cn("cursor-pointer", row.is_grouped && "bg-muted/10")}
                  onClick={() => onOpenDrilldown({
                    title: row.label || definition?.title || "Report row",
                    records: row.source_records || [],
                  })}
                >
                  {columns.map((column, columnIndex) => {
                    const text = readColumnText(column, row);
                    const isStatus = column.type === "status";
                    const canLink = columnIndex === 0 && primaryHref && !row.is_grouped;

                    return (
                      <TableCell key={column.key} className="px-4 py-3 align-top">
                        {isStatus ? (
                          <Badge variant="outline" className="bg-muted/30 text-foreground">
                            {text}
                          </Badge>
                        ) : canLink ? (
                          <Link
                            to={primaryHref}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {text}
                          </Link>
                        ) : (
                          <span className={cn(columnIndex === 0 && "font-medium text-foreground")}>{text}</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenDrilldown({
                          title: row.label || definition?.title || "Report row",
                          records: row.source_records || [],
                        });
                      }}
                    >
                      View Source
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {rows.length.toLocaleString("en-NZ")} row{rows.length === 1 ? "" : "s"} on this page.
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </Card>
  );
}
