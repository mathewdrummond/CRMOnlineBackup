import { useEffect, useMemo, useRef, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import {
  buildAssignedStaffDisplay,
  getAssignedStaffMembers,
  resolveAssignedStaffIds,
} from "@/lib/staffIdentity";

export default function StaffMultiSelect({
  value,
  selectedIds,
  onChange,
  placeholder = "Search staff...",
}) {
  const containerRef = useRef(null);
  const [staff, setStaff] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void crmApi.entities.Staff.list("name").then((records) => {
      if (!active) {
        return;
      }

      setStaff(Array.isArray(records) ? records : []);
      setLoadError("");
    }).catch((error) => {
      if (!active) {
        return;
      }

      setStaff([]);
      setLoadError(error instanceof Error ? error.message : "Staff list unavailable");
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const resolvedSelectedIds = useMemo(
    () => resolveAssignedStaffIds({ assignedStaffIds: selectedIds, assignedTo: value, staff }),
    [selectedIds, staff, value]
  );
  const selectedMembers = useMemo(
    () => getAssignedStaffMembers({ assignedStaffIds: resolvedSelectedIds, assignedTo: value, staff }),
    [resolvedSelectedIds, staff, value]
  );

  const selectableStaff = staff.filter((member) => {
    const memberName = String(member.name || "").trim();
    if (!memberName) {
      return false;
    }

    const isSelected = resolvedSelectedIds.includes(String(member.id || "").trim());
    const isActive = String(member.status || "active").toLowerCase() === "active";
    const loweredQuery = query.trim().toLowerCase();
    const matchesQuery = loweredQuery === ""
      || memberName.toLowerCase().includes(loweredQuery)
      || String(member.employee_id || "").trim().toLowerCase().includes(loweredQuery);

    return !isSelected && isActive && matchesQuery;
  });

  const commitSelection = (nextIds) => {
    const display = buildAssignedStaffDisplay(nextIds, staff, value);
    const members = getAssignedStaffMembers({ assignedStaffIds: nextIds, staff });
    onChange(display, nextIds, members);
  };

  const addStaffMember = (staffId) => {
    const nextIds = [...resolvedSelectedIds, staffId];
    commitSelection(nextIds);
    setQuery("");
    setOpen(false);
  };

  const removeStaffMember = (staffId) => {
    const nextIds = resolvedSelectedIds.filter((item) => item !== staffId);
    commitSelection(nextIds);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="rounded-md border bg-transparent px-3 py-2">
        {selectedMembers.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedMembers.map((member) => (
              <Badge key={member.id} variant="secondary" className="gap-1 pr-1">
                <span>{member.name}</span>
                <button
                  type="button"
                  onClick={() => removeStaffMember(member.id)}
                  className="rounded-full p-0.5 hover:bg-background/70"
                  aria-label={`Remove ${member.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <Input
          value={query}
          placeholder={selectedMembers.length > 0 ? "Add another staff member..." : placeholder}
          className="h-7 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {loadError ? (
            <div className="px-3 py-2 text-sm text-destructive">{loadError}</div>
          ) : selectableStaff.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matching staff members.</div>
          ) : (
            selectableStaff.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => addStaffMember(member.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
              >
                <span className="text-sm font-medium">{member.name}</span>
                {member.employee_id && <span className="text-xs text-muted-foreground">{member.employee_id}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
