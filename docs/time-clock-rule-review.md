# Output 1 - JoinerFlow Time Clock / Time Tracking Rule Review

Reviewed: 2026-05-09

## Scope

This review covers the current JoinerFlow time clock and time tracking behaviour across:

- `client/src/pages/TimeTracking.jsx`
- `client/src/components/time/*`
- `client/src/lib/timeclock.js`
- `client/src/lib/timeGrouping.js`
- `client/src/lib/actualLabour.js`
- `client/src/lib/reporting/reportDefinitions.js`
- `server/src/timeTracking.ts`
- `server/src/index.ts`
- `server/src/db.ts`

The system is already more workshop-focused than enterprise-focused. The strongest rule is that timeclock records are now the source of truth for actual labour, with quote/job labour views reading from existing `TimeEntry` records rather than requiring duplicate labour entry.

## Current Model Summary

### Records

| Record | Purpose | Key Fields |
|---|---|---|
| `TimeEntry` | Job/activity labour timer and manual correction records | `staff_id`, `job_id`, `job_operation_id`, `activity`, `status`, `segments`, `clock_in`, `clock_out`, `hours`, `hourly_rate`, `total_cost`, `break_minutes`, `manual_override`, `exported` |
| `ClockIn` | Attendance clock in/out for payroll-style daily hours export | `staff_id`, `date`, `clock_in_time`, `clock_out_time`, `total_hours` |
| `JobOperation` | Workflow task/stage estimate and actual sync target | `estimated_hours`, `actual_hours`, `status`, `actual_start_date` |
| `Staff` | Staff defaults and costing rate | `name`, `employee_id`, `hourly_rate`, `status` |
| `ExportHistory` | Export audit/history | `batch_id`, `export_type`, source record metadata |

### Important Distinction

`ClockIn` and `TimeEntry` are separate:

- `ClockIn` records attendance for the day.
- `TimeEntry` records what work was done and drives job costing, actual labour, activity slips, and workflow task actuals.

This is useful, but should be explained clearly in the UI because users may assume "clock in" and "start job timer" are the same thing.

## Detected Business Rules

### Timer Rules

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| One active timer per staff member | Enforced by a partial unique DB index on active `TimeEntry` by `staff_id`; starting/resuming another timer auto-pauses the active one | `server/src/timeTracking.ts`, `server/src/db.ts`, `server/src/index.ts` | Good rule for a small workshop. Prevents double-counting. |
| Starting same timer context returns existing timer | If same staff/job/task/activity/location/kind is already active, `startTimer` returns it instead of duplicating | `server/src/timeTracking.ts` | Good safety rule. |
| Starting a different timer auto-pauses current timer | Existing active timer is paused at the same transition timestamp used for new timer start | `server/src/timeTracking.ts`, `ClockInTab.jsx` | Good workflow: "switch jobs" instead of manually stopping first. |
| Paused timers can be resumed | Paused entries keep prior segments and open a new segment on resume | `server/src/timeTracking.ts`, `ClockInTab.jsx`, `TimeEntryTable.jsx` | Good for interruptions. UI blocks single-block editing of multi-segment timers. |
| Completed timers cannot be paused or resumed | Server rejects pause/resume of completed entries | `server/src/timeTracking.ts` | Good locking rule, but completed entries can still be edited as single-block records if not exported. |
| Multi-segment timers are preserved | UI prevents editing multi-segment timers as one block | `ClockInTab.jsx`, `TimeEntryTable.jsx` | Correct, but user needs a clearer "why": it protects pause/resume history. |
| Active timers are not overlap-checked as normal completed entries | Active entries bypass normal overlap check; unique active timer rule handles live state | `server/src/timeTracking.ts` | Good. |
| Completed/paused entries cannot overlap for same staff | Server and manual entry UI block overlaps | `server/src/timeTracking.ts`, `ManualTimeEntryDialog.jsx`, `timeclock.js` | Good. Needs tests for edited entries too. |
| Tiny legacy switch overlaps are repaired | Startup repair trims small overlaps and malformed resumed segments | `server/src/timeTracking.ts` | Good data repair, but invisible to users/admins. |
| No auto-stop for forgotten timers | Not currently detected or stopped by rule | Not implemented | High-priority gap. |
| No idle handling | Not currently implemented | Not implemented | Acceptable for workshop simplicity, but forgotten timer handling is needed. |
| No explicit max timer duration for live timers | Schema caps `hours` at 1000 for payloads, but live timer duration can grow until completed | `server/src/index.ts`, `server/src/timeTracking.ts` | Needs "forgotten timer" review workflow. |
| Rounding | Time is rounded to nearest minute internally and hours to 2 decimals | `server/src/timeTracking.ts`, `timeclock.js` | Good. Keep one standard. |

