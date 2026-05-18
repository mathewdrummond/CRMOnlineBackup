import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildActiveFilterBadges,
  prettifyReportValue,
  REPORT_DATE_PRESETS,
} from "@/lib/reporting/reportingUtils";
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "lucide-react";

function FilterSelect({ label, value, onChange, options = [], placeholder = "All" }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || "__all__"} onValueChange={(nextValue) => onChange(nextValue === "__all__" ? "" : nextValue)}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ReportFilters({
  definition,
  filters,
  filterOptions,
  grouping,
  sort,
  visibleColumns,
  onFilterChange,
  onGroupingChange,
  onSortFieldChange,
  onSortDirectionToggle,
  onToggleColumn,
  onReset,
}) {
  const activeBadges = buildActiveFilterBadges(filters, filterOptions);
  const visibleColumnCount = (visibleColumns || []).length;

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Filters & Layout</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Combine filters, adjust grouping, and control visible columns for this report.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <SlidersHorizontal className="h-4 w-4" />
                Columns ({visibleColumnCount})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Visible Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {definition.columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={visibleColumns.includes(column.key)}
                  onCheckedChange={() => onToggleColumn(column.key)}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Date Range</Label>
          <Select value={filters.datePreset || "this_month"} onValueChange={(value) => onFilterChange("datePreset", value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_DATE_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filters.datePreset === "custom" ? (
          <>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={filters.startDate || ""} onChange={(event) => onFilterChange("startDate", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={filters.endDate || ""} onChange={(event) => onFilterChange("endDate", event.target.value)} />
            </div>
          </>
        ) : null}

        <div className="space-y-1.5">
          <Label>Grouping</Label>
          <Select value={grouping || "none"} onValueChange={onGroupingChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {definition.groupings.map((groupOption) => (
                <SelectItem key={groupOption.key} value={groupOption.key}>
                  {groupOption.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Sort By</Label>
          <div className="flex gap-2">
            <Select value={sort.column} onValueChange={onSortFieldChange}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {definition.columns.map((column) => (
                  <SelectItem key={column.key} value={column.key}>
                    {column.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={onSortDirectionToggle}>
              {sort.direction === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {definition.supportedFilters.customer ? (
          <FilterSelect
            label="Customer"
            value={filters.customer}
            onChange={(value) => onFilterChange("customer", value)}
            options={filterOptions.customer}
          />
        ) : null}
        {definition.supportedFilters.job ? (
          <FilterSelect
            label="Project / Job"
            value={filters.job}
            onChange={(value) => onFilterChange("job", value)}
            options={filterOptions.job}
          />
        ) : null}
        {definition.supportedFilters.staff ? (
          <FilterSelect
            label="Staff"
            value={filters.staff}
            onChange={(value) => onFilterChange("staff", value)}
            options={filterOptions.staff}
          />
        ) : null}
        {definition.supportedFilters.status ? (
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => onFilterChange("status", value)}
            options={filterOptions.status}
          />
        ) : null}
        {definition.supportedFilters.category ? (
          <FilterSelect
            label={definition.packKey === "operations" ? "Type / Phase" : "Type / Category"}
            value={filters.category}
            onChange={(value) => onFilterChange("category", value)}
            options={filterOptions.category}
          />
        ) : null}
        {definition.supportedFilters.source ? (
          <FilterSelect
            label="Source / Channel"
            value={filters.source}
            onChange={(value) => onFilterChange("source", value)}
            options={filterOptions.source}
          />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {activeBadges.map((badge) => (
          <Badge key={badge.key} variant="outline" className="bg-muted/30 text-foreground">
            {badge.label || prettifyReportValue(badge.key)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
