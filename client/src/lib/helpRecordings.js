import { GUIDED_TOURS } from "@/lib/helpContent";
import { attachGeneratedRecordingMedia } from "@/lib/helpRecordingMedia";

const ROUTE_BY_CATEGORY = {
  "Getting Started": "/",
  Quotes: "/quotes",
  Imports: "/pricing",
  Pricing: "/pricing",
  Documents: "/quotes",
  Workshop: "/jobs",
  Scheduling: "/schedule",
  "Labour Tracking": "/time-tracking",
  Files: "/quotes",
  Troubleshooting: "/help",
};

const ARTICLE_BY_CATEGORY = {
  "Getting Started": "beginner-quick-start-guide",
  Quotes: "quoting-guide",
  Imports: "import-guide",
  Pricing: "pricing-overview",
  Documents: "quote-documents-and-generation",
  Workshop: "workshop-user-guide",
  Scheduling: "install-planner-guide",
  "Labour Tracking": "reporting-and-time-tracking",
  Files: "files-and-document-information",
  Troubleshooting: "common-mistakes-guide",
};

const TOUR_BY_TITLE = {
  "First Login": "first-login-welcome",
  "First login": "first-login-welcome",
  "Dashboard Overview": "dashboard-overview",
  "Dashboard overview": "dashboard-overview",
  "Understanding Navigation": "dashboard-overview",
  "Beginner Overview": "first-login-welcome",
  "Understanding quote workflow": "create-first-quote",
  "Beginner overview of JoinerFlow": "first-login-welcome",
  "Create Lead": "create-first-lead",
  "Creating a Lead": "create-first-lead",
  "Converting Lead to Quote": "create-first-quote",
  "Create Quote": "create-first-quote",
  "Create a new quote": "create-first-quote",
  "Understanding Quote Statuses": "review-states",
  "Understanding Review States": "review-states",
  "Use Sections and Categories": "categories-vs-sections",
  "Adjust margins": "adjust-margin-cards",
  "Generate Quote Document": "generate-quote-document",
  "Generate quote document": "generate-quote-document",
  "Print Quote List": "print-quote-list",
  "Print quote list": "print-quote-list",
  "Print Contracts": "generating-contracts",
  "Export Quote Archive": "archive-export-quote",
  "Exporting Quote Archives": "archive-export-quote",
  "Archive Quote": "archive-quote",
  "Archive quote": "archive-quote",
  "Restore Archived Quote": "restore-archived-quote",
  "Restore archived quote": "restore-archived-quote",
  "Import Mozaik CSV": "import-mozaik-csv",
  "Import Supplier Price List": "import-supplier-price-list",
  "Import supplier pricing": "import-supplier-price-list",
  "Import PDF Quote": "import-pdf-quote",
  "Import PDF quote": "import-pdf-quote",
  "Review imported items": "review-imported-pricing",
  "Review Imported Items": "review-imported-pricing",
  "Resolve import warnings": "understanding-review-warnings",
  "Resolve Import Warnings": "understanding-review-warnings",
  "Confirm import": "import-review-workflow",
  "Undo/revert import": "import-mistake-recovery",
  "Undo/Revert Import": "import-mistake-recovery",
  "Understanding material margin": "adjust-margin-cards",
  "Understanding Material Margin": "adjust-margin-cards",
  "Understanding gross margin": "margin-warnings",
  "Understanding Gross Margin": "margin-warnings",
  "Adjust Margin from Margin Cards": "adjust-margin-cards",
  "Auto-inclusions": "auto-inclusions-overview",
  "Auto-Inclusions": "auto-inclusions-overview",
  "Matched automatic additions": "triggered-auto-inclusions",
  "Triggered Auto-Inclusions": "triggered-auto-inclusions",
  "Every-job inclusions": "every-job-auto-inclusions",
  "Every-Job Inclusions": "every-job-auto-inclusions",
  "GST Handling": "gst-handling",
  "Hidden/Collapsed Sections": "hidden-collapsed-sections",
  "Printing Contracts": "generating-contracts",
  "Install Planner": "install-planner",
  "Use install planner": "install-planner",
  "Assign Workflow Tasks": "assign-workflow-tasks",
  "Assign workflow tasks": "assign-workflow-tasks",
  "Production Handover Pack": "production-handover-pack",
  "Review handover pack": "production-handover-pack",
  "Workshop Board": "workflow-statuses",
  "Move Jobs Through Workshop Stages": "workshop-stages",
  "Move jobs through workshop stages": "workshop-stages",
  "Site Measure Workflow": "site-measure-workflow",
  "Record Actual Labour": "actual-labour-tracking",
  "Record actual labour": "actual-labour-tracking",
  "Review Timeclock Entries": "review-timeclock-entries",
  "Review timeclock entries": "review-timeclock-entries",
  "Understanding Actual vs Estimated Labour": "actual-labour-tracking",
  "Understanding Estimated vs Actual Labour": "actual-labour-tracking",
  "Upload Files": "uploading-files",
  "Upload files": "uploading-files",
  "Review previews": "preview-documents",
  "Using File Previews": "preview-documents",
  "Generate contracts": "generating-contracts",
  "Print documents": "printing-documents",
  "Understanding File Versions": "file-versions",
  "Understand file versions": "file-versions",
};

