import { createEntityRecord, listEntityRecords } from "./db";
import { normalizeDateOnly } from "./dateUtils";
export { DEFAULT_INSTALL_ESTIMATOR_SETTINGS } from "./installEstimatorDefaults";
import { DEFAULT_INSTALL_ESTIMATOR_SETTINGS } from "./installEstimatorDefaults";
import { EntityRecord, LocalUser } from "./types";

const STANDARD_DAY_HOURS = 10.5;

type EstimatorContext = {
  quoteItems?: EntityRecord[];
  pricingRows?: EntityRecord[];
};

function toText(value: unknown) {
  return String(value || "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function parseList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }
  const raw = toText(value);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toText(item)).filter(Boolean);
    }
  } catch {
    // Legacy string format.
  }
  return raw.split(/[|,;]+/).map((item) => item.trim()).filter(Boolean);
}

function complexityMultiplier(value: unknown) {
  const normalized = toText(value).toLowerCase();
  if (normalized === "simple") return 0.9;
  if (normalized === "detailed") return 1.15;
  if (normalized === "premium" || normalized === "premium_bespoke" || normalized === "premium/bespoke") return 1.3;
  if (normalized === "high_risk" || normalized === "high-risk" || normalized === "high risk install") return 1.4;
  return 1;
}

function normaliseCategory(value: unknown) {
  return toText(value).toLowerCase();
}

function safeDescription(row: EntityRecord) {
  return `${toText(row.description)} ${toText(row.name)} ${toText(row.item)} ${toText(row.original_description)}`.trim().toLowerCase();
}

function sumQuantities(rows: EntityRecord[], predicate: (row: EntityRecord, haystack: string) => boolean) {
  return round(rows
    .filter((row) => predicate(row, safeDescription(row)))
    .reduce((sum, row) => sum + Math.max(0, toNumber(row.quantity || 0, 0) || 1), 0));
}

function countCabinets(pricingRows: EntityRecord[], quoteItems: EntityRecord[]) {
  const cabinetRefs = new Set(
    pricingRows
      .map((row) => toText(row.cabinet_reference))
      .filter(Boolean)
  );
  if (cabinetRefs.size > 0) {
    return cabinetRefs.size;
  }

  return quoteItems.filter((row) => /cabinet|base unit|wall unit|pantry|tall unit|wardrobe/i.test(safeDescription(row))).length;
}

function countTallUnits(rows: EntityRecord[]) {
  return rows.filter((row) => /tall unit|tall cabinet|pantry|full height/i.test(safeDescription(row))).length;
}

function countBenchtops(rows: EntityRecord[]) {
  return rows.filter((row) => /benchtop|bench top|countertop|stone top|laminate top/i.test(safeDescription(row))).length;
}

function applyRoundingRule(hours: number, rule: string) {
  if (rule === "none") {
    return round(hours);
  }

  const increment = rule === "nearest_day" ? STANDARD_DAY_HOURS : STANDARD_DAY_HOURS / 2;
  return round(Math.max(increment, Math.ceil(hours / increment) * increment));
}

export function ensureDefaultInstallEstimatorSetting(actor: LocalUser | null = null, requestSource = "install-estimator-default") {
  const existing = listEntityRecords("InstallEstimatorSetting", { filters: { is_default: true }, limit: 1 })[0];
  if (existing) {
    return existing;
  }

  return createEntityRecord("InstallEstimatorSetting", DEFAULT_INSTALL_ESTIMATOR_SETTINGS, {
    actor,
    request_source: requestSource,
    skip_audit: true,
  });
}

export function resolveInstallEstimatorSetting() {
  return listEntityRecords("InstallEstimatorSetting", { filters: { is_default: true }, limit: 1 })[0]
    || ensureDefaultInstallEstimatorSetting();
}

