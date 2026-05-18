import { GUIDED_TOURS, HELP_ARTICLES, HELP_CATEGORIES, HELP_TRAINING_PACKS } from "@/lib/helpContent";
import { HELP_RECORDINGS } from "@/lib/helpRecordings";

export const HELP_LIBRARY_CATEGORIES = [
  "Getting Started",
  "Quotes",
  "Imports",
  "Pricing",
  "Workshop",
  "Scheduling",
  "Documents",
  "Labour Tracking",
  "Files",
  "Troubleshooting",
];

export const REQUIRED_HELP_WORKFLOWS = [
  "First Login",
  "Dashboard Overview",
  "Understanding Navigation",
  "Beginner Overview",
  "Create Lead",
  "Converting Lead to Quote",
  "Create Quote",
  "Understanding Quote Statuses",
  "Edit quote line items",
  "Use Sections and Categories",
  "Understanding Review States",
  "Import Mozaik CSV",
  "Import Supplier Price List",
  "Import PDF Quote",
  "Review Imported Items",
  "Resolve Import Warnings",
  "Confirm import",
  "Undo/Revert Import",
  "Understanding Gross Margin",
  "Understanding Material Margin",
  "Adjust Margin from Margin Cards",
  "Auto-Inclusions",
  "Triggered Auto-Inclusions",
  "Every-Job Inclusions",
  "GST Handling",
  "Generate Quote Document",
  "Print Quote List",
  "Print Contracts",
  "Hidden/Collapsed Sections",
  "Export Quote Archive",
  "Archive Quote",
  "Restore Archived Quote",
  "Install Planner",
  "Assign Workflow Tasks",
  "Workshop Board",
  "Production Handover Pack",
  "Move Jobs Through Workshop Stages",
  "Site Measure Workflow",
  "Record Actual Labour",
  "Review Timeclock Entries",
  "Understanding Actual vs Estimated Labour",
  "Upload Files",
  "Understanding File Versions",
  "Using File Previews",
  "Adding Document Information",
];

const OUTDATED_TERMS = [
  "Screenshot placeholder",
  "Schema mapping",
  "Commit import",
  "staged rows",
  "staging",
  "rollback",
  "Triggered Inclusions",
  "commercial records",
];

function normalise(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function contentText() {
  return [
    ...HELP_ARTICLES.map((article) => JSON.stringify(article)),
    ...GUIDED_TOURS.map((tour) => JSON.stringify(tour)),
    ...HELP_RECORDINGS.map((recording) => JSON.stringify(recording)),
    ...HELP_TRAINING_PACKS.map((pack) => JSON.stringify(pack)),
  ].join("\n");
}

function workflowCovered(workflow) {
  const wanted = normalise(workflow);
  return HELP_RECORDINGS.some((recording) => normalise(recording.title) === wanted)
    || GUIDED_TOURS.some((tour) => normalise(tour.title) === wanted)
    || HELP_ARTICLES.some((article) => normalise(article.title).includes(wanted));
}

export function auditHelpContent() {
  const text = contentText();
  const recordingTitles = HELP_RECORDINGS.map((recording) => normalise(recording.title));
  const duplicateRecordingTitles = recordingTitles.filter((title, index) => recordingTitles.indexOf(title) !== index);
  const missingWorkflows = REQUIRED_HELP_WORKFLOWS.filter((workflow) => !workflowCovered(workflow));
  const outdatedTerms = OUTDATED_TERMS.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
  const brokenRecordingLinks = HELP_RECORDINGS.filter((recording) => {
    const articleOk = HELP_ARTICLES.some((article) => article.id === recording.articleId);
    const tourOk = !recording.tourId || GUIDED_TOURS.some((tour) => tour.id === recording.tourId);
    return !articleOk || !tourOk;
  }).map((recording) => recording.id);
  const emptyRecordingMedia = HELP_RECORDINGS.filter((recording) => (
    !recording.videoUrl
    || !recording.thumbnailUrl
    || !recording.captionTrackUrl
    || recording.generationStatus !== "ready"
    || !recording.steps.every((step) => step.screenshotUrl && step.click?.label)
  )).map((recording) => recording.id);
  const missingCategories = HELP_LIBRARY_CATEGORIES.filter((category) => {
    if (HELP_CATEGORIES.includes(category)) return false;
    return !HELP_RECORDINGS.some((recording) => recording.category === category);
  });

  return {
    counts: {
      articles: HELP_ARTICLES.length,
      tours: GUIDED_TOURS.length,
      trainingPacks: HELP_TRAINING_PACKS.length,
      recordings: HELP_RECORDINGS.length,
    },
    duplicateRecordingTitles,
    missingWorkflows,
    outdatedTerms,
    brokenRecordingLinks,
    emptyRecordingMedia,
    missingCategories,
    status: duplicateRecordingTitles.length || missingWorkflows.length || outdatedTerms.length || brokenRecordingLinks.length || emptyRecordingMedia.length || missingCategories.length
      ? "needs_attention"
      : "clean",
  };
}

export const HELP_CONTENT_AUDIT = auditHelpContent();