### Attendance / Clock In Rules

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Staff tap to clock in/out for attendance | `ClockInWidget` toggles per staff member for today's date | `ClockInWidget.jsx` | Large touch targets are good. |
| Daily attendance total uses first clock-in and last clock-out | Export aggregation combines attendance records by staff/date | `ExportTab.jsx` | Good for payroll daily hours. |
| Lunch deduction applies on export | Daily hours export deducts 0.5h when raw hours > 5.5 and day is not Friday | `ExportTab.jsx` | This is a major business rule and should be confirmed. |
| ClockIn records can be deleted | UI allows delete with browser confirm | `ClockInWidget.jsx` | Should prefer "void" or audit rather than delete. |
| ClockIn does not automatically start TimeEntry | Attendance and work timers are separate | Current design | Good if intentional; confusing if not explained. |

### Manual Entry / Edits

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Manual correction creates a completed `TimeEntry` | Manual entries require staff/date/start/end/activity; job required only for job-required activities | `ManualTimeEntryDialog.jsx`, server schema | Good. |
| Manual entry marks `manual_override=true` | Manual corrections carry manual flag and optional reason | `ManualTimeEntryDialog.jsx`, `server/src/timeTracking.ts` | Good. Make reason required for edits after export/approval if introduced. |
| Break minutes must be 0-600 server-side | Schema and normalizer validate min/max | `server/src/index.ts`, `server/src/timeTracking.ts` | Good. UI only blocks negative, not >600. |
| Manual/edit overlap is blocked | UI detects overlap; server enforces overlap too | `ManualTimeEntryDialog.jsx`, `server/src/timeTracking.ts` | Good. |
| Completed entries editable until exported | Table text says this; UI hides edit/delete when `exported` is true | `TimeEntryTable.jsx` | Good simple lock. |
| Deletion is allowed before export | Time entries and groups can be deleted | `TimeEntryTable.jsx`, `TimesheetTab.jsx`, API delete | Risky for confidence and audit. Prefer void/archive. |
| No explicit approval state | No reviewed/approved workflow except export and actual labour costing review fields | Not broadly implemented | For 4 people, keep light: "Needs review / Reviewed", not heavy approvals. |

### Job / Quote / Workflow Linking

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Some activities require a job | `Labour`, `Rework`, `Sanding`, `Van Mileage` require job; other chargeable currently does not | `timeclock.js`, `TimeEntryForm.jsx`, `ManualTimeEntryDialog.jsx` | Consider making `Other Chargeable` require job too. |
| Job selection filters out inactive/completed/cancelled jobs | UI lists active jobs only | `TimeTracking.jsx`, `TimeEntryForm.jsx`, `ManualTimeEntryDialog.jsx`, `TimeEntryTable.jsx` | Good for normal use, but editing old records linked to completed jobs can become awkward. |
| Time can link to workflow task | Schema/server support `job_operation_id`; side effects update `JobOperation.actual_hours` | `server/src/timeTracking.ts`, `server/src/index.ts` | UI currently does not make task selection prominent in Quick Start. |
| Workflow actual hours sync from linked time entries | Linked `TimeEntry` records update `JobOperation.actual_hours`, start date, and status | `server/src/timeTracking.ts` | Good. This should become official source of workflow actuals. |
| Quote actual labour reads TimeEntry records | Quote/job actual labour panel uses timeclock entries; unassigned entries can be linked | `actualLabour.js`, `ActualLabourPanel.jsx`, `QuoteDetail.jsx`, `JobDetail.jsx` | Good. Needs server/API support for official category/review fields if made durable. |
| Unassigned time is surfaced | Actual Labour panel lists unassigned costable time | `actualLabour.js`, `ActualLabourPanel.jsx` | Good. Needs a global "Unassigned Time" queue. |
| Archived/deleted jobs/quotes not explicitly handled | No special rule detected | Not implemented | Missing edge case. |

