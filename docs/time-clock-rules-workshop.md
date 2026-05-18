# Output 2 - JoinerFlow Time Clock Rules Workshop

Use this document to agree the official time clock rules with the business.

Each rule is written in plain English. Mark one decision and add notes.

## Timers

### Rule: TC-001
Category: Timers

Statement:
"Only one job/activity timer should be allowed to run per staff member at a time."

Why this matters:
Prevents double-counted labour and unreliable job costing.

Current behaviour:
The system already enforces one active `TimeEntry` per staff member and pauses the previous timer when a new one starts.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-002
Category: Timers

Statement:
"Starting a new job timer should automatically pause the staff member's current job timer."

Why this matters:
The operator does not need to remember to stop one job before starting another.

Current behaviour:
Already implemented.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-003
Category: Timers

Statement:
"If a staff member taps the same running timer again, the system should not create a duplicate timer."

Why this matters:
Prevents double taps or nervous repeated taps from damaging the records.

Current behaviour:
Already handled on the server for the same timer context.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-004
Category: Forgotten Timers

Statement:
"Any timer still running after 10 hours should be marked as Needs Review."

Why this matters:
Long timers are often forgotten clock-outs and can distort job cost.

Current behaviour:
Not currently implemented as a review rule.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-005
Category: Forgotten Timers

Statement:
"Any timer still running the next morning should appear in a Time Needing Attention list."

Why this matters:
Makes forgotten timers easy to fix before they affect costing or export.

Current behaviour:
Not currently implemented.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-006
Category: Rounding

Statement:
"Timer durations should be recorded to the nearest minute and shown as decimal hours."

Why this matters:
This is accurate enough for job costing without making the system fussy.

Current behaviour:
The system records minutes and rounds hours to 2 decimals.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Breaks

### Rule: TC-007
Category: Breaks

Statement:
"Break time should not count toward job labour cost."

Why this matters:
Keeps job costing fair and prevents lunch breaks being charged to a job.

Current behaviour:
Break entries are marked separately and reporting excludes break entries.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-008
Category: Breaks

Statement:
"Starting a break should pause the current job timer."

Why this matters:
The staff member can return to the job later without re-entering job details.

Current behaviour:
Already implemented.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Quote / Job Linking

### Rule: TC-009
Category: Job Linking

Statement:
"All chargeable work should be linked to a job wherever possible."

Why this matters:
Unlinked chargeable time cannot be reliably used for job costing.

Current behaviour:
Some activities require a job; `Other Chargeable` currently does not.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-010
Category: Job Linking

Statement:
"Non-chargeable work can be recorded without a job, but it should still have a clear note."

Why this matters:
Admin, meetings, training, and leave may not belong to one job.

Current behaviour:
Non-job activities can be unassigned.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-011
Category: Unassigned Time

Statement:
"Unassigned chargeable time should be reviewed before profitability reports are trusted."

Why this matters:
Missed job links make actual labour look too low on jobs.

Current behaviour:
Quote/job actual labour can show unassigned time for review.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-012
Category: Archived Jobs

Statement:
"If time is linked to a completed or archived job, the record should stay visible and editable only through a review action."

Why this matters:
Old time must not disappear, but changes to finished work should be deliberate.

Current behaviour:
No clear archived-job time rule.

Recommended default:
Needs discussion

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Labour Categories

### Rule: TC-013
Category: Labour Categories

Statement:
"Every job-costing time entry should have a labour category such as Cutting, Assembly, Hardware, Install, or Site Measure."

Why this matters:
Category breakdowns help improve future quoting.

Current behaviour:
Actual Labour auto-maps categories from activity/task text.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-014
Category: Labour Categories

Statement:
"The system should automatically suggest the labour category, but staff/admin can change it if needed."

Why this matters:
Reduces typing while still allowing corrections.

Current behaviour:
Auto-suggestion exists in Actual Labour review.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-015
Category: Labour Categories

Statement:
"Time mapped to Other should be reviewed if it affects job costing."

Why this matters:
Too much Other time makes reports less useful.

Current behaviour:
Other is the fallback category, but it is not globally flagged.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Workflow Tasks / Production Stages

### Rule: TC-016
Category: Workflow Tasks

Statement:
"When possible, time should be linked to the production task or workflow stage being worked on."

Why this matters:
This helps compare estimated vs actual time for Cutting, Assembly, Install, and similar stages.

Current behaviour:
The system supports task links and updates task actual hours, but the quick-start UI does not strongly guide this.

Recommended default:
Enabled, but keep optional for speed

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-017
Category: Workflow Tasks

Statement:
"Starting time on a workflow task should move that task to In Progress."

Why this matters:
The job board reflects what is actually happening without extra admin.

Current behaviour:
Server updates linked task status when actual time appears.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Editing / Corrections

### Rule: TC-018
Category: Corrections

Statement:
"Manual time entries should be used only when no timeclock record exists or a missed clock-in/out needs fixing."

Why this matters:
Keeps the timeclock as the source of truth.