const DEFINITIONS = [
  ["Getting Started", "First Login", "Open JoinerFlow, sign in safely, and find the help controls again later."],
  ["Getting Started", "Dashboard Overview", "Scan attention items, ready work, upcoming installs, and recent activity."],
  ["Getting Started", "Understanding Navigation", "Use the left navigation without needing to learn every module at once."],
  ["Getting Started", "Beginner Overview", "See the simple Millbrook path from enquiry to quote, job, install, and archive."],
  ["Getting Started", "Understanding quote workflow", "See the normal path from lead to quote, pricing, document, install, and archive."],
  ["Quotes", "Create Quote", "Create a quote shell, link the right contact, and open the quote record."],
  ["Quotes", "Create Lead", "Capture a new enquiry with only the useful details needed for follow-up."],
  ["Quotes", "Converting Lead to Quote", "Move from enquiry to quote without retyping customer or site details."],
  ["Quotes", "Understanding Quote Statuses", "Read quote status, review state, ready-to-send, archive, and restore signals."],
  ["Quotes", "Edit quote line items", "Change a line safely and check the totals before moving on."],
  ["Quotes", "Use Sections and Categories", "Put quote lines in the right document section and pricing category."],
  ["Quotes", "Understanding Review States", "Understand Needs Review, Missing Cost, Ready to Send, Safe to Print, Imported, and Auto-Added."],
  ["Quotes", "Adjust margins", "Use margin cards without touching hidden calculations."],
  ["Documents", "Generate Quote Document", "Preview and generate a client-facing quote document."],
  ["Documents", "Print Quote List", "Print the quote list after checking review and missing-cost states."],
  ["Documents", "Print Contracts", "Print the current contract only after preview and terms review."],
  ["Documents", "Hidden/Collapsed Sections", "Find advanced document sections without cluttering the normal workflow."],
  ["Documents", "Export Quote Archive", "Export a finished quote pack with documents, files, and history."],
  ["Documents", "Archive Quote", "Archive finished quote work without losing history."],
  ["Documents", "Restore Archived Quote", "Bring back an archived quote when work restarts."],
  ["Imports", "Import Mozaik CSV", "Upload, match columns, review items, and confirm a Mozaik import."],
  ["Imports", "Import Supplier Price List", "Update supplier price lists through the shared review flow."],
  ["Imports", "Import PDF Quote", "Extract PDF quote lines and check confidence warnings."],
  ["Imports", "Review Imported Items", "Review imported rows before they become trusted pricing."],
  ["Imports", "Resolve Import Warnings", "Understand warning messages and choose the next safe action."],
  ["Imports", "Confirm import", "Confirm reviewed changes and read the success summary."],
  ["Imports", "Undo/Revert Import", "Recover when the wrong file or target was used."],
  ["Pricing", "Understanding Material Margin", "Check material margin without getting lost in pricing internals."],
  ["Pricing", "Understanding Gross Margin", "Use gross margin warnings as a business safety check."],
  ["Pricing", "Adjust Margin from Margin Cards", "Use margin cards without touching hidden calculations."],
  ["Pricing", "Auto-Inclusions", "See how automatic additions prevent forgotten standard costs."],
  ["Pricing", "Triggered Auto-Inclusions", "Create matched automatic additions for supporting hardware or labour."],
  ["Pricing", "Every-Job Inclusions", "Set standard additions that appear on normal jobs."],
  ["Pricing", "GST Handling", "Check GST treatment before quote totals or documents are issued."],
  ["Scheduling", "Install Planner", "Move install work visually and understand conflicts."],
  ["Workshop", "Assign Workflow Tasks", "Give each next action a clear owner."],
  ["Workshop", "Workshop Board", "Use job stages to see what the workshop should work on next."],
  ["Workshop", "Production Handover Pack", "Check drawings, files, site notes, and documents before production."],
  ["Workshop", "Move Jobs Through Workshop Stages", "Move jobs one stage at a time as real work progresses."],
  ["Workshop", "Site Measure Workflow", "Capture measure details, photos, checklist items, access notes, and client requests."],
  ["Labour Tracking", "Record Actual Labour", "Record real labour time against the right job."],
  ["Labour Tracking", "Review Timeclock Entries", "Check time entries before reporting or export."],
  ["Labour Tracking", "Understanding Actual vs Estimated Labour", "Compare planned labour with real time so future quotes improve."],
  ["Files", "Upload Files", "Attach drawings, PDFs, photos, and sketches to the right record."],
  ["Files", "Understanding File Versions", "Identify the latest drawing or quote revision."],
  ["Files", "Using File Previews", "Preview uploaded files before printing or handover."],
  ["Files", "Adding Document Information", "Add plain notes that explain what a file is used for."],
];

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildSteps(title, category) {
  const simple = String(title).toLowerCase();
  if (simple.includes("lead")) {
    return [
      ["Open Leads", "Start from the Leads page and search for an existing customer before creating a new enquiry.", "This keeps customer history connected and prevents duplicate names."],
      ["Capture the useful details", "Add contact details, site address, job type, notes, and the next follow-up.", "Short practical notes reduce repeated phone calls and missed requests."],
      ["Move toward quote", "Create or open the related quote when pricing work begins.", "The quote then carries the lead history forward without retyping."],
    ];
  }
  if (simple.includes("import")) {
    return [
      ["Upload the file", "Drop the file into the shared import wizard and wait for detection.", "This shows the user that checking a file is not the same as applying it."],
      ["Review imported items", "Watch the rows appear with warnings, column matching, and review states.", "This is the safe pause point before pricing or quote lines change."],
      ["Confirm or undo", "Confirm Import, read the success summary, and notice the Undo option.", "Visible recovery shows what to do when a wrong file is chosen."],
    ];
  }
  if (simple.includes("archive") || simple.includes("restore")) {
    return [
      ["Check the record first", "Confirm the quote, documents, files, and notes are complete before changing archive state.", "Checking first keeps finished work complete and recoverable."],
      ["Use the archive or restore action", "Choose Archive to hide finished work or Restore to bring it back into active lists.", "Archive is safer than delete because the history remains available."],
      ["Read the confirmation", "Check the success message so you know what changed and where to find the record next.", "Clear confirmation shows where to find the record next."],
    ];
  }
  if (simple.includes("print") || simple.includes("generate") || simple.includes("preview") || simple.includes("contract") || category === "Documents") {
    return [
      ["Open the document action", "Start from the quote or file record and choose the current document action.", "Starting from the record prevents old details being printed."],
      ["Preview slowly", "Check client details, scope, totals, GST, terms, and page breaks.", "Preview catches the mistakes paper users expect to catch before printing."],
      ["Save, send, or print", "Use the main action only when the document is safe.", "This keeps issued documents aligned with reviewed quote data."],
    ];
  }
  if (category === "Workshop" || category === "Scheduling" || category === "Labour Tracking") {
    return [
      ["Open the job or planner", "Start where the work is visible: the job, handover pack, planner, or time screen.", "This keeps workshop actions tied to the real job record."],
      ["Check the current state", "Look at owner, stage, files, notes, dates, and warnings before changing anything.", "Checking first prevents accidental handover or scheduling changes."],
      ["Make one clear update", "Move the card, assign the task, add time, or update the stage.", "One visible change at a time is easier to trust and recover from."],
    ];
  }
  return [
    ["Start from the right screen", "Open the screen shown in the walkthrough and find the highlighted action.", "Starting in the expected place reduces searching and rework."],
    ["Follow the highlighted fields", "Watch the cursor pause on the fields or buttons that matter.", "Visual repetition helps new users remember the workflow later."],
    ["Check the result", "Look for the success message, badge, preview, or updated row.", "The final check shows the user the job is complete and safe to move on."],
  ];
}