### Labour Categories

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Time activity options exist | Activity list includes leave, labour, material handling, quoting, sanding, rework, etc. | `timeclock.js` | List contains typo: "Breavement", "Staff Traning". |
| Actual labour categories are separate | Categories: Cutting, Edging, Assembly, Hardware, Install, Site Measure, Delivery, Admin / Plans, Other | `actualLabour.js` | Good categories for joinery. |
| Category mapping uses plain text rules | Looks at activity, operation, task name, workflow phase, description, notes | `actualLabour.js` | Good starting point. Needs configurable rules UI if business wants control. |
| Fallback category is Other | Unmatched work falls into Other | `actualLabour.js` | Good, but "Other" should trigger review when used often. |
| Explicit labour category wins | `labour_category` overrides mapping if valid | `actualLabour.js` | Good. |

### Calculation Rules

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Duration from segments | Segment minutes are authoritative for timers | `server/src/timeTracking.ts`, `timeclock.js` | Good. |
| Manual duration from start/end minus break | Manual corrections calculate hours from times and break minutes | `ManualTimeEntryDialog.jsx`, `TimeEntryTable.jsx`, server normalizer | Good. |
| `total_minutes` excludes break minutes | Server subtracts `break_minutes` in derived fields | `server/src/timeTracking.ts` | Good. |
| `hours` rounded to two decimals | Server and client use two-decimal rounding | `server/src/timeTracking.ts`, `timeclock.js` | Good. |
| `total_cost = hours * hourly_rate` | Derived on server for time entries | `server/src/timeTracking.ts` | Good, but historical rate changes need rule. Current entry stores hourly rate at creation/update. |
| Quote actual labour cost uses `hourly_rate` fallback | Actual Labour panel uses entry rate or provided fallback | `actualLabour.js` | Good. Needs official internal labour rate default if staff rate missing. |
| Variance = actual - estimated | Actual Labour panel and reports calculate variance | `actualLabour.js`, `reportDefinitions.js` | Good. |
| Overtime not calculated for timeclock | Scheduling has overtime flags, time tracking/payroll does not | Not implemented | Confirm whether needed. For small workshop, avoid unless payroll requires it. |

### Reporting / Export Rules

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Timesheet display groups identical entries | Groups by staff/date/job/activity/notes/export status | `timeGrouping.js`, `TimesheetTab.jsx` | Good for readability. Deleting a group deletes all source entries, which is risky. |
| Activity slip export uses TimeEntry rows | Exports non-exported completed time entries | `ExportTab.jsx` | Good. |
| Export marks activity slip source entries exported | `TimeEntry.exported=true`, `exported_batch_id=batchId` | `ExportTab.jsx` | Good lock. |
| Timesheet/daily export records history but does not mark TimeEntry exported | Only activity slips mark time entries exported | `ExportTab.jsx` | Confirm intended. Could confuse "pending" state. |
| Export validation blocks missing MYOB fields | Activity slips and timesheets validate required fields | `ExportTab.jsx` | Good. |
| Daily hours uses ClockIn totals, not TimeEntry totals | Explicit comment/rule | `ExportTab.jsx` | Good if payroll attendance is desired. |
| Reports exclude break entries | Report rows filter `!is_break` | `reportDefinitions.js` | Good. |
| Excluded actual-labour time ignored in quote panel | `exclude_from_costing` / similar fields excluded | `actualLabour.js` | Good, but not yet standardized server schema fields. |

### Permissions / Audit

| Rule | Current Behaviour | Where Implemented | Edge Cases / Notes |
|---|---|---|---|
| Authenticated users can use time tracking | Normal app requires auth and module enabled | `TimeTracking.jsx`, `server/src/index.ts` | Good. |
| Kiosk can read Staff/Job/JobOperation/TimeEntry/ClockIn and write TimeEntry/ClockIn | Kiosk request bypasses normal user auth for allowed entities | `server/src/index.ts` | Good for workshop device. Need physical/security expectations documented. |
| Export/admin buttons depend on modules and admin role | Manual entry/export history links gated in export tab | `ExportTab.jsx` | Good. |
| Entity audit exists through generic mutation logging | Server logs create/update/delete and DB likely tracks row versions | `server/src/index.ts`, `db.ts` | Specific time review actions need stronger plain audit labels. |
| TimeEntry deletion is allowed | Hard delete via generic API | API and UI | Recommend void/restore instead of delete. |

## Duplicated / Conflicting Logic

