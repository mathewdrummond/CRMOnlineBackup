import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { closestCenter, DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, subMonths, subWeeks } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, ExternalLink, MoveDiagonal2, Plus } from "lucide-react";
import { crmApi } from "@/api/localApiClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import AddressAutocompleteInput from "@/components/AddressAutocompleteInput";
import PageHeader from "../components/PageHeader";
import GuidedWorkflow from "../components/GuidedWorkflow";
import ScheduleBacklogCard from "../components/schedule/ScheduleBacklogCard";
import TimelineLane from "../components/schedule/TimelineLane";
import { TimelineItemCard } from "../components/schedule/TimelineItem";
import {
  buildInstallationTimelineState,
  buildInstallLoadModel,
  buildInstallPlannerLanes,
  buildInstallMoveRange,
  buildInstallResizeRange,
  emptyInstallForm,
  INSTALL_PRIORITY_OPTIONS,
  INSTALL_TYPE_OPTIONS,
  mergeInstallPlannerMutationResult,
  sanitizeInstallForm,
  UNASSIGNED_INSTALL_LANE_ID,
} from "../lib/installSchedule";
import {
  buildSectionSegments,
  getLaneRowCount,
  getTimelineSections,
  layoutTimelineSegments,
  normaliseDateString,
} from "../lib/scheduleTimeline";

const LABEL_COLUMN_WIDTH = 220;
const SCHEDULE_VIEWS = new Set(["month", "work", "week", "2week"]);
const FILTER_OPTIONS = [
  { value: "all", label: "All Installs" },
  { value: "scheduled", label: "Scheduled Only" },
  { value: "needs_planning", label: "Needs Planning" },
  { value: "multi_day", label: "Multi-Day" },
  { value: "job_date_only", label: "Job Dates Only" },
];
const INSTALL_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "on_hold", label: "On Hold" },
];

function buildRangeLabel(view, currentDate, sections) {
  if (view === "month") {
    return format(currentDate, "MMMM yyyy");
  }

  const firstSection = sections[0];
  if (!firstSection?.days?.length) {
    return format(currentDate, "MMMM yyyy");
  }

  return `${format(firstSection.days[0], "d MMM")} – ${format(firstSection.days[firstSection.days.length - 1], "d MMM yyyy")}`;
}

function getInstallMetricGridClass() {
  return "sm:grid-cols-2 xl:grid-cols-6";
}

function getTimelineSectionMinWidth(dayCount, view) {
  const dayWidth = view === "month" ? 76 : view === "2week" ? 88 : 104;
  return LABEL_COLUMN_WIDTH + dayCount * dayWidth;
}

function countVisibleItems(sectionSegments = []) {
  return new Set(sectionSegments.map((segment) => segment.recordId || segment.id)).size;
}

function sameRange(item, nextRange) {
  return (
    String(item?.startDate || "") === String(nextRange?.start_date || "")
    && String(item?.endDate || item?.startDate || "") === String(nextRange?.end_date || nextRange?.start_date || "")
    && String(item?.laneId || "") === String(nextRange?.lane_id || item?.laneId || "")
  );
}