function buildRecording([category, title, summary]) {
  const id = slugify(title);
  const route = ROUTE_BY_CATEGORY[category] || "/";
  const tourId = TOUR_BY_TITLE[title] || "";
  const articleId = TOUR_BY_TITLE[title]
    ? GUIDED_TOURS.find((tour) => tour.id === TOUR_BY_TITLE[title])?.articleId || ARTICLE_BY_CATEGORY[category]
    : ARTICLE_BY_CATEGORY[category];
  const steps = buildSteps(title, category).map(([stepTitle, instruction, why], index) => ({
    title: stepTitle,
    instruction,
    why,
    caption: `${index + 1}. ${stepTitle}: ${instruction}`,
    screenshotAlt: `${title} walkthrough frame ${index + 1}`,
    highlight: index === 0 ? "Main action" : index === 1 ? "Review area" : "Success or next step",
  }));
  return attachGeneratedRecordingMedia({
    id,
    title,
    category,
    summary,
    durationSeconds: category === "Getting Started" ? 45 : 90,
    level: category === "Pricing" && !title.includes("Auto") && !title.includes("GST") ? "advanced" : "beginner",
    route,
    articleId,
    tourId,
    thumbnailLabel: title,
    captionTrack: steps.map((step) => step.caption),
    steps,
    keywords: [title, category, summary, articleId, tourId].filter(Boolean).join(" ").toLowerCase().split(/\s+/),
  });
}