Current behaviour:
Manual corrections are available.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-019
Category: Corrections

Statement:
"Manual corrections should require a reason when changing previous-day time or another person's time."

Why this matters:
Keeps trust in the records without creating heavy approvals.

Current behaviour:
Reason is optional.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-020
Category: Editing

Statement:
"Exported time entries should be locked from normal editing."

Why this matters:
Prevents changes after payroll/export has been prepared.

Current behaviour:
Activity slip exported entries are locked in the main table.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-021
Category: Safety

Statement:
"Time entries should usually be voided or excluded, not permanently deleted."

Why this matters:
Staff feel safer, and mistakes can be recovered.

Current behaviour:
Delete is currently available before export.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Reporting / Export

### Rule: TC-022
Category: Reporting

Statement:
"Break entries should be excluded from job costing and labour variance reports."

Why this matters:
Keeps job labour focused on work time.

Current behaviour:
Reports and actual labour calculations exclude breaks.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-023
Category: Export

Statement:
"Exported activity slip entries should be marked as exported and hidden from the pending export list."

Why this matters:
Prevents exporting the same time twice.

Current behaviour:
Already implemented for activity slips.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-024
Category: Export

Statement:
"Daily payroll hours should come from staff attendance clock-in/out, not job timers."

Why this matters:
Payroll attendance and job costing are related but not the same.

Current behaviour:
Daily hours export uses `ClockIn` attendance totals.

Recommended default:
Needs discussion

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-025
Category: Lunch Deduction

Statement:
"For payroll export, deduct 30 minutes lunch when a staff member works more than 5.5 hours, except on Fridays."

Why this matters:
This changes payroll export hours and must match the business rule.

Current behaviour:
Already implemented in daily hours export.

Recommended default:
Needs business confirmation

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Mobile / Workshop Use

### Rule: TC-026
Category: Workshop Use

Statement:
"The clock screen should use large touch-friendly buttons suitable for a workshop tablet."

Why this matters:
Staff should be able to use it quickly without precise mouse clicks.

Current behaviour:
Mostly implemented with large cards/buttons.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-027
Category: Offline Use

Statement:
"If the workshop device is offline, the system should clearly say time cannot be saved, unless an offline queue is added."

Why this matters:
Staff need to know whether their clock action was actually recorded.

Current behaviour:
No full offline mode; old local timer migration exists.

Recommended default:
Needs discussion

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

## Audit / Trust

### Rule: TC-028
Category: Audit

Statement:
"The system should record who changed, reviewed, excluded, or voided a time entry."

Why this matters:
Builds confidence without blaming staff.

Current behaviour:
Generic audit exists; actual labour review has lightweight audit event fields.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-029
Category: Actual Labour

Statement:
"Actual labour on quotes and jobs should come from timeclock entries, not from separate manual labour totals."

Why this matters:
Avoids duplicate entry and makes actual-vs-estimated reporting trustworthy.

Current behaviour:
Implemented in quote/job Actual Labour review.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

### Rule: TC-030
Category: Review

Statement:
"Before a job is closed, unassigned time and time marked Needs Review should be checked."

Why this matters:
Makes completed job profitability more accurate.

Current behaviour:
Partially supported through quote/job actual labour review.

Recommended default:
Enabled

Decision:
[ ] Agree
[ ] Disagree
[ ] Needs Discussion

Notes:
______________________

---

# Time Tracking Rules Questionnaire

Use this questionnaire to define the remaining rules before implementation.

For each question, mark one decision and add notes.

## 1. Clock In vs Job Timer

### Question: TQ-001
Category: Clock In vs Job Timer

Question:
Should "Clock In / Clock Out" mean staff attendance only, separate from job labour tracking?

Why this matters:
This keeps payroll attendance separate from job costing.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-002
Category: Clock In vs Job Timer

Question:
Should staff always clock in for the day before starting a job timer?

Why this matters:
Prevents job labour being recorded when the person is not recorded as present.

Recommended default:
Needs discussion

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-003
Category: Clock In vs Job Timer

Question:
If someone starts a job timer but has not clocked in for attendance, should the system warn them?

Why this matters:
This catches missed attendance clock-ins without blocking urgent workshop work.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 2. Forgotten Timers

### Question: TQ-004
Category: Forgotten Timers

Question:
Should any job timer running longer than 10 hours be marked "Needs Review"?

Why this matters:
Long timers are often forgotten clock-outs and can distort job cost.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-005
Category: Forgotten Timers

Question:
Should an overnight job timer automatically appear in a "Time Needing Attention" list?

Why this matters:
Makes forgotten timers easy to fix before they affect costing or export.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-006
Category: Forgotten Timers

Question:
Should the system ever auto-stop forgotten timers?

Why this matters:
Auto-stopping can prevent huge errors, but it may also guess incorrectly.

Recommended default:
No, review first

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 3. Job Linking

### Question: TQ-007
Category: Job Linking

Question:
Should all chargeable time require a linked job?

Why this matters:
Unlinked chargeable time cannot be reliably used for job costing.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-008
Category: Job Linking