function spanDaysLabel(startDate, endDate) {
  if (!startDate) {
    return "Not scheduled";
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${(endDate || startDate)}T00:00:00`);
  const spanDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  return spanDays === 1 ? "Single-day install" : `${spanDays}-day install`;
}

function formatDisplayDate(value) {
  return value ? format(new Date(`${value}T00:00:00`), "EEE d MMM yyyy") : "Not scheduled";
}

function buildDefaultCrewForm() {
  return {
    id: "",
    name: "",
    is_active: true,
    assigned_staff_ids: [],
    default_daily_capacity: "10.5",
    skills_text: "",
    notes: "",
    color: "emerald",
  };
}

function buildEstimatorForm(settings = {}) {
  return {
    id: String(settings.id || ""),
    name: String(settings.name || "Default Install Estimator"),
    base_install_hours: String(settings.base_install_hours ?? "2"),
    hours_per_cabinet: String(settings.hours_per_cabinet ?? "1.15"),
    hours_per_drawer: String(settings.hours_per_drawer ?? "0.3"),
    hours_per_door_front: String(settings.hours_per_door_front ?? "0.18"),
    hours_per_tall_unit: String(settings.hours_per_tall_unit ?? "0.85"),
    hours_per_panel: String(settings.hours_per_panel ?? "0.2"),
    minimum_duration_hours: String(settings.minimum_duration_hours ?? "4"),
    rounding_rule: String(settings.rounding_rule || "nearest_half_day"),
    default_complexity: String(settings.default_complexity || "standard"),
    crew_size_two_person_hours: String(settings.crew_size_two_person_hours ?? "10.5"),
    crew_size_three_person_hours: String(settings.crew_size_three_person_hours ?? "21"),
    crew_size_four_person_hours: String(settings.crew_size_four_person_hours ?? "31.5"),
    is_default: settings.is_default !== false,
    is_active: settings.is_active !== false,
  };
}

function nextWorkingDateKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  return format(date, "yyyy-MM-dd");
}

export default function Schedule() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = SCHEDULE_VIEWS.has(searchParams.get("view")) ? searchParams.get("view") : "month";
  const [operations, setOperations] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [crews, setCrews] = useState([]);
  const [lanes, setLanes] = useState([]);
  const [estimatorSettings, setEstimatorSettings] = useState(null);
  const [jobEstimates, setJobEstimates] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState(initialView);
  const [filterMode, setFilterMode] = useState("all");
  const [laneMode, setLaneMode] = useState("unified");
  const [staffFilter, setStaffFilter] = useState("all");
  const [installTypeFilter, setInstallTypeFilter] = useState("all");
  const [laneFilter, setLaneFilter] = useState("all");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [activeDragData, setActiveDragData] = useState(null);
  const [activeDropDateKey, setActiveDropDateKey] = useState("");
  const [savingRecordId, setSavingRecordId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editingTarget, setEditingTarget] = useState({ type: "", id: "" });
  const [installForm, setInstallForm] = useState(emptyInstallForm());
  const [crewSettingsOpen, setCrewSettingsOpen] = useState(false);
  const [crewForm, setCrewForm] = useState(buildDefaultCrewForm());
  const [savingCrew, setSavingCrew] = useState(false);
  const [estimatorSettingsOpen, setEstimatorSettingsOpen] = useState(false);
  const [estimatorForm, setEstimatorForm] = useState(buildEstimatorForm());
  const [savingEstimator, setSavingEstimator] = useState(false);
  const pointerDragCleanupRef = useRef(() => {});

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    })
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await crmApi.installPlanner.getEntries();
      setOperations(Array.isArray(response?.operations) ? response.operations : []);
      setJobs(Array.isArray(response?.jobs) ? response.jobs : []);
      setStaff(Array.isArray(response?.staff) ? response.staff : []);
      setCrews(Array.isArray(response?.crews) ? response.crews : []);
      setLanes(Array.isArray(response?.lanes) ? response.lanes : []);
      setEstimatorSettings(response?.estimator_settings || null);
      setEstimatorForm(buildEstimatorForm(response?.estimator_settings || {}));
      setJobEstimates(response?.job_estimates && typeof response.job_estimates === "object" ? response.job_estimates : {});
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Install planner unavailable",
        description: error instanceof Error ? error.message : "Failed to load the install planner.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => () => {
    pointerDragCleanupRef.current?.();
  }, []);

  useEffect(() => {
    const paramView = searchParams.get("view");
    if (paramView && SCHEDULE_VIEWS.has(paramView) && paramView !== view) {
      setView(paramView);
    }
  }, [searchParams, view]);

  const handleViewChange = (nextView) => {
    setView(nextView);
    const nextParams = new URLSearchParams(searchParams);
    if (nextView === "month") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", nextView);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const sections = useMemo(() => getTimelineSections(currentDate, view), [currentDate, view]);
  const rangeLabel = useMemo(() => buildRangeLabel(view, currentDate, sections), [view, currentDate, sections]);
  const plannerLanes = useMemo(() => buildInstallPlannerLanes(lanes, laneMode), [lanes, laneMode]);
  const timelineState = useMemo(
    () => buildInstallationTimelineState(jobs, operations, filterMode, {
      staff,
      lanes: plannerLanes,
      laneMode,
      staffFilter,
      installTypeFilter,
      selectedLaneId: laneFilter,
    }),
    [jobs, operations, filterMode, staff, plannerLanes, laneMode, staffFilter, installTypeFilter, laneFilter]
  );
  const allTimelineItems = useMemo(
    () => [...timelineState.scheduledItems, ...timelineState.unscheduledItems],
    [timelineState]
  );

  const sectionLayouts = useMemo(
    () =>
      sections.map((section) => {
        const laneLayouts = timelineState.lanes.map((lane) => {
          const laneItems = timelineState.scheduledItems.filter((item) => String(item.laneId || "") === String(lane.id));
          const laidOutSegments = layoutTimelineSegments(
            buildSectionSegments(laneItems, section.days)
          );
          const loadModel = buildInstallLoadModel(laneItems, section.days);
          return {
            lane,
            segments: laidOutSegments,
            rowCount: getLaneRowCount(laidOutSegments),
            loadModel,
            loadSummary: {
              scheduledItems: countVisibleItems(laidOutSegments),
              activeDays: loadModel.activeDays,
              busyDays: loadModel.busyDays,
              busiestDay: loadModel.busiestDay,
              loadPercent: section.days.length > 0 ? Math.round((loadModel.activeDays / section.days.length) * 100) : 0,
            },
          };
        });
        const loadModel = buildInstallLoadModel(timelineState.scheduledItems, section.days);
        return {
          ...section,
          lanes: laneLayouts,
          loadModel,
        };
      }),
    [sections, timelineState.scheduledItems, timelineState.lanes]
  );

  const visibleDays = useMemo(() => sectionLayouts.flatMap((section) => section.days), [sectionLayouts]);
  const visibleLoadModel = useMemo(
    () => buildInstallLoadModel(timelineState.scheduledItems, visibleDays),
    [timelineState.scheduledItems, visibleDays]
  );

  const activeOverlayItem = useMemo(() => {
    if (!activeDragData?.itemId) {
      return null;
    }
    return allTimelineItems.find((item) => item.id === activeDragData.itemId) || null;
  }, [activeDragData, allTimelineItems]);

  const activeDragItemId = activeDragData?.itemId || "";
  const multiDayInstallCount = useMemo(
    () => timelineState.scheduledItems.filter((item) => String(item.endDate || "") > String(item.startDate || "")).length,
    [timelineState.scheduledItems]
  );
  const next14DayInstallCount = useMemo(() => {
    const today = new Date();
    return timelineState.scheduledItems.filter((item) => {
      if (!item.startDate) {
        return false;
      }
      const installDate = new Date(`${item.startDate}T00:00:00`);
      const dayDiff = differenceInCalendarDays(installDate, today);
      return dayDiff >= 0 && dayDiff <= 14;
    }).length;
  }, [timelineState.scheduledItems]);

  const resetEditor = () => {
    setEditorOpen(false);
    setEditorMode("create");
    setEditingTarget({ type: "", id: "" });
    setSelectedItemId("");
    setInstallForm(emptyInstallForm());
  };

  const applyPlannerMutation = (mutationResult) => {
    const merged = mergeInstallPlannerMutationResult({ jobs, operations, staff, crews, lanes, estimatorSettings, jobEstimates }, mutationResult);
    setJobs(merged.jobs);
    setOperations(merged.operations);
    setStaff(merged.staff);
    setCrews(merged.crews);
    setLanes(merged.lanes);
    setEstimatorSettings(merged.estimatorSettings);
    setEstimatorForm(buildEstimatorForm(merged.estimatorSettings || {}));
    setJobEstimates(merged.jobEstimates || {});
    return mutationResult;
  };

  const saveInstallEntry = async (payload) => {
    const result = await crmApi.installPlanner.saveEntry(payload);
    return applyPlannerMutation(result);
  };

  const deleteInstallEntry = async (payload) => {
    const result = await crmApi.installPlanner.deleteEntry(payload);
    return applyPlannerMutation(result);
  };

  const openCrewSettings = (crew = null) => {
    setCrewForm(crew
      ? {
        id: String(crew.id || ""),
        name: String(crew.name || ""),
        is_active: crew.is_active !== false,
        assigned_staff_ids: Array.isArray(crew.assigned_staff_ids) ? crew.assigned_staff_ids : [],
        default_daily_capacity: String(crew.default_daily_capacity ?? "10.5"),
        skills_text: Array.isArray(crew.skills) ? crew.skills.join(", ") : String(crew.skills || ""),
        notes: String(crew.notes || ""),
        color: String(crew.color || "emerald"),
      }
      : buildDefaultCrewForm());
    setCrewSettingsOpen(true);
  };

  const handleSaveCrew = async () => {
    const name = String(crewForm.name || "").trim();
    if (!name) {
      toast({
        variant: "destructive",
        title: "Crew name required",
        description: "Give the crew a name before saving it.",
      });
      return;
    }

    setSavingCrew(true);
    try {
      const payload = {
        name,
        is_active: Boolean(crewForm.is_active),
        assigned_staff_ids: Array.isArray(crewForm.assigned_staff_ids) ? crewForm.assigned_staff_ids : [],
        assigned_staff_names: staff
          .filter((member) => (crewForm.assigned_staff_ids || []).includes(member.id))
          .map((member) => member.name),
        default_daily_capacity: Number(crewForm.default_daily_capacity || 10.5) || 10.5,
        skills: String(crewForm.skills_text || "").split(/[|,;]+/).map((item) => item.trim()).filter(Boolean),
        notes: String(crewForm.notes || "").trim(),
        color: String(crewForm.color || "emerald").trim() || "emerald",
      };

      if (crewForm.id) {
        await crmApi.entities.Crew.update(crewForm.id, payload);
      } else {
        await crmApi.entities.Crew.create(payload);
      }
      await loadData();
      setCrewSettingsOpen(false);
      setCrewForm(buildDefaultCrewForm());
      toast({ title: crewForm.id ? "Crew updated" : "Crew created" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save crew",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSavingCrew(false);
    }
  };

  const handleSaveEstimator = async () => {
    setSavingEstimator(true);
    try {
      const payload = {
        name: String(estimatorForm.name || "Default Install Estimator").trim() || "Default Install Estimator",
        is_default: Boolean(estimatorForm.is_default),
        is_active: Boolean(estimatorForm.is_active),
        base_install_hours: Number(estimatorForm.base_install_hours || 2) || 2,
        hours_per_cabinet: Number(estimatorForm.hours_per_cabinet || 1.15) || 1.15,
        hours_per_drawer: Number(estimatorForm.hours_per_drawer || 0.3) || 0.3,
        hours_per_door_front: Number(estimatorForm.hours_per_door_front || 0.18) || 0.18,
        hours_per_tall_unit: Number(estimatorForm.hours_per_tall_unit || 0.85) || 0.85,
        hours_per_panel: Number(estimatorForm.hours_per_panel || 0.2) || 0.2,
        minimum_duration_hours: Number(estimatorForm.minimum_duration_hours || 4) || 4,
        rounding_rule: String(estimatorForm.rounding_rule || "nearest_half_day"),
        default_complexity: String(estimatorForm.default_complexity || "standard"),
        crew_size_two_person_hours: Number(estimatorForm.crew_size_two_person_hours || 10.5) || 10.5,
        crew_size_three_person_hours: Number(estimatorForm.crew_size_three_person_hours || 21) || 21,
        crew_size_four_person_hours: Number(estimatorForm.crew_size_four_person_hours || 31.5) || 31.5,
      };

      if (estimatorForm.id) {
        await crmApi.entities.InstallEstimatorSetting.update(estimatorForm.id, payload);
      } else {
        await crmApi.entities.InstallEstimatorSetting.create(payload);
      }
      await loadData();
      setEstimatorSettingsOpen(false);
      toast({ title: "Estimator settings updated" });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save estimator settings",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSavingEstimator(false);
    }
  };

  const persistInstallRangeChange = async (item, nextRange, errorTitle) => {
    if (!item || !nextRange || sameRange(item, nextRange)) {
      return false;
    }

    const targetLane = plannerLanes.find((lane) => String(lane.id || "") === String(nextRange.lane_id || ""));
    const nextAssignedCrewId = targetLane?.lane_type === "install_crew"
      ? String(targetLane.crew_id || "")
      : targetLane?.lane_type === "install_staff"
        ? ""
        : item.assignedCrewId || "";
    const nextAssignedStaffIds = targetLane?.lane_type === "install_staff"
      ? [String(targetLane.staff_id || "")].filter(Boolean)
      : targetLane?.lane_type === "install_crew"
        ? []
        : (Array.isArray(item.assignedStaffIds) ? item.assignedStaffIds : []);

    const savingTargetId = item.sourceType === "operation" ? item.recordId : item.jobId;
    setSavingRecordId(savingTargetId);

    try {
      await saveInstallEntry({
        job_id: item.jobId,
        operation_id: item.sourceType === "operation" ? item.recordId : undefined,
        install_label: item.taskName || item.installLabel,
        title: item.title || item.jobTitle,
        description: item.notes || "",
        install_type: item.installType || "install",
        duration_hours: Number(item.durationHours || 0) || 10.5,
        priority: item.priority || "medium",
        deadline: item.deadline || "",
        earliest_start: item.earliestStart || nextRange.start_date,
        latest_finish: item.latestFinish || "",
        dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
        assigned_staff_ids: nextAssignedStaffIds,
        assigned_crew_id: nextAssignedCrewId,
        required_crew_size: Number(item.requiredCrewSize || item.suggestedCrewSize || 1) || 1,
        required_skills: Array.isArray(item.requiredSkills) ? item.requiredSkills : [],
        preferred_crew_id: item.preferredCrewId || nextAssignedCrewId,
        crew_assignment_locked: Boolean(item.crewAssignmentLocked || targetLane?.lane_type === "install_crew"),
        lane_id: nextRange.lane_id || item.laneId || "",
        location: item.location || "",
        manually_locked: nextRange.manually_locked ?? item.manuallyLocked ?? true,
        status: item.status,
        start_date: nextRange.start_date,
        end_date: nextRange.end_date,
        notes: item.notes,
      });
      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: errorTitle,
        description: error instanceof Error ? error.message : "Please try again.",
      });
      return false;
    } finally {
      setSavingRecordId("");
    }
  };

  const findPlannerDropCell = (clientX, clientY) => {
    if (typeof document === "undefined") {
      return null;
    }

    const target = document.elementFromPoint(clientX, clientY);
    if (!target) {
      return null;
    }

    const cell = target.closest("[data-schedule-drop-date]");
    if (!cell) {
      return null;
    }

    const date = String(cell.getAttribute("data-schedule-drop-date") || "");
    const laneId = String(cell.getAttribute("data-schedule-drop-lane") || "");
    return date ? { date, laneId } : null;
  };

  const handlePlannerDragStart = (event, item, mode) => {
    const nativeEvent = event?.nativeEvent || event;
    const touch = nativeEvent?.touches?.[0] || null;
    const isTouchEvent = Boolean(touch);

    if (!isTouchEvent && typeof nativeEvent?.button === "number" && nativeEvent.button !== 0) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    pointerDragCleanupRef.current?.();
    setActiveDragData({ itemId: item.id, mode });

    const updateHoverTarget = (clientX, clientY) => {
      const targetCell = findPlannerDropCell(clientX, clientY);
      setActiveDropDateKey(targetCell?.date || "");
      return targetCell;
    };

    const finishDrag = async (clientX, clientY) => {
      const targetCell = updateHoverTarget(clientX, clientY);
      pointerDragCleanupRef.current?.();
      pointerDragCleanupRef.current = () => {};

      const nextRange = mode === "move"
        ? buildInstallMoveRange(item, targetCell?.date || "", targetCell?.laneId || item?.laneId || "")
        : buildInstallResizeRange(item, mode === "resize-start" ? "start" : "end", targetCell?.date || "", targetCell?.laneId || item?.laneId || "");

      await persistInstallRangeChange(
        item,
        nextRange,
        mode === "move" ? "Could not move install plan" : "Could not resize install plan"
      );
    };

    const cleanup = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
      document.body.classList.remove("select-none");
      setActiveDragData(null);
      setActiveDropDateKey("");
    };

    const handleMouseMove = (moveEvent) => {
      updateHoverTarget(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = (upEvent) => {
      void finishDrag(upEvent.clientX, upEvent.clientY);
    };

    const handleTouchMove = (touchEvent) => {
      const nextTouch = touchEvent.touches?.[0];
      if (!nextTouch) {
        return;
      }
      updateHoverTarget(nextTouch.clientX, nextTouch.clientY);
    };

    const handleTouchEnd = (touchEvent) => {
      const nextTouch = touchEvent.changedTouches?.[0];
      if (!nextTouch) {
        cleanup();
        return;
      }
      void finishDrag(nextTouch.clientX, nextTouch.clientY);
    };

    const handleTouchCancel = () => {
      cleanup();
    };

    pointerDragCleanupRef.current = cleanup;
    document.body.classList.add("select-none");

    if (touch) {
      updateHoverTarget(touch.clientX, touch.clientY);
    } else if (typeof nativeEvent?.clientX === "number" && typeof nativeEvent?.clientY === "number") {
      updateHoverTarget(nativeEvent.clientX, nativeEvent.clientY);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchCancel);
  };

  const openEditorForItem = (item) => {
    const targetJob = jobs.find((job) => String(job.id || "") === String(item.jobId || item.recordId || ""));
    if (!targetJob) {
      return;
    }
    const estimate = jobEstimates?.[targetJob.id] || {};

    setSelectedItemId(item.id);
    setEditorMode("edit");
    setEditingTarget({ type: item.sourceType, id: item.recordId });
    setInstallForm({
      job_id: targetJob.id,
      install_label: String(item.taskName || item.installLabel || ""),
      title: String(item.title || item.taskName || item.installLabel || targetJob.title || ""),
      description: String(item.notes || ""),
      install_type: String(item.installType || "install"),
      duration_hours: String(item.durationHours || "10.5"),
      priority: String(item.priority || "medium"),
      deadline: String(item.deadline || ""),
      earliest_start: String(item.earliestStart || item.startDate || targetJob.install_date || ""),
      latest_finish: String(item.latestFinish || item.endDate || targetJob.install_end_date || ""),
      assigned_staff_id: String(item.assignedStaffIds?.[0] || "__unassigned"),
      assigned_crew_id: String(item.assignedCrewId || "__unassigned"),
      required_crew_size: String(item.requiredCrewSize || item.suggestedCrewSize || estimate.suggested_crew_size || "1"),
      required_skills_text: Array.isArray(item.requiredSkills) ? item.requiredSkills.join(", ") : "",
      preferred_crew_id: String(item.preferredCrewId || item.assignedCrewId || "__unassigned"),
      crew_assignment_locked: Boolean(item.crewAssignmentLocked),
      lane_id: String(item.laneId || ""),
      location: String(item.location || targetJob.site_address || ""),
      dependencies_text: Array.isArray(item.dependencies) ? item.dependencies.join(", ") : "",
      manually_locked: Boolean(item.manuallyLocked),
      status: item.sourceType === "operation" ? String(item.status || "scheduled") : "scheduled",
      start_date: String(item.startDate || targetJob.install_date || ""),
      end_date: String(item.endDate || item.startDate || targetJob.install_date || ""),
      notes: String(item.notes || ""),
      estimated_duration_hours_original: String(item.estimatedDurationHoursOriginal || estimate.estimated_install_hours || ""),
      estimated_duration_days: String(item.estimatedDurationDays || estimate.estimated_install_days || ""),
      estimated_duration_confidence: String(item.estimatedDurationConfidence || estimate.confidence || ""),
      suggested_crew_size: String(item.suggestedCrewSize || estimate.suggested_crew_size || "1"),
    });
    setEditorOpen(true);
  };

  const openCreateEditor = (lane, date) => {
    const targetDate = date || nextWorkingDateKey();
    const laneCrewId = lane?.lane_type === "install_crew" ? String(lane.crew_id || "") : "";
    const laneStaffId = lane?.lane_type === "install_staff" ? String(lane.staff_id || "") : "";
    setSelectedItemId("");
    setEditorMode("create");
    setEditingTarget({ type: "", id: "" });
    setInstallForm({
      ...emptyInstallForm(),
      assigned_staff_id: laneStaffId || "__unassigned",
      assigned_crew_id: laneCrewId || "__unassigned",
      preferred_crew_id: laneCrewId || "__unassigned",
      lane_id: lane?.id === UNASSIGNED_INSTALL_LANE_ID ? "" : String(lane?.id || ""),
      location: "",
      start_date: targetDate,
      end_date: targetDate,
      status: "scheduled",
    });
    setEditorOpen(true);
  };

  const handleSaveInstall = async () => {
    const normalizedForm = sanitizeInstallForm(installForm);
    const selectedJob = jobs.find((job) => String(job.id || "") === String(normalizedForm.job_id || ""));

    if (!selectedJob) {
      toast({
        variant: "destructive",
        title: "Select a job",
        description: "Every install entry must stay linked to a job.",
      });
      return;
    }

    if (!normalizedForm.start_date) {
      toast({
        variant: "destructive",
        title: "Install date required",
        description: "Choose the first installation date before saving.",
      });
      return;
    }

    try {
      await saveInstallEntry({
        job_id: selectedJob.id,
        operation_id: editorMode === "edit" && editingTarget.type === "operation" && editingTarget.id
          ? editingTarget.id
          : undefined,
        install_label: normalizedForm.install_label,
        title: normalizedForm.title,
        description: normalizedForm.description,
        install_type: normalizedForm.install_type,
        duration_hours: normalizedForm.duration_hours,
        priority: normalizedForm.priority,
        deadline: normalizedForm.deadline,
        earliest_start: normalizedForm.earliest_start || normalizedForm.start_date,
        latest_finish: normalizedForm.latest_finish,
        dependencies: normalizedForm.dependencies,
        assigned_staff_ids: normalizedForm.assigned_staff_ids,
        assigned_crew_id: normalizedForm.assigned_crew_id,
        required_crew_size: normalizedForm.required_crew_size,
        required_skills: normalizedForm.required_skills,
        preferred_crew_id: normalizedForm.preferred_crew_id,
        crew_assignment_locked: normalizedForm.crew_assignment_locked,
        lane_id: normalizedForm.lane_id,
        location: normalizedForm.location || selectedJob.site_address || "",
        manually_locked: normalizedForm.manually_locked,
        status: normalizedForm.status,
        start_date: normalizedForm.start_date,
        end_date: normalizedForm.end_date || normalizedForm.start_date,
        notes: normalizedForm.notes,
      });
      resetEditor();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save install plan",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleDeleteInstall = async () => {
    const targetJobId = String(installForm.job_id || editingTarget.id || "").trim();
    if (!targetJobId) {
      return;
    }

    try {
      await deleteInstallEntry({
        job_id: targetJobId,
        operation_id: editingTarget.type === "operation" && editingTarget.id ? editingTarget.id : undefined,
      });
      resetEditor();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not remove install plan",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleDragEnd = async ({ active, over }) => {
    const activeData = active?.data?.current;
    const overData = over?.data?.current;
    setActiveDragData(null);
    setActiveDropDateKey("");

    if (!activeData || !overData || overData.type !== "schedule-cell") {
      return;
    }

    const item = allTimelineItems.find((timelineItem) => timelineItem.id === activeData.itemId);
    if (!item) {
      return;
    }

    const isResize = activeData.mode === "resize-start" || activeData.mode === "resize-end";
    const nextRange = isResize
      ? buildInstallResizeRange(item, activeData.mode === "resize-start" ? "start" : "end", overData.date, overData.laneId || item?.laneId || "")
      : buildInstallMoveRange(item, overData.date, overData.laneId || item?.laneId || "");
    await persistInstallRangeChange(
      item,
      nextRange,
      isResize ? "Could not resize install plan" : "Could not move install plan"
    );
  };

  const handleResizeStep = async (item, edge, deltaDays) => {
    if (!item?.canResize || !deltaDays) {
      return;
    }

    const anchorDate = edge === "start"
      ? normaliseDateString(item.startDate)
      : normaliseDateString(item.endDate || item.startDate);

    if (!anchorDate) {
      return;
    }

    const targetDate = format(addDays(new Date(`${anchorDate}T00:00:00`), deltaDays), "yyyy-MM-dd");
    const nextRange = buildInstallResizeRange(item, edge, targetDate, item?.laneId || "");
    await persistInstallRangeChange(item, nextRange, "Could not resize install plan");
  };

  const handleMoveStep = async (item, { dayDelta = 0 } = {}) => {
    const anchorDate = normaliseDateString(item.startDate || "");
    if (!anchorDate || !dayDelta) {
      return;
    }

    const targetDate = format(addDays(new Date(`${anchorDate}T00:00:00`), dayDelta), "yyyy-MM-dd");
    const nextRange = buildInstallMoveRange(item, targetDate, item?.laneId || "");
    await persistInstallRangeChange(item, nextRange, "Could not move install plan");
  };

  const handlePrevious = () => {
    setCurrentDate((previous) =>
      view === "month" ? subMonths(previous, 1) : subWeeks(previous, view === "2week" ? 2 : 1)
    );
  };

  const handleNext = () => {
    setCurrentDate((previous) =>
      view === "month" ? addMonths(previous, 1) : addWeeks(previous, view === "2week" ? 2 : 1)
    );
  };

  useEffect(() => {
    if (!editorOpen || editorMode !== "create") {
      return;
    }

    const estimate = installForm.job_id ? jobEstimates?.[installForm.job_id] || null : null;
    if (!estimate) {
      return;
    }

    setInstallForm((current) => {
      const nextDuration = String(estimate.estimated_install_hours || current.duration_hours || "10.5");
      const nextCrewSize = String(estimate.suggested_crew_size || current.required_crew_size || "1");
      const nextEndDate = current.start_date || current.end_date ? current.end_date || current.start_date : nextWorkingDateKey();
      return {
        ...current,
        duration_hours: current.duration_hours && Number(current.duration_hours) > 0 ? current.duration_hours : nextDuration,
        required_crew_size: current.required_crew_size && Number(current.required_crew_size) > 0 ? current.required_crew_size : nextCrewSize,
        suggested_crew_size: String(estimate.suggested_crew_size || current.suggested_crew_size || "1"),
        estimated_duration_hours_original: String(estimate.estimated_install_hours || ""),
        estimated_duration_days: String(estimate.estimated_install_days || ""),
        estimated_duration_confidence: String(estimate.confidence || ""),
        end_date: nextEndDate,
      };
    });
  }, [editorMode, editorOpen, installForm.job_id, jobEstimates]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const editingJob = jobs.find((job) => String(job.id || "") === String(installForm.job_id || "")) || null;
  const activeJobEstimate = editingJob ? jobEstimates?.[editingJob.id] || null : null;
  const activeCrews = crews.filter((crew) => crew.is_active !== false);

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Install Planner" subtitle="Plan site work by date, crew, and job. Drag to move work, then lock the jobs that must not shift." />

      <GuidedWorkflow
        className="mb-4"
        title="Schedule an install"
        subtitle="The planner is safest when the next action is obvious: choose the work, place it on the calendar, check the crew, then lock firm dates."
        steps={[
          { title: "Pick the job", detail: "Use Ready To Plan or create a task on the calendar." },
          { title: "Place the dates", detail: "Drag or resize the install to match the site booking." },
          { title: "Check crew load", detail: "Look for capacity warnings before confirming." },
          { title: "Lock if firm", detail: "Locked tasks stay put when other work moves." },
        ]}
      />

      <div className="mb-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={handlePrevious}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-xl px-3" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{rangeLabel}</p>
              <p className="text-xs text-muted-foreground">Drag installs between dates, resize longer site phases, and open the job directly from each entry.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Select value={laneMode} onValueChange={(value) => {
              setLaneMode(value);
              setLaneFilter("all");
            }}>
              <SelectTrigger className="h-9 w-36 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="crew">By Crew</SelectItem>
                <SelectItem value="staff">By Staff</SelectItem>
                <SelectItem value="unified">Unified</SelectItem>
              </SelectContent>
            </Select>

            <Select value={view} onValueChange={handleViewChange}>
              <SelectTrigger className="h-9 w-36 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Full Month</SelectItem>
                <SelectItem value="work">Work Week (5)</SelectItem>
                <SelectItem value="week">Full Week (7)</SelectItem>
                <SelectItem value="2week">2 Weeks</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
                <SelectValue placeholder="All staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={installTypeFilter} onValueChange={setInstallTypeFilter}>
              <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {INSTALL_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {laneMode !== "unified" ? (
              <Select value={laneFilter} onValueChange={setLaneFilter}>
                <SelectTrigger className="h-9 w-40 rounded-xl text-xs">
                  <SelectValue placeholder="All lanes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lanes</SelectItem>
                  {plannerLanes.map((lane) => (
                    <SelectItem key={lane.id} value={lane.id}>
                      {lane.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => void loadData()}>
              Refresh plan
            </Button>

            <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => openCrewSettings()}>
              Crew settings
            </Button>

            <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => setEstimatorSettingsOpen(true)}>
              Advanced estimate rules
            </Button>

            <Button type="button" size="sm" className="h-9 rounded-xl" onClick={() => openCreateEditor(plannerLanes[0] || null, "")}>
              <Plus className="h-4 w-4" />
              Add Install
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1"><MoveDiagonal2 className="h-3 w-3" />Drag tasks between days and crew or staff lanes</span>
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1"><CalendarRange className="h-3 w-3" />Resize to change the planned install window</span>
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1"><Plus className="h-3 w-3" />Double-click a day to add a new install task</span>
        </div>
      </div>

      <div className={`mb-4 grid gap-3 ${getInstallMetricGridClass()}`}>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Scheduled Installs</p>
          <p className="mt-1 text-2xl font-semibold">{timelineState.scheduledItems.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Install events currently plotted in the planner.</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Needs Planning</p>
          <p className="mt-1 text-2xl font-semibold">{timelineState.unscheduledItems.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Jobs ready for installation but still missing a booked date.</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Multi-Day Installs</p>
          <p className="mt-1 text-2xl font-semibold">{multiDayInstallCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Longer site phases that span more than one day.</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Installs 14 Days</p>
          <p className="mt-1 text-2xl font-semibold">{next14DayInstallCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Upcoming jobs that the team will be onsite for soon.</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Peak Daily Load</p>
          <p className="mt-1 text-2xl font-semibold">{visibleLoadModel.peakInstallCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {visibleLoadModel.busiestDay
              ? `${format(new Date(`${visibleLoadModel.busiestDay.dateKey}T00:00:00`), "EEE d MMM")} has the highest overlap.`
              : "No install workload is visible in this range."}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active Crews</p>
          <p className="mt-1 text-2xl font-semibold">{activeCrews.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Crew capacity available for install scheduling.</p>
        </div>
      </div>

      <div className="mb-5 grid items-start gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Visible Install Load</h3>
              <p className="mt-1 text-sm text-muted-foreground">A quick read on how densely installation work is packed into the dates now on screen.</p>
            </div>
            <div className="sm:text-right">
              <p className="text-lg font-semibold text-foreground">{visibleLoadModel.activeDays}</p>
              <p className="text-xs text-muted-foreground">days with site work booked</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`${visibleLoadModel.busyDays > 0 ? "bg-amber-500" : visibleLoadModel.activeDays > 0 ? "bg-emerald-500" : "bg-slate-400"} h-full rounded-full`}
              style={{
                width: `${visibleDays.length > 0 ? Math.min(100, Math.round((visibleLoadModel.activeDays / visibleDays.length) * 100)) : 0}%`,
              }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{visibleLoadModel.totalPlacements} install-day placement{visibleLoadModel.totalPlacements === 1 ? "" : "s"}</span>
            <span>{visibleLoadModel.busyDays} busy day{visibleLoadModel.busyDays === 1 ? "" : "s"}</span>
            {visibleLoadModel.busiestDay ? <span>Peak {visibleLoadModel.busiestDay.dateKey}: {visibleLoadModel.busiestDay.installCount} installs</span> : null}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Busiest Days</h3>
            <p className="mt-1 text-sm text-muted-foreground">Use this to spot install clustering before it turns into a site bottleneck.</p>
          </div>

          {visibleLoadModel.days.filter((day) => day.installCount > 0).length === 0 ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">
              No installs are booked in this visible range yet.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleLoadModel.days
                .filter((day) => day.installCount > 0)
                .sort((left, right) => right.installCount - left.installCount || String(left.dateKey).localeCompare(String(right.dateKey)))
                .slice(0, 4)
                .map((day) => (
                  <div key={day.dateKey} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{format(new Date(`${day.dateKey}T00:00:00`), "EEE d MMM yyyy")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{day.jobRefs.join(" · ")}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${day.hasOverlap ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {day.installCount} install{day.installCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveDragData(active?.data?.current || null)}
        onDragCancel={() => setActiveDragData(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-4">
          {sectionLayouts.map((section) => (
            <div key={section.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{section.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Installation-only timeline with daily load cues and direct drag-to-replan interactions.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${getTimelineSectionMinWidth(section.days.length, view)}px` }}>
                  <div
                    className="grid border-b bg-muted/30"
                    style={{ gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px minmax(0, 1fr)` }}
                  >
                    <div className="border-r px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {laneMode === "staff" ? "Staff Lanes" : laneMode === "crew" ? "Crew Lanes" : "Install Load"}
                    </div>
                    <div
                      className="grid"
                      style={{ gridTemplateColumns: `repeat(${section.days.length}, minmax(0, 1fr))` }}
                    >
                      {section.days.map((day) => {
                        const dayKey = format(day, "yyyy-MM-dd");
                        const dayLoad = section.loadModel.byDateKey.get(dayKey);
                        return (
                          <div
                            key={`${section.id}-${day.toISOString()}`}
                            className={`border-r px-2 py-3 text-center last:border-r-0 ${dayKey === format(new Date(), "yyyy-MM-dd") ? "bg-primary/5" : ""}`}
                          >
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{format(day, "EEE")}</p>
                            <p className="text-sm font-semibold">{format(day, "d")}</p>
                            <p className="text-[11px] text-muted-foreground">{format(day, "MMM")}</p>
                            <p className={`mt-1 text-[10px] font-medium ${dayLoad?.hasOverlap ? "text-amber-700" : "text-muted-foreground"}`}>
                              {dayLoad?.installCount ? `${dayLoad.installCount} install${dayLoad.installCount === 1 ? "" : "s"}` : "Open"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {section.lanes.map((laneSection) => (
                    <TimelineLane
                      key={`${section.id}-${laneSection.lane.id}`}
                      lane={laneSection.lane}
                      days={section.days}
                      segments={laneSection.segments}
                      rowCount={laneSection.rowCount}
                      loadSummary={laneSection.loadSummary}
                      dayLoadsByDateKey={laneSection.loadModel.byDateKey}
                      selectedItemId={selectedItemId}
                      activeItemId={activeDragItemId}
                      activeDropDateKey={activeDropDateKey}
                      savingRecordId={savingRecordId}
                      onItemClick={openEditorForItem}
                      onCreate={openCreateEditor}
                      onMoveStep={handleMoveStep}
                      onResizeStep={handleResizeStep}
                      onPlannerDragStart={handlePlannerDragStart}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeOverlayItem ? (
            <div className="w-[300px] max-w-[42vw]">
              <TimelineItemCard
                item={activeOverlayItem}
                selected={false}
                active
                saving={false}
                showHandles={false}
                dragOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {timelineState.unscheduledItems.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Ready To Plan ({timelineState.unscheduledItems.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {timelineState.unscheduledItems.map((item) => (
              <ScheduleBacklogCard
                key={item.id}
                item={item}
                active={activeDragItemId === item.id}
                onClick={openEditorForItem}
              />
            ))}
          </div>
        </div>
      ) : null}

      {timelineState.scheduledItems.length === 0 && timelineState.unscheduledItems.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No installation work is planned yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Book an install from here or add an install date on a job to start filling the planner.
          </p>
        </div>
      ) : null}

      <Dialog
        open={editorOpen}
        onOpenChange={(nextOpen) => {
          setEditorOpen(nextOpen);
          if (!nextOpen) {
            resetEditor();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editorMode === "edit" ? "Edit Install Task" : "Create Install Plan"}</DialogTitle>
            <DialogDescription>
              {editingTarget.type === "job"
                ? "This job is currently using only its install date. Saving here creates a real planner task with duration, staff, deadline, and lock-aware scheduling."
                : "Keep the planner focused on the actual site work while the scheduler rebalances everything around the locked tasks."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-job">Job</Label>
              <Select
                value={installForm.job_id || "__none"}
                onValueChange={(value) => setInstallForm((current) => ({ ...current, job_id: value === "__none" ? "" : value }))}
              >
                <SelectTrigger id="schedule-job">
                  <SelectValue placeholder="Select job" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select job</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.job_number} · {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-install-label">Install Label</Label>
              <Input
                id="schedule-install-label"
                value={installForm.install_label || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, install_label: event.target.value }))}
                placeholder="Kitchen install, site measure, delivery..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-title">Task Title</Label>
              <Input
                id="schedule-title"
                value={installForm.title || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Main install day 1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-install-type">Task Type</Label>
              <Select
                value={installForm.install_type}
                onValueChange={(value) => setInstallForm((current) => ({ ...current, install_type: value }))}
              >
                <SelectTrigger id="schedule-install-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTALL_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-priority">Priority</Label>
              <Select
                value={installForm.priority}
                onValueChange={(value) => setInstallForm((current) => ({ ...current, priority: value }))}
              >
                <SelectTrigger id="schedule-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTALL_PRIORITY_OPTIONS.map((priorityOption) => (
                    <SelectItem key={priorityOption.value} value={priorityOption.value}>
                      {priorityOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-status">Status</Label>
              <Select
                value={installForm.status}
                onValueChange={(value) => setInstallForm((current) => ({ ...current, status: value }))}
              >
                <SelectTrigger id="schedule-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTALL_STATUS_OPTIONS.map((statusOption) => (
                    <SelectItem key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-duration-hours">Duration (hours)</Label>
              <Input
                id="schedule-duration-hours"
                type="number"
                min="0.25"
                step="0.25"
                value={installForm.duration_hours || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, duration_hours: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-crew">Assigned Crew</Label>
              <Select
                value={installForm.assigned_crew_id || "__unassigned"}
                onValueChange={(value) => {
                  const selectedLane = plannerLanes.find((lane) => String(lane.crew_id || "") === value) || null;
                  setInstallForm((current) => ({
                    ...current,
                    assigned_crew_id: value,
                    preferred_crew_id: value === "__unassigned" ? current.preferred_crew_id : value,
                    lane_id: value === "__unassigned" ? current.lane_id : String(selectedLane?.id || current.lane_id || ""),
                  }));
                }}
              >
                <SelectTrigger id="schedule-crew">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {activeCrews.map((crew) => (
                    <SelectItem key={crew.id} value={crew.id}>
                      {crew.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-staff">Assigned Staff</Label>
              <Select
                value={installForm.assigned_staff_id || "__unassigned"}
                onValueChange={(value) => {
                  const selectedLane = plannerLanes.find((lane) => String(lane.staff_id || "") === value) || null;
                  setInstallForm((current) => ({
                    ...current,
                    assigned_staff_id: value,
                    lane_id: value === "__unassigned" ? "" : String(selectedLane?.id || current.lane_id || ""),
                  }));
                }}
              >
                <SelectTrigger id="schedule-staff">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">Unassigned</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-required-crew-size">Required Crew Size</Label>
              <Input
                id="schedule-required-crew-size"
                type="number"
                min="1"
                step="1"
                value={installForm.required_crew_size || "1"}
                onChange={(event) => setInstallForm((current) => ({ ...current, required_crew_size: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-preferred-crew">Preferred Crew</Label>
              <Select
                value={installForm.preferred_crew_id || "__unassigned"}
                onValueChange={(value) => setInstallForm((current) => ({ ...current, preferred_crew_id: value }))}
              >
                <SelectTrigger id="schedule-preferred-crew">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned">No preference</SelectItem>
                  {activeCrews.map((crew) => (
                    <SelectItem key={crew.id} value={crew.id}>
                      {crew.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-start-date">Start Date</Label>
              <Input
                id="schedule-start-date"
                type="date"
                value={installForm.start_date || ""}
                onChange={(event) => setInstallForm((current) => ({
                  ...current,
                  start_date: event.target.value,
                  end_date: current.end_date || event.target.value,
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-deadline">Deadline</Label>
              <Input
                id="schedule-deadline"
                type="date"
                value={installForm.deadline || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, deadline: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-end-date">End Date</Label>
              <Input
                id="schedule-end-date"
                type="date"
                value={installForm.end_date || ""}
                min={installForm.start_date || undefined}
                onChange={(event) => setInstallForm((current) => ({ ...current, end_date: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-earliest-start">Earliest Start</Label>
              <Input
                id="schedule-earliest-start"
                type="date"
                value={installForm.earliest_start || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, earliest_start: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule-latest-finish">Latest Finish</Label>
              <Input
                id="schedule-latest-finish"
                type="date"
                value={installForm.latest_finish || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, latest_finish: event.target.value }))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-location">Location</Label>
              <AddressAutocompleteInput
                inputId="schedule-location"
                value={installForm.location || ""}
                onChange={(nextValue) => setInstallForm((current) => ({ ...current, location: nextValue }))}
                placeholder="Site address or delivery location"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-dependencies">Dependencies</Label>
              <Input
                id="schedule-dependencies"
                value={installForm.dependencies_text || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, dependencies_text: event.target.value }))}
                placeholder="Comma-separated task IDs that must finish first"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-required-skills">Required Skills</Label>
              <Input
                id="schedule-required-skills"
                value={installForm.required_skills_text || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, required_skills_text: event.target.value }))}
                placeholder="Stone top, aluminium doors, detailed fit-off..."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="rounded-lg border bg-emerald-50/60 px-3 py-2 text-sm text-emerald-950">
                <p className="font-medium">
                  Estimated install: {activeJobEstimate?.estimated_install_hours || installForm.estimated_duration_hours_original || "Not available"}h
                  {activeJobEstimate?.estimated_install_days || installForm.estimated_duration_days ? ` · ${activeJobEstimate?.estimated_install_days || installForm.estimated_duration_days} day(s)` : ""}
                </p>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Suggested crew size {activeJobEstimate?.suggested_crew_size || installForm.suggested_crew_size || installForm.required_crew_size || "1"}
                  {activeJobEstimate?.confidence || installForm.estimated_duration_confidence ? ` · Confidence ${activeJobEstimate?.confidence || installForm.estimated_duration_confidence}` : ""}
                </p>
                {Array.isArray(activeJobEstimate?.warnings) && activeJobEstimate.warnings.length > 0 ? (
                  <p className="mt-1 text-xs text-amber-700">{activeJobEstimate.warnings.join(" ")}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <p>
                  Planned window:{" "}
                  <span className="font-medium text-foreground">
                    {formatDisplayDate(installForm.start_date)} to {formatDisplayDate(installForm.end_date || installForm.start_date)}
                  </span>
                </p>
                <p className="mt-1 text-xs">
                  {spanDaysLabel(installForm.start_date, installForm.end_date || installForm.start_date)} · {installForm.duration_hours || "0"}h planned
                  {installForm.manually_locked ? " · Locked in place" : " · Auto-scheduled when the plan rebalances"}
                  {installForm.assigned_crew_id && installForm.assigned_crew_id !== "__unassigned"
                    ? ` · Crew ${activeCrews.find((crew) => String(crew.id) === String(installForm.assigned_crew_id))?.name || installForm.assigned_crew_id}`
                    : ""}
                  {editingJob?.site_address ? ` · Site ${editingJob.site_address}` : ""}
                </p>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-description">Description / Scope</Label>
              <Textarea
                id="schedule-description"
                value={installForm.description || ""}
                onChange={(event) => setInstallForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Scope, install sequencing, access details..."
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox
                  checked={Boolean(installForm.manually_locked)}
                  onCheckedChange={(checked) => setInstallForm((current) => ({ ...current, manually_locked: checked === true }))}
                />
                Lock task position
              </label>
              <p className="text-xs text-muted-foreground">
                Locked tasks stay fixed when the planner rebalances around duration, priority, dependencies, and deadlines.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Checkbox
                  checked={Boolean(installForm.crew_assignment_locked)}
                  onCheckedChange={(checked) => setInstallForm((current) => ({ ...current, crew_assignment_locked: checked === true }))}
                />
                Lock crew assignment
              </label>
              <p className="text-xs text-muted-foreground">
                Crew-locked tasks keep their assigned crew even when the rest of the schedule is rebalanced.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="schedule-notes">Install Notes</Label>
              <Textarea
                id="schedule-notes"
                value={installForm.notes}
                onChange={(event) => setInstallForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Access notes, handover details, staging requirements..."
              />
            </div>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <div className="flex gap-2">
              {editorMode === "edit" && editingTarget.id ? (
                <Button type="button" variant="destructive" onClick={handleDeleteInstall}>
                  {editingTarget.type === "job" ? "Clear Install Date" : "Delete Task"}
                </Button>
              ) : null}
              {editorMode === "edit" && installForm.job_id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/jobs/${installForm.job_id}`)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Job
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={resetEditor}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveInstall}>
                {editorMode === "edit" ? "Save Install" : "Create Install"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={crewSettingsOpen} onOpenChange={setCrewSettingsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crew Settings</DialogTitle>
            <DialogDescription>Create install crews, assign staff, and control daily crew capacity for the planner.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="rounded-xl border">
                {activeCrews.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">No crews yet. Create the first crew on the right.</div>
                ) : (
                  activeCrews.map((crew) => (
                    <button
                      key={crew.id}
                      type="button"
                      className="flex w-full items-start justify-between border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/20"
                      onClick={() => openCrewSettings(crew)}
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{crew.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {(crew.assigned_staff_names || []).join(", ") || "No staff assigned"} · {crew.default_daily_capacity || 10.5}h/day
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{crew.skills?.length ? `${crew.skills.length} skills` : "No skills"}</span>
                    </button>
                  ))
                )}
              </div>
              <Button type="button" variant="outline" onClick={() => setCrewForm(buildDefaultCrewForm())}>
                New crew
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <div className="space-y-2">
                <Label htmlFor="crew-name">Crew Name</Label>
                <Input id="crew-name" value={crewForm.name} onChange={(event) => setCrewForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crew-capacity">Default Daily Capacity (hours)</Label>
                <Input id="crew-capacity" type="number" min="1" step="0.5" value={crewForm.default_daily_capacity} onChange={(event) => setCrewForm((current) => ({ ...current, default_daily_capacity: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crew-skills">Skills</Label>
                <Input id="crew-skills" value={crewForm.skills_text} onChange={(event) => setCrewForm((current) => ({ ...current, skills_text: event.target.value }))} placeholder="Install, stone, aluminium, service..." />
              </div>
              <div className="space-y-2">
                <Label>Assigned Staff</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {staff.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={(crewForm.assigned_staff_ids || []).includes(member.id)}
                        onCheckedChange={(checked) => setCrewForm((current) => ({
                          ...current,
                          assigned_staff_ids: checked === true
                            ? [...new Set([...(current.assigned_staff_ids || []), member.id])]
                            : (current.assigned_staff_ids || []).filter((id) => id !== member.id),
                        }))}
                      />
                      <span>{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="crew-notes">Notes</Label>
                <Textarea id="crew-notes" value={crewForm.notes} onChange={(event) => setCrewForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={Boolean(crewForm.is_active)} onCheckedChange={(checked) => setCrewForm((current) => ({ ...current, is_active: checked === true }))} />
                Active crew
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCrewSettingsOpen(false)}>Close</Button>
            <Button type="button" onClick={handleSaveCrew} disabled={savingCrew}>{savingCrew ? "Saving..." : "Save Crew"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={estimatorSettingsOpen} onOpenChange={setEstimatorSettingsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Advanced Install Estimate Rules</DialogTitle>
            <DialogDescription>Control how install hours and suggested crew sizes are estimated from quote and pricing data.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="estimator-base-hours">Base Install Hours</Label>
              <Input id="estimator-base-hours" type="number" step="0.1" value={estimatorForm.base_install_hours} onChange={(event) => setEstimatorForm((current) => ({ ...current, base_install_hours: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-minimum-hours">Minimum Duration</Label>
              <Input id="estimator-minimum-hours" type="number" step="0.1" value={estimatorForm.minimum_duration_hours} onChange={(event) => setEstimatorForm((current) => ({ ...current, minimum_duration_hours: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-hours-cabinet">Hours per Cabinet</Label>
              <Input id="estimator-hours-cabinet" type="number" step="0.01" value={estimatorForm.hours_per_cabinet} onChange={(event) => setEstimatorForm((current) => ({ ...current, hours_per_cabinet: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-hours-drawer">Hours per Drawer</Label>
              <Input id="estimator-hours-drawer" type="number" step="0.01" value={estimatorForm.hours_per_drawer} onChange={(event) => setEstimatorForm((current) => ({ ...current, hours_per_drawer: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-hours-front">Hours per Door / Front</Label>
              <Input id="estimator-hours-front" type="number" step="0.01" value={estimatorForm.hours_per_door_front} onChange={(event) => setEstimatorForm((current) => ({ ...current, hours_per_door_front: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-hours-panel">Hours per Panel</Label>
              <Input id="estimator-hours-panel" type="number" step="0.01" value={estimatorForm.hours_per_panel} onChange={(event) => setEstimatorForm((current) => ({ ...current, hours_per_panel: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-rounding">Rounding Rule</Label>
              <Select value={estimatorForm.rounding_rule} onValueChange={(value) => setEstimatorForm((current) => ({ ...current, rounding_rule: value }))}>
                <SelectTrigger id="estimator-rounding"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nearest_half_day">Nearest Half Day</SelectItem>
                  <SelectItem value="nearest_day">Nearest Full Day</SelectItem>
                  <SelectItem value="none">No Rounding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-complexity">Default Complexity</Label>
              <Select value={estimatorForm.default_complexity} onValueChange={(value) => setEstimatorForm((current) => ({ ...current, default_complexity: value }))}>
                <SelectTrigger id="estimator-complexity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                  <SelectItem value="premium">Premium / bespoke</SelectItem>
                  <SelectItem value="high_risk">High-risk install</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-crew-two">2-Person Crew Threshold</Label>
              <Input id="estimator-crew-two" type="number" step="0.5" value={estimatorForm.crew_size_two_person_hours} onChange={(event) => setEstimatorForm((current) => ({ ...current, crew_size_two_person_hours: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimator-crew-three">3-Person Crew Threshold</Label>
              <Input id="estimator-crew-three" type="number" step="0.5" value={estimatorForm.crew_size_three_person_hours} onChange={(event) => setEstimatorForm((current) => ({ ...current, crew_size_three_person_hours: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="estimator-crew-four">4-Person Crew Threshold</Label>
              <Input id="estimator-crew-four" type="number" step="0.5" value={estimatorForm.crew_size_four_person_hours} onChange={(event) => setEstimatorForm((current) => ({ ...current, crew_size_four_person_hours: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEstimatorSettingsOpen(false)}>Close</Button>
            <Button type="button" onClick={handleSaveEstimator} disabled={savingEstimator}>{savingEstimator ? "Saving..." : "Save Settings"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