export const HELP_RECORDINGS = DEFINITIONS.map(buildRecording);
export const HELP_RECORDING_MAP = new Map(HELP_RECORDINGS.map((recording) => [recording.id, recording]));

export function getHelpRecording(recordingId) {
  return HELP_RECORDING_MAP.get(recordingId) || null;
}

export function getRecordingForTour(tourId) {
  return HELP_RECORDINGS.find((recording) => recording.tourId === tourId) || null;
}

export function getRecordingsForArticle(articleId) {
  return HELP_RECORDINGS.filter((recording) => recording.articleId === articleId);
}

export function getRecommendedRecordings(limit = 6) {
  return HELP_RECORDINGS.filter((recording) => recording.level === "beginner").slice(0, limit);
}

export function filterHelpRecordings({ query = "", category = "all", level = "all" } = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return HELP_RECORDINGS.filter((recording) => {
    if (category !== "all" && recording.category !== category) return false;
    if (level !== "all" && recording.level !== level) return false;
    if (!normalizedQuery) return true;
    return [
      recording.title,
      recording.summary,
      recording.category,
      recording.articleId,
      recording.tourId,
      ...recording.keywords,
      ...recording.steps.flatMap((step) => [step.title, step.instruction, step.why]),
    ].join(" ").toLowerCase().includes(normalizedQuery);
  });
}

export function getRecordingCategories() {
  return [...new Set(HELP_RECORDINGS.map((recording) => recording.category))];
}

export function buildRecordingStepGuide(recordingId) {
  const recording = getHelpRecording(recordingId);
  if (!recording) return null;
  return {
    title: recording.title,
    articleId: recording.articleId,
    route: recording.route,
    steps: recording.steps.map((step, index) => ({
      number: index + 1,
      title: step.title,
      instruction: step.instruction,
      screenshotAlt: step.screenshotAlt,
      screenshotUrl: step.screenshotUrl,
      why: step.why,
    })),
  };
}
