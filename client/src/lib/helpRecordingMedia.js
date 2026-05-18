const WALKTHROUGH_ASSET_ROOT = "/help/walkthroughs";

function dataUri(mimeType, contents) {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(contents)}`;
}

function buildCaptionTrack(recording) {
  const cues = recording.steps.map((step, index) => {
    const start = index * 4;
    const end = start + 4;
    const time = (seconds) => `00:00:${String(seconds).padStart(2, "0")}.000`;
    return `${index + 1}\n${time(start)} --> ${time(end)}\n${step.caption}\n`;
  }).join("\n");
  return `WEBVTT\n\n${cues}`;
}

function screenshotKeyForRecording(recording) {
  const title = String(recording.title || "").toLowerCase();
  const category = String(recording.category || "");

  if (category === "Getting Started") {
    return title.includes("dashboard") ? "dashboard" : "getting-started";
  }
  if (category === "Quotes") {
    return title.includes("lead") ? "leads" : "quotes";
  }
  if (category === "Imports" || category === "Pricing") {
    return "pricing";
  }
  if (category === "Documents" || category === "Files") {
    return "documents";
  }
  if (category === "Workshop") {
    return title.includes("board") ? "workshop" : "jobs";
  }
  if (category === "Scheduling") {
    return "schedule";
  }
  if (category === "Labour Tracking") {
    return "time-tracking";
  }
  if (category === "Troubleshooting") {
    return "help";
  }

  return "help";
}

function screenshotUrl(key) {
  return `${WALKTHROUGH_ASSET_ROOT}/${key}.jpg`;
}

function clickPoint(index, key) {
  const common = [
    { xPercent: 88, yPercent: 22 },
    { xPercent: 55, yPercent: 50 },
    { xPercent: 82, yPercent: 72 },
  ];

  const byKey = {
    "getting-started": [
      { xPercent: 18, yPercent: 42 },
      { xPercent: 56, yPercent: 36 },
      { xPercent: 80, yPercent: 24 },
    ],
    dashboard: [
      { xPercent: 18, yPercent: 28 },
      { xPercent: 50, yPercent: 44 },
      { xPercent: 78, yPercent: 62 },
    ],
    quotes: [
      { xPercent: 93, yPercent: 22 },
      { xPercent: 48, yPercent: 47 },
      { xPercent: 66, yPercent: 86 },
    ],
    leads: [
      { xPercent: 90, yPercent: 22 },
      { xPercent: 45, yPercent: 46 },
      { xPercent: 70, yPercent: 76 },
    ],
    pricing: [
      { xPercent: 18, yPercent: 53 },
      { xPercent: 54, yPercent: 48 },
      { xPercent: 80, yPercent: 70 },
    ],
    documents: [
      { xPercent: 25, yPercent: 46 },
      { xPercent: 57, yPercent: 52 },
      { xPercent: 82, yPercent: 76 },
    ],
    jobs: [
      { xPercent: 90, yPercent: 22 },
      { xPercent: 45, yPercent: 50 },
      { xPercent: 73, yPercent: 74 },
    ],
    workshop: [
      { xPercent: 22, yPercent: 52 },
      { xPercent: 53, yPercent: 50 },
      { xPercent: 78, yPercent: 50 },
    ],
    schedule: [
      { xPercent: 28, yPercent: 34 },
      { xPercent: 54, yPercent: 48 },
      { xPercent: 78, yPercent: 56 },
    ],
    "time-tracking": [
      { xPercent: 22, yPercent: 40 },
      { xPercent: 50, yPercent: 52 },
      { xPercent: 78, yPercent: 66 },
    ],
    help: [
      { xPercent: 26, yPercent: 34 },
      { xPercent: 52, yPercent: 48 },
      { xPercent: 74, yPercent: 70 },
    ],
  };

  return (byKey[key] || common)[index % 3] || common[index % 3];
}

export function attachGeneratedRecordingMedia(recording) {
  const key = screenshotKeyForRecording(recording);
  const imageUrl = screenshotUrl(key);
  const steps = recording.steps.map((step, index) => {
    const click = {
      ...clickPoint(index, key),
      label: step.highlight || step.title,
    };

    return {
      ...step,
      click,
      targetLabel: click.label,
      screenshotUrl: imageUrl,
    };
  });
  const enrichedRecording = {
    ...recording,
    mediaType: "application-screenshot-recording",
    hasGeneratedVideo: false,
    generationStatus: "ready",
    steps,
  };

  return {
    ...enrichedRecording,
    videoUrl: imageUrl,
    thumbnailUrl: imageUrl,
    captionTrackUrl: dataUri("text/vtt", buildCaptionTrack(enrichedRecording)),
  };
}