1. There are older time-entry helper functions still present in `server/src/index.ts` near the bottom, while active segmented logic lives in `server/src/timeTracking.ts`. This is confusing technical debt and risks future divergence.
2. Client and server both calculate hours and overlap. This is acceptable for UX plus enforcement, but the server must remain authoritative.
3. `ClockIn` attendance and `TimeEntry` job timers are both called "clock" style actions. This is conceptually confusing for workshop users.
4. Deletion rules are inconsistent with the safer archive/restore mindset used elsewhere. Time records can be deleted from multiple screens.
5. Export lock applies to activity slip export, but timesheet/daily export does not mark the same source entries exported.
6. Actual Labour review fields are accepted via passthrough, but not formalized as first-class schema fields.
7. Labour categories and timeclock activity options are separate systems. That is fine, but the mapping rules need an admin-visible configuration or at least documented defaults.

## Missing Edge Cases

| Edge Case | Current Handling | Recommendation |
|---|---|---|
| Forgotten clock-out / overnight timer | No specific workflow | Add "Long running timer" warning at 8/10/12 hours and next-day review queue. |
| Timer still active after job archived/completed | Not explicit | Keep timer visible, warn "job is complete/archived", allow complete/reassign. |
| Editing time linked to completed/exported payroll | Activity slip exported entries lock edit/delete; other exports do not | Standardize lock/review rules. |
| Deleted job linked to time | No explicit handling | Keep stored job label, show "Original job no longer active", allow reassign. |
| Unassigned chargeable time | Surfaced only in actual labour panel | Add global Unassigned Time review queue. |
| Manual entry replacing timer entry | No duplicate/manual conflict workflow beyond overlap | Add reason and link to corrected entry if manual correction replaces a mistake. |
| Offline timer starts | No real offline queue; legacy localStorage migration exists | Either explicitly unsupported or add kiosk offline queue. |
| Break across job switch | Break uses separate active break entry with resume context | Good, but needs clearer UI wording. |
| Overtime/payroll rules | Not implemented | Avoid unless payroll needs it; if needed, keep export-only. |
| Timezone/date split over midnight | Date is single `date`, timestamps are ISO | Add policy: time belongs to start date unless manually corrected. |
| Staff hourly rate changes | Entry stores rate when normalized | Document historical rate rule. |
| Multi-segment edit | Blocked | Good. Add "split/review only" workflow later. |

## Recommended Standard Rules

### Recommended Defaults for a 4-Person Workshop

1. One active job/activity timer per staff member.
2. Starting a new job automatically pauses the previous job.
3. Paused timers can be resumed, but completed timers stay completed.
4. Any timer longer than 10 hours should be marked "Needs review".
5. Any timer left active overnight should appear in "Time needing attention".
6. Job is required for all chargeable work.
7. Non-chargeable activities may be unassigned, but should still have useful notes.
8. Timeclock `TimeEntry` records are the source of truth for actual job labour.
9. Manual entries are allowed only as corrections and must be marked manual.
10. Manual correction reason should be required when changing another person's time, changing exported time, or entering a previous day.
11. Deleted time should become "voided/excluded", not hard-deleted, unless admin cleanup is needed.
12. Breaks should not count toward job costing.
13. Activity slip export should lock exported source entries.
14. Actual labour categories should be auto-suggested, user-adjustable, and reviewed when "Other".
15. Unassigned time should be reviewed daily or at least before sending final profitability reports.

## Rule Matrix