export function estimateInstallDurationForJob(
  job: EntityRecord,
  settings: EntityRecord,
  context: EstimatorContext = {}
) {
  const quoteItems = Array.isArray(context.quoteItems) ? context.quoteItems : [];
  const pricingRows = Array.isArray(context.pricingRows) ? context.pricingRows : [];
  const allRows = pricingRows.length > 0 ? pricingRows : quoteItems;
  const complexity = toText(job.install_complexity || settings.default_complexity || "standard").toLowerCase() || "standard";

  const cabinetCount = countCabinets(pricingRows, quoteItems);
  const drawerCount = sumQuantities(allRows, (row, haystack) => normaliseCategory(row.category) === "drawer_systems_runners" || /drawer|runner|legrabox|metabox|merivo/.test(haystack));
  const frontCount = sumQuantities(allRows, (row, haystack) => normaliseCategory(row.category) === "doors_fronts" || /door|front/.test(haystack));
  const tallUnitCount = countTallUnits(allRows);
  const panelCount = sumQuantities(allRows, (row, haystack) => /panel|applied panel|end panel/.test(haystack));
  const hardwareAccessoryCount = sumQuantities(allRows, (row, haystack) =>
    ["hardware", "hinges", "handles_pulls", "bins_accessories"].includes(normaliseCategory(row.category))
    || /hinge|handle|pull|accessor|bin|shelf pin/.test(haystack)
  );
  const benchtopCount = countBenchtops(allRows);
  const subcontractCount = sumQuantities(allRows, (row) => normaliseCategory(row.category) === "subcontract");

  const assumptions = {
    base_install_hours: toNumber(settings.base_install_hours, 2),
    cabinet_count: cabinetCount,
    hours_per_cabinet: toNumber(settings.hours_per_cabinet, 1.15),
    drawer_count: drawerCount,
    hours_per_drawer: toNumber(settings.hours_per_drawer, 0.3),
    front_count: frontCount,
    hours_per_door_front: toNumber(settings.hours_per_door_front, 0.18),
    tall_unit_count: tallUnitCount,
    hours_per_tall_unit: toNumber(settings.hours_per_tall_unit, 0.85),
    panel_count: panelCount,
    hours_per_panel: toNumber(settings.hours_per_panel, 0.2),
    hardware_accessory_count: hardwareAccessoryCount,
    hours_per_hardware_accessory_item: toNumber(settings.hours_per_hardware_accessory_item, 0.05),
    benchtop_count: benchtopCount,
    hours_per_benchtop_item: toNumber(settings.hours_per_benchtop_item, 1.5),
    subcontract_count: subcontractCount,
    hours_per_subcontract_item: toNumber(settings.hours_per_subcontract_item, 0.5),
    manual_scope_adjustment_hours: toNumber(settings.manual_scope_adjustment_hours, 0),
    complexity,
    complexity_multiplier: complexityMultiplier(complexity),
  };

  const rawHours = round(
    assumptions.base_install_hours
    + assumptions.cabinet_count * assumptions.hours_per_cabinet
    + assumptions.drawer_count * assumptions.hours_per_drawer
    + assumptions.front_count * assumptions.hours_per_door_front
    + assumptions.tall_unit_count * assumptions.hours_per_tall_unit
    + assumptions.panel_count * assumptions.hours_per_panel
    + assumptions.hardware_accessory_count * assumptions.hours_per_hardware_accessory_item
    + assumptions.benchtop_count * assumptions.hours_per_benchtop_item
    + assumptions.subcontract_count * assumptions.hours_per_subcontract_item
    + assumptions.manual_scope_adjustment_hours
  );

  const minimumDuration = toNumber(settings.minimum_duration_hours, 4);
  const adjustedHours = round(Math.max(minimumDuration, rawHours * assumptions.complexity_multiplier));
  const roundedHours = applyRoundingRule(adjustedHours, toText(settings.rounding_rule || "nearest_half_day"));
  const estimatedDays = round(roundedHours / STANDARD_DAY_HOURS);

  let suggestedCrewSize = 1;
  if (roundedHours >= toNumber(settings.crew_size_four_person_hours, 31.5)) suggestedCrewSize = 4;
  else if (roundedHours >= toNumber(settings.crew_size_three_person_hours, 21)) suggestedCrewSize = 3;
  else if (roundedHours >= toNumber(settings.crew_size_two_person_hours, 10.5)) suggestedCrewSize = 2;

  const warnings: string[] = [];
  if (!job.quote_id && quoteItems.length === 0 && pricingRows.length === 0) {
    warnings.push("No linked quote pricing data was found for this job.");
  }
  if (cabinetCount === 0) warnings.push("Cabinet count was not detected, so duration may be understated.");
  if (pricingRows.length === 0) warnings.push("No imported pricing rows were available; estimate used committed quote items only.");

  const confidence = pricingRows.length > 0 && cabinetCount > 0
    ? "high"
    : quoteItems.length > 0
      ? "medium"
      : "low";

  return {
    job_id: toText(job.id),
    quote_id: toText(job.quote_id),
    estimated_install_hours: roundedHours,
    estimated_install_days: estimatedDays,
    suggested_crew_size: suggestedCrewSize,
    assumptions,
    confidence,
    warnings,
    source_counts: {
      quote_items: quoteItems.length,
      pricing_rows: pricingRows.length,
    },
    complexity,
    rounding_rule: toText(settings.rounding_rule || "nearest_half_day"),
  };
}

export function buildInstallJobEstimates(jobs: EntityRecord[] = [], actor: LocalUser | null = null) {
  const settings = resolveInstallEstimatorSetting() || ensureDefaultInstallEstimatorSetting(actor);
  const quoteItems = listEntityRecords("QuoteItem", { limit: 10000 });
  const pricingRows = listEntityRecords("PricingQuoteItem", { limit: 20000 });
  const quoteItemsByQuote = new Map<string, EntityRecord[]>();
  const pricingRowsByQuote = new Map<string, EntityRecord[]>();

  quoteItems.forEach((item) => {
    const quoteId = toText(item.quote_id);
    if (!quoteId) return;
    const collection = quoteItemsByQuote.get(quoteId) || [];
    collection.push(item);
    quoteItemsByQuote.set(quoteId, collection);
  });

  pricingRows.forEach((row) => {
    const quoteId = toText(row.quote_id);
    if (!quoteId) return;
    const collection = pricingRowsByQuote.get(quoteId) || [];
    collection.push(row);
    pricingRowsByQuote.set(quoteId, collection);
  });

  const estimates: Record<string, Record<string, unknown>> = {};
  (jobs || []).forEach((job) => {
    const quoteId = toText(job.quote_id);
    estimates[toText(job.id)] = estimateInstallDurationForJob(job, settings, {
      quoteItems: quoteItemsByQuote.get(quoteId) || [],
      pricingRows: pricingRowsByQuote.get(quoteId) || [],
    });
  });

  return {
    settings,
    estimates,
    generated_at: normalizeDateOnly(new Date()),
  };
}
