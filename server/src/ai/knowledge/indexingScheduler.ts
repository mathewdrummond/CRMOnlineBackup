import { listKnowledgeSources } from "./chunkStorage";
import { getAiConfig } from "../aiConfig";
import { scheduleKnowledgeQueue, triggerKnowledgeInitialScan } from "./indexingQueue";
import { queueKnowledgeSourceReindex } from "./knowledgeIndexer";

let schedulerTimer: NodeJS.Timeout | null = null;

export function startKnowledgeIndexingScheduler() {
  if (!getAiConfig().enabled) {
    return;
  }

  if (schedulerTimer) {
    return;
  }

  triggerKnowledgeInitialScan();

  schedulerTimer = setInterval(() => {
    const now = Date.now();
    const sources = listKnowledgeSources()
      .filter((source) => source.enabled)
      .filter((source) => !source.paused);
    for (const source of sources) {
      const lastIndexedAt = Date.parse(String(source.last_indexed_date || ""));
      const minutesSinceIndexed = Number.isFinite(lastIndexedAt)
        ? (now - lastIndexedAt) / 60_000
        : Number.POSITIVE_INFINITY;
      if (minutesSinceIndexed >= Math.max(5, Number(source.scan_interval_minutes || 60))) {
        queueKnowledgeSourceReindex(source.id);
      }
    }
    scheduleKnowledgeQueue(100);
  }, 60_000);

  if (schedulerTimer && typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }
}

export function stopKnowledgeIndexingScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