| Rule | Trigger | Conditions | Result | Affected Module | User Impact | Validation | Edge Cases |
|---|---|---|---|---|---|---|---|
| Single active timer | Start/resume timer | Same staff has active timer | Existing timer pauses; new/resumed timer active | Time Tracking | Simple switching | DB unique index + server service | Clock skew |
| Duplicate same timer blocked | Start timer | Same staff/job/activity already active | Existing timer returned | Time Tracking | Prevents duplicate button taps | Server context match | Different notes not included in context |
| Pause timer | Pause action | Active entry | Open segment closes; status paused | Time Tracking | Can resume later | Server status rules | Malformed segment repair |
| Complete timer | Complete action | Active or paused entry | Entry completed; hours derived | Time Tracking | Ends costing | Server normalization | Paused completion uses last segment end |
| Resume paused timer | Resume action | Paused entry | New segment opens; active timer pauses | Time Tracking | Good interruption handling | Server service | Resume before another timer ended gets clamped |
| Manual correction | Save correction | Valid staff/date/time/activity | Completed manual entry created | Time Tracking | Fix missed time | UI + server validation | Requires reason rule recommended |
| Overlap prevention | Create/update completed entry | Same staff overlapping range | Request blocked | Time Tracking/API | Protects costing | Server authoritative | Active timers excluded |
| Break handling | Break button | Active work timer | Work pauses; break timer starts | Time Tracking | Simple break flow | Server status/segments | Resume context missing |
| Job operation sync | TimeEntry mutation | `job_operation_id` set | Operation actual hours/status updates | Workflow/Jobs | Actuals automatic | Server side effect | Deleted operation |
| Quote actual labour | Quote/job review | Time linked by quote/job | Actual labour card updates | Quotes/Jobs | No duplicate entry | Client helper | Needs server report parity |
| Export lock | Activity slip export | Rows valid and selected | Source TimeEntries marked exported | MYOB Export | Prevents accidental edits | UI hides edit/delete | Timesheet export not same |
| Attendance daily export | Daily export | ClockIn complete | Daily rows generated from attendance | MYOB Export | Payroll-style hours | Export validation | Missing clock-out |

## Workflow Recommendations

### Priority 1

- Add "Time Needing Attention" queue:
  - active over 10 hours
  - active from previous day
  - unassigned chargeable time
  - category = Other
  - manual entries without reason
- Replace hard delete with:
  - "Void this time entry"
  - "Exclude from costing"
  - "Restore"
- Make chargeable job requirement consistent:
  - `Labour`, `Rework`, `Sanding`, `Van Mileage`, and `Other Chargeable` should require job.
- Add plain helper text explaining:
  - "Clock In / Out records attendance."
  - "Start Timer records job labour."

### Priority 2

- Add workflow task picker to Quick Start after job selection.
- Add a global Unassigned Time screen, also reachable from dashboard.
- Formalize time review fields in schema: `labour_category`, `exclude_from_costing`, `costing_reviewed`, `reviewed_by`, `reviewed_at`, `voided`, `void_reason`.
- Add configurable category mapping rules screen.
- Add stale timer notifications in dashboard/time tracking.

### Priority 3

- Add optional offline kiosk queue only if workshop device connectivity is unreliable.
- Add export batch restore/undo.
- Add manager weekly sign-off if business wants it; avoid heavy approval by default.

## UI / UX Recommendations

- Rename "Manual correction" to "Fix missed time" for workshop friendliness.
- Split the top workflow into two labelled sections:
  - "Staff Attendance"
  - "Job Labour Timers"
- Add a daily review strip: "3 items need attention".
- Use large labelled buttons for Complete, Pause, Break, Resume.
- Show "Safe for export" only when no long timers, no overlaps, no missing staff/job where required.
- Replace browser confirm deletes with calm dialogs explaining consequences.
- In Timesheets, avoid deleting grouped rows directly. Offer "Open source entries".
- Show unassigned time on dashboard.

## Recommended Test Matrix

| Area | Tests |
|---|---|
| Timers | start, pause, resume, complete, same-context duplicate, switching active timer, one active timer constraint |
| Overlaps | manual create overlap, edit overlap, multi-segment overlap, clock skew repair |
| Forgotten timers | >10h warning, overnight warning, review queue inclusion |
| Breaks | start break pauses work, resume break completes break and resumes work, break excluded from job costing |
| Job linkage | chargeable activity requires job, unassigned non-chargeable allowed, archived job warning |
| Workflow tasks | linked task actual hours update, task status moves to in progress, removing link updates old task |
| Quote actual labour | linked by job/quote, unassigned review, category mapping, exclude costing, variance, cost impact |
| Manual corrections | manual flag, reason requirements, staff rate snapshot, previous-day entry |
| Export | activity slip validation, exported lock, grouped export marks all source IDs, export history |
| Reporting | excludes breaks, excludes costing-excluded time where applicable, archived data visibility |
| Kiosk/mobile | large controls, local kiosk auth, retry behaviour, no double taps creating duplicates |

## Key Recommendation

Keep the time system simple:

- Attendance clock tells who was at work.
- Job timer tells what job/activity they worked on.
- TimeEntry remains the actual-labour source of truth.
- Daily review catches mistakes.
- Export locks payroll/job-costing records.

This is enough for a four-person joinery workshop and avoids enterprise-style workforce complexity.
