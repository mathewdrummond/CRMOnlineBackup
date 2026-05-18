import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, MoreHorizontal, Save } from "lucide-react";

export default function ReportViewsBar({
  views = [],
  selectedViewId,
  selectedView,
  hasUnsavedChanges,
  onSelectView,
  onSaveNew,
  onUpdateSelected,
  onRenameSelected,
  onDeleteSelected,
  onSetDefaultSelected,
  onExport,
  exporting,
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-foreground">Saved Views</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={selectedViewId || "__none__"} onValueChange={(value) => onSelectView(value === "__none__" ? "" : value)}>
              <SelectTrigger className="sm:max-w-md">
                <SelectValue placeholder="Select a saved view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Current report state</SelectItem>
                {views.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    {view.name}{view.is_default ? " · Default" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={onSaveNew}>
              <Save className="h-4 w-4" />
              Save New View
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedView}
              onClick={onUpdateSelected}
            >
              Update Selected
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedView
              ? hasUnsavedChanges
                ? `Viewing "${selectedView.name}" with unsaved changes.`
                : `Viewing "${selectedView.name}".`
              : "Save common report setups so filters, grouping, sorting, and visible columns restore instantly."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" disabled={exporting}>
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export Current Result Set</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onExport("csv")}>
                <FileText className="h-4 w-4" />
                CSV Export
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("xlsx")}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel Export
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("pdf")}>
                <FileText className="h-4 w-4" />
                PDF / Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" disabled={!selectedView}>
                <MoreHorizontal className="h-4 w-4" />
                Manage View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Selected View</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRenameSelected}>Rename View</DropdownMenuItem>
              <DropdownMenuItem onClick={onSetDefaultSelected}>
                {selectedView?.is_default ? "Keep as Default" : "Set as Default"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDeleteSelected}>
                Delete View
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