Question:
Should non-chargeable time, like meetings or training, be allowed without a job?

Why this matters:
Some time is real work but does not belong to one customer job.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-009
Category: Unassigned Time

Question:
Should unassigned chargeable time appear on the dashboard until fixed?

Why this matters:
This makes missed job links visible instead of buried in reports.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 4. Labour Categories

### Question: TQ-010
Category: Labour Categories

Question:
Should every job-costing time entry have a labour category?

Examples:
Cutting, Edging, Assembly, Hardware, Install, Site Measure, Delivery, Admin / Plans, Other.

Why this matters:
Category breakdowns help improve future quoting.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-011
Category: Labour Categories

Question:
Should JoinerFlow automatically suggest the labour category from the activity or task name?

Why this matters:
Reduces typing while still allowing corrections.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-012
Category: Labour Categories

Question:
Should entries categorised as "Other" require review?

Why this matters:
Too much "Other" time makes reports less useful.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 5. Editing and Corrections

### Question: TQ-013
Category: Editing

Question:
Who should be allowed to edit time entries?

Why this matters:
The rule should protect records without creating too much admin.

Options:
[ ] Any staff member can edit their own time
[ ] Office/admin only
[ ] Manager/admin only
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-014
Category: Corrections

Question:
Should manual corrections require a reason?

Why this matters:
Reasons help everyone trust the record later.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-015
Category: Editing

Question:
Should exported time entries be locked from normal editing?

Why this matters:
Prevents changes after payroll or activity slips have been prepared.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-016
Category: Safety

Question:
Should time entries be voided or excluded instead of permanently deleted?

Why this matters:
This keeps mistakes recoverable and reduces fear of breaking records.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 6. Breaks

### Question: TQ-017
Category: Breaks

Question:
Should breaks be recorded as separate break entries?

Why this matters:
Separate break entries make it clearer what happened during the day.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-018
Category: Breaks

Question:
Should breaks always be excluded from job costing?

Why this matters:
Keeps customer job labour focused on work time.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-019
Category: Breaks

Question:
Should starting a break pause the current job timer?

Why this matters:
The operator can resume work later without re-entering the job.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 7. Workflow Tasks

### Question: TQ-020
Category: Workflow Tasks

Question:
Should staff be encouraged to select the workflow task or stage when starting a timer?

Examples:
Cutting, Assembly, Install.

Why this matters:
This improves estimated-vs-actual learning by workshop stage.

Recommended default:
Yes, but optional for speed

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-021
Category: Workflow Tasks

Question:
Should starting time on a workflow task automatically move that task to "In Progress"?

Why this matters:
The job board reflects what is actually happening without extra admin.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-022
Category: Workflow Tasks

Question:
Should completing all time on a workflow task ever automatically mark the task complete?

Why this matters:
Automatic completion may save clicks, but it can also mark work complete too early.

Recommended default:
No, staff should confirm

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 8. Payroll / Export

### Question: TQ-023
Category: Payroll / Export

Question:
Should payroll daily hours come from attendance clock-in/out rather than job timers?

Why this matters:
Payroll attendance and job costing are related but not the same.

Recommended default:
Needs discussion

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-024
Category: Payroll / Export

Question:
Should the 30-minute lunch deduction rule stay?

Current rule:
Deduct 30 minutes when worked hours exceed 5.5, except Fridays.

Why this matters:
This changes payroll export hours and must match the business rule.

Recommended default:
Needs business confirmation

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-025
Category: Payroll / Export

Question:
After export, should records be locked automatically?

Why this matters:
Prevents accidental changes after payroll/export has been prepared.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

## 9. Review Process

### Question: TQ-026
Category: Review Process

Question:
Should there be a daily "Time Needing Attention" review list?

Why this matters:
Small daily fixes are easier than fixing a week of messy time later.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-027
Category: Review Process

Question:
What should appear in the review list?

Options:
[ ] Forgotten timers
[ ] Overnight timers
[ ] Unassigned chargeable time
[ ] Entries with "Other" category
[ ] Manual corrections
[ ] Missing notes
[ ] Export errors
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-028
Category: Review Process

Question:
Should jobs be blocked from final archive/complete if time still needs review?

Why this matters:
Blocking can protect accuracy, but warnings may feel calmer for a small workshop.

Recommended default:
Warn only, do not block

Decision:
[ ] Yes, block completion
[ ] No, warn only
[ ] Needs Discussion

Notes:
______________________

## 10. Workshop Use

### Question: TQ-029
Category: Workshop Use

Question:
Should the time clock be designed primarily for tablet/touch use in the workshop?

Why this matters:
Staff should be able to use it quickly without precise mouse clicks.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________

### Question: TQ-030
Category: Workshop Use

Question:
Should the system prioritise fewer buttons and fewer choices, even if that means less flexibility?

Why this matters:
This keeps the time clock simple and usable under workshop pressure.

Recommended default:
Yes

Decision:
[ ] Yes
[ ] No
[ ] Needs Discussion

Notes:
______________________
