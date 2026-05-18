import React, { useEffect, useMemo, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { Ban, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/helpers";
import { toClientFacingIncGst, useClientMode } from "@/lib/clientMode.jsx";
import { useSortableRows } from "@/lib/tableSorting";
import GuidedWorkflow from "@/components/GuidedWorkflow";
import ImportWizard from "@/components/imports/ImportWizard";
import {
  ADD_PRICING_CATEGORY_VALUE,
  DEFAULT_PRICING_CATEGORIES,
  buildPricingCategoryRecord,
  isDuplicatePricingCategoryName,
  normalisePricingCategoryOptions,
} from "@/lib/pricingCategories";
import {
  DEFAULT_PRICING_SECTIONS,
  buildPricingSectionRecord,
  isDuplicatePricingSectionName,
  normalisePricingSectionOptions,
} from "@/lib/pricingSections";

const COMPLEXITY_OPTIONS = [
  ["simple", "Simple 0.9x"],
  ["standard", "Standard 1.0x"],
  ["detailed", "Detailed 1.15x"],
  ["premium_bespoke", "Premium 1.30x"],
  ["high_risk_install", "High-risk 1.40x"],
];

const INCLUSION_QUANTITY_LOGIC = [
  ["fixed", "Fixed quantity"],
  ["per_imported_item", "Per imported item"],
  ["per_set", "Per set"],
  ["custom_multiplier", "Custom multiplier"],
  ["custom_formula", "Custom formula"],
];

const DEFAULT_CSV = `Cabinet,Item Name,Material Type,Quantity,Length,Width,Thickness,Edging,Tags
Kitchen A,Base panel,18mm Melamine board,6,720,580,18,1mm ABS,cabinet
Kitchen A,Adjustable shelf,18mm Melamine shelf,4,560,300,18,1mm ABS,
Kitchen A,Tandem drawer runner,Blum runner,3,,,,,drawer
Kitchen A,Clip top hinge,Blum hinge,8,,,,,hardware
Install,Install allowance,Consumables,1,,,,,install`;

const DEFAULT_GLOBAL_INCLUSION_FORM = {
  description: "",
  category: "misc_fixings",
  quantity: 1,
  unit: "ea",
  cost: 0,
  markup: 30,
  gst_treatment: "ex_gst",
  active: true,
  review_required: true,
  notes: "",
};

const DEFAULT_TRIGGERED_RULE_FORM = {
  rule_name: "",
  match_mode: "all",
  trigger_category: "",
  trigger_description_contains: "",
  trigger_product_number_equals: "",
  trigger_product_number_contains: "",
  trigger_supplier: "",
  trigger_item_type: "",
  inclusion_pricing_item_id: "",
  inclusion_description: "",
  inclusion_category: "misc_fixings",
  inclusion_sku: "",
  inclusion_supplier: "",
  quantity_logic: "per_imported_item",
  quantity_multiplier: 1,
  unit: "ea",
  cost: 0,
  markup_percent: 30,
  gst_treatment: "ex_gst",
  review_required: true,
  active: true,
  notes: "",
};

const PRICE_LIST_ROW_SORT_COLUMNS = {
  status: { accessor: (row) => row.review_state || row.status, type: "status" },
  sku: { accessor: (row) => row.mapped?.product_number || row.mapped?.supplier_item_code, type: "text" },
  description: { accessor: (row) => row.mapped?.description, type: "text" },
  unit: { accessor: (row) => row.mapped?.unit, type: "text" },
  old: { accessor: (row) => row.old_values?.buy_price, type: "currency" },
  new: { accessor: (row) => row.new_values?.buy_price, type: "currency" },
  change: { accessor: (row) => row.price_change_percent, type: "percent" },
  warnings: { accessor: (row) => [...(row.warnings || []), ...(row.errors || [])].join(" "), type: "text" },
};

const PRICE_HISTORY_SORT_COLUMNS = {
  supplier: { accessor: (row) => row.supplier, type: "text" },
  product: { accessor: (row) => row.product_number, type: "text" },
  old: { accessor: (row) => row.old_cost, type: "currency" },
  new: { accessor: (row) => row.new_cost, type: "currency" },
  change: { accessor: (row) => row.percentage_change, type: "percent" },
  when: { accessor: (row) => row.created_date, type: "date" },
};

const MASTER_PRICE_LIST_SORT_COLUMNS = {
  state: { accessor: (row) => `${row.is_active === false ? "Inactive" : "Active"} ${row.is_user_created ? "Saved default" : "Imported"}`, type: "status" },
  name: { accessor: (row) => row.name || row.description, type: "text" },
  supplier: { accessor: (row) => row.supplier || row.supplier_name, type: "text" },
  sku: { accessor: (row) => row.product_number || row.supplier_sku || row.original_sku, type: "text" },
  category: { accessor: (row) => row.category, type: "text" },
  unit: { accessor: (row) => row.unit || row.supplier_unit, type: "text" },
  buy: { accessor: (row) => row.buy_price, type: "currency" },
  markup: { accessor: (row) => row.markup_percent ?? row.default_markup, type: "percent" },
  updated: { accessor: (row) => row.last_price_update_date || row.last_price_update_at || row.updated_date || row.created_date, type: "date" },
};

const ITEM_REVIEW_SORT_COLUMNS = {
  item: { accessor: ({ item }) => item.name, type: "text" },
  state: { accessor: ({ item }) => item.review_state || "active", type: "status" },
  category: { accessor: ({ item }) => item.category, type: "text" },
  qty: { accessor: ({ item }) => item.quantity, type: "number" },
  buy: { accessor: ({ item }) => item.buy_price, type: "currency" },
  markup: { accessor: ({ item }) => item.markup_percent, type: "percent" },
  cabinet: { accessor: ({ item }) => item.cabinet_reference, type: "text" },
  dimensions: { accessor: ({ item }) => [item.dimensions?.length_mm, item.dimensions?.width_mm, item.dimensions?.thickness_mm].filter(Boolean).join(" x "), type: "text" },
};

const GLOBAL_INCLUSION_SORT_COLUMNS = {
  state: { accessor: (record) => `${record.active === false ? "Inactive" : "Active"} ${record.review_required !== false ? "Review" : ""}`, type: "status" },
  description: { accessor: (record) => record.description, type: "text" },
  category: { accessor: (record) => record.category, type: "text" },
  qty: { accessor: (record) => record.quantity, type: "number" },
  cost: { accessor: (record) => record.cost, type: "currency" },
  markup: { accessor: (record) => record.markup, type: "percent" },
  gst: { accessor: (record) => record.gst_treatment, type: "text" },
};

const TRIGGERED_RULE_SORT_COLUMNS = {
  state: { accessor: (record) => `${record.active === false ? "Inactive" : "Active"} ${record.review_required !== false ? "Review" : ""}`, type: "status" },
  rule: { accessor: (record) => record.rule_name, type: "text" },
  trigger: { accessor: (record) => [record.trigger_category, record.trigger_description_contains, record.trigger_product_number_equals, record.trigger_product_number_contains, record.trigger_supplier, record.trigger_item_type].filter(Boolean).join(" "), type: "text" },
  inclusion: { accessor: (record) => record.inclusion_description, type: "text" },
  qty: { accessor: (record) => record.quantity_multiplier, type: "number" },
  cost: { accessor: (record) => record.cost, type: "currency" },
  markup: { accessor: (record) => record.markup_percent, type: "percent" },
  gst: { accessor: (record) => record.gst_treatment, type: "text" },
};

const AUTO_MODAL_SORT_COLUMNS = {
  description: { accessor: ({ row }) => row.inclusion_description, type: "text" },
  sku: { accessor: ({ row }) => row.inclusion_sku, type: "text" },
  category: { accessor: ({ row }) => row.inclusion_category, type: "text" },
  logic: { accessor: ({ row }) => row.quantity_logic, type: "text" },
  value: { accessor: ({ row }) => row.quantity_value, type: "number" },
  cost: { accessor: ({ row }) => row.unit_cost, type: "currency" },
  markup: { accessor: ({ row }) => row.markup_percent, type: "percent" },
};

const CATEGORY_SORT_COLUMNS = {
  state: { accessor: (row) => `${row.statusLabel || ""} ${row.is_default ? "Default" : "Custom"}`, type: "status" },
  name: { accessor: (row) => row.label, type: "text" },
  key: { accessor: (row) => row.value, type: "text" },
  pricing: { accessor: (row) => row.usage.pricingItems, type: "number" },
  quotes: { accessor: (row) => row.usage.quoteItems, type: "number" },
  inclusions: { accessor: (row) => row.usage.globalInclusions + row.usage.triggeredRuleInclusions + row.usage.triggeredRuleTriggers, type: "number" },
  imported: { accessor: (row) => row.usage.importItems + row.usage.quoteImports, type: "number" },
};

const SECTION_SORT_COLUMNS = {
  state: { accessor: (row) => `${row.is_active === false ? "Inactive" : "Active"} ${row.is_default ? "Default" : "Custom"}`, type: "status" },
  order: { accessor: (row) => row.display_order, type: "number" },
  name: { accessor: (row) => row.label, type: "text" },
  key: { accessor: (row) => row.value, type: "text" },
  quotes: { accessor: (row) => row.usage.quoteItems, type: "number" },
  imports: { accessor: (row) => row.usage.importItems + row.usage.quoteImports, type: "number" },
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function findMasterItem(item, pricingItems = []) {
  const productNumber = String(item.product_number || item.supplier_sku || "").trim().toLowerCase();
  const name = String(item.name || "").trim().toLowerCase();
  return pricingItems.find((candidate) => (
    productNumber && String(candidate.product_number || candidate.supplier_sku || "").trim().toLowerCase() === productNumber
  )) || pricingItems.find((candidate) => name && String(candidate.name || "").trim().toLowerCase() === name) || null;
}

function applyMasterDefaults(item, pricingItems = [], autoInclusions = []) {
  const master = findMasterItem(item, pricingItems);
  const sku = String(master?.product_number || master?.supplier_sku || item.product_number || item.supplier_sku || "").trim();
  const savedInclusions = master
    ? autoInclusions.filter((rule) => rule.parent_pricing_item_id === master.id || (sku && rule.parent_sku === sku))
    : [];
  return {
    ...item,
    master_item_id: master?.id || "",
    category: master?.category || item.category,
    buy_price: toNumber(master?.buy_price ?? item.buy_price, 0),
    markup_percent: toNumber(master?.markup_percent ?? item.markup_percent, 30),
    unit: master?.unit || item.unit || "ea",
    supplier: master?.supplier || item.supplier || "",
    product_number: master?.product_number || master?.supplier_sku || item.product_number || "",
    row_auto_inclusions: savedInclusions.map((rule) => ({
      inclusion_pricing_item_id: rule.inclusion_pricing_item_id || "",
      inclusion_sku: rule.inclusion_sku || "",
      inclusion_description: rule.inclusion_description || "",
      inclusion_category: rule.inclusion_category || "misc_fixings",
      quantity_logic: rule.quantity_logic || "per_imported_item",
      quantity_value: toNumber(rule.quantity_value, 1),
      custom_formula: rule.custom_formula || "",
      unit_cost: toNumber(rule.unit_cost, 0),
      markup_percent: toNumber(rule.markup_percent, 30),
      is_enabled: rule.is_active !== false,
      learning_state: "Default inclusions saved",
    })),
    auto_inclusion_state: savedInclusions.length > 0 ? "Auto-inclusions applied" : "Needs review",
  };
}

function calculateInclusionQuantity(inclusion, parentItem) {
  const parentQuantity = toNumber(parentItem?.quantity, 1);
  const value = toNumber(inclusion.quantity_value, 1);
  if (inclusion.quantity_logic === "fixed") return value;
  if (inclusion.quantity_logic === "per_set") return parentQuantity * value;
  if (inclusion.quantity_logic === "custom_multiplier") return parentQuantity * value;
  if (inclusion.quantity_logic === "custom_formula") {
    const formula = String(inclusion.custom_formula || "").trim();
    if (/^[0-9+\-*/ ().qQtyquantityvalue]+$/i.test(formula)) {
      try {
        const expression = formula.replace(/quantity|qty|q/gi, String(parentQuantity)).replace(/value/gi, String(value));
        return Math.max(0, Number(Function(`"use strict"; return (${expression});`)()) || 0);
      } catch {
        return 0;
      }
    }
    return 0;
  }
  return parentQuantity * value;
}

function normaliseRuleToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

function normaliseRuleSku(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function splitRuleKeywords(value) {
  return String(value || "")
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function matchesTriggeredRule(rule, sample) {
  const checks = [];
  if (rule.trigger_category) checks.push(normaliseRuleToken(sample.category) === normaliseRuleToken(rule.trigger_category));
  if (rule.trigger_description_contains) checks.push(splitRuleKeywords(rule.trigger_description_contains).some((keyword) => normaliseRuleToken(sample.description).includes(normaliseRuleToken(keyword))));
  if (rule.trigger_product_number_equals) checks.push(normaliseRuleSku(sample.sku) === normaliseRuleSku(rule.trigger_product_number_equals));
  if (rule.trigger_product_number_contains) checks.push(normaliseRuleSku(sample.sku).includes(normaliseRuleSku(rule.trigger_product_number_contains)));
  if (rule.trigger_supplier) checks.push(normaliseRuleToken(sample.supplier) === normaliseRuleToken(rule.trigger_supplier));
  if (rule.trigger_item_type) checks.push(normaliseRuleToken(sample.item_type) === normaliseRuleToken(rule.trigger_item_type));
  if (checks.length === 0) return false;
  return String(rule.match_mode || "all") === "any" ? checks.some(Boolean) : checks.every(Boolean);
}

function calculateTriggeredRuleQuantity(rule, sampleQuantity) {
  const quantity = toNumber(sampleQuantity, 0);
  const multiplier = toNumber(rule.quantity_multiplier, 1);
  if (rule.quantity_logic === "fixed") return multiplier;
  return quantity * multiplier;
}

function buildQuoteAutoInclusions(items = []) {
  return items
    .filter((item) => item.review_state !== "excluded" && item.review_state !== "deleted")
    .flatMap((item) => (item.row_auto_inclusions || [])
      .filter((inclusion) => inclusion.is_enabled !== false)
      .map((inclusion) => ({
        rule_id: `item-auto-${item.master_item_id || item.id}`,
        rule_name: `Auto-inclusion for ${item.name}`,
        item_name: inclusion.inclusion_description,
        category: inclusion.inclusion_category || "misc_fixings",
        quantity: calculateInclusionQuantity(inclusion, item),
        unit: "ea",
        buy_price: toNumber(inclusion.unit_cost, 0),
        markup_percent: toNumber(inclusion.markup_percent, 30),
        reason: `Configured auto-inclusion for ${item.name}`,
        source_item_ids: [item.id],
        is_enabled: true,
      })));
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function PricingModel() {
  const { clientMode } = useClientMode();
  const [rawCsv, setRawCsv] = useState(DEFAULT_CSV);
  const [materialFile, setMaterialFile] = useState(null);
  const [materialStatus, setMaterialStatus] = useState("Waiting for file");
  const [jobName, setJobName] = useState("Millbrook pricing draft");
  const [quoteId, setQuoteId] = useState("");
  const [quoteRecords, setQuoteRecords] = useState([]);
  const [items, setItems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [calculation, setCalculation] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [historical, setHistorical] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labourProfile, setLabourProfile] = useState(null);
  const [priceListImports, setPriceListImports] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceListForm, setPriceListForm] = useState({
    supplier: "",
    file_name: "",
    file_type: "csv",
    file_base64: "",
    movement_threshold_percent: 15,
  });
  const [priceListMappingText, setPriceListMappingText] = useState("");
  const [priceListRows, setPriceListRows] = useState([]);
  const [selectedPriceRows, setSelectedPriceRows] = useState([]);
  const [stagedImport, setStagedImport] = useState(null);
  const [priceListFilter, setPriceListFilter] = useState("all");
  const [masterPricingItems, setMasterPricingItems] = useState([]);
  const [quoteLineItems, setQuoteLineItems] = useState([]);
  const [importLineItems, setImportLineItems] = useState([]);
  const [quoteImportRecords, setQuoteImportRecords] = useState([]);
  const [masterPriceListSearch, setMasterPriceListSearch] = useState("");
  const [semanticPriceMatches, setSemanticPriceMatches] = useState([]);
  const [masterAutoInclusions, setMasterAutoInclusions] = useState([]);
  const [globalAutoInclusions, setGlobalAutoInclusions] = useState([]);
  const [triggeredAutoInclusionRules, setTriggeredAutoInclusionRules] = useState([]);
  const [pricingCategoryRecords, setPricingCategoryRecords] = useState([]);
  const [pricingSectionRecords, setPricingSectionRecords] = useState([]);
  const [globalInclusionForm, setGlobalInclusionForm] = useState(DEFAULT_GLOBAL_INCLUSION_FORM);
  const [editingGlobalInclusionId, setEditingGlobalInclusionId] = useState("");
  const [triggeredRuleForm, setTriggeredRuleForm] = useState(DEFAULT_TRIGGERED_RULE_FORM);
  const [editingTriggeredRuleId, setEditingTriggeredRuleId] = useState("");
  const [triggeredRuleTest, setTriggeredRuleTest] = useState({
    category: "guides",
    description: "MERIVO E",
    sku: "",
    supplier: "",
    item_type: "",
    quantity: 5,
  });
  const [showNewCategoryDialog, setShowNewCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState("");
  const [newCategoryTarget, setNewCategoryTarget] = useState("global-inclusions");
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionError, setNewSectionError] = useState("");
  const [newSectionTarget, setNewSectionTarget] = useState("quote-sections");
  const [categoryStatusFilter, setCategoryStatusFilter] = useState("active");
  const [editingCategoryValue, setEditingCategoryValue] = useState("");
  const [categoryEditor, setCategoryEditor] = useState({ label: "", value: "", is_active: true, recordId: "", is_default: false });
  const [mergeCategorySourceId, setMergeCategorySourceId] = useState("");
  const [mergeCategoryTargetId, setMergeCategoryTargetId] = useState("");
  const [editingSectionValue, setEditingSectionValue] = useState("");
  const [sectionEditor, setSectionEditor] = useState({ label: "", value: "", description: "", display_order: 999, is_active: true, recordId: "", is_default: false });
  const [mergeSectionSourceId, setMergeSectionSourceId] = useState("");
  const [mergeSectionTargetId, setMergeSectionTargetId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [autoModalItemIndex, setAutoModalItemIndex] = useState(null);
  const [autoModalRows, setAutoModalRows] = useState([]);
  const [assumptions, setAssumptions] = useState({
    labour_sell_rate: 110,
    complexity: "standard",
  });

  useEffect(() => {
    let mounted = true;
    crmApi.entities.LabourProfile.filter({ is_default: true }, "-created_date", 1)
      .then((records) => {
        if (!mounted) return;
        const profile = Array.isArray(records) ? records[0] : null;
        setLabourProfile(profile || null);
        if (profile) {
          setAssumptions((current) => ({
            ...current,
            labour_sell_rate: toNumber(profile.labour_sell_rate, 110),
          }));
        }
      })
      .catch(() => {
        if (mounted) setLabourProfile(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadPriceListRecords = async () => {
    const [imports, history, pricingItems, autoInclusions, globalInclusions, triggeredRules, categories, sections, quotes, quoteItems, pricingQuoteItems, quoteImports] = await Promise.all([
      crmApi.entities.PriceListImport.list("-created_date", 50),
      crmApi.entities.PricingItemPriceHistory.list("-created_date", 200),
      crmApi.entities.PricingItem.list("name", 10000),
      crmApi.entities.PricingItemAutoInclusion.filter({ is_active: true }, "parent_sku", 10000),
      crmApi.entities.GlobalAutoInclusion.list("description", 10000),
      crmApi.entities.TriggeredAutoInclusionRule.list("rule_name", 10000),
      crmApi.entities.PricingCategory.list("name", 10000),
      crmApi.entities.PricingSection.list("display_order", 10000),
      crmApi.entities.Quote.list("-created_date", 500),
      crmApi.entities.QuoteItem.list("section", 10000),
      crmApi.entities.PricingQuoteItem.list("section", 10000),
      crmApi.entities.QuoteImport.list("-created_date", 1000),
    ]);
    setPriceListImports(Array.isArray(imports) ? imports : []);
    setPriceHistory(Array.isArray(history) ? history : []);
    setMasterPricingItems(Array.isArray(pricingItems) ? pricingItems : []);
    setMasterAutoInclusions(Array.isArray(autoInclusions) ? autoInclusions : []);
    setGlobalAutoInclusions(Array.isArray(globalInclusions) ? globalInclusions : []);
    setTriggeredAutoInclusionRules(Array.isArray(triggeredRules) ? triggeredRules : []);
    setPricingCategoryRecords(Array.isArray(categories) ? categories : []);
    setPricingSectionRecords(Array.isArray(sections) ? sections : []);
    setQuoteRecords(Array.isArray(quotes) ? quotes : []);
    setQuoteLineItems(Array.isArray(quoteItems) ? quoteItems : []);
    setImportLineItems(Array.isArray(pricingQuoteItems) ? pricingQuoteItems : []);
    setQuoteImportRecords(Array.isArray(quoteImports) ? quoteImports : []);
  };

  useEffect(() => {
    void loadPriceListRecords();
  }, []);

  useEffect(() => {
    const query = masterPriceListSearch.trim();
    if (query.length < 3) {
      setSemanticPriceMatches([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!crmApi.ai?.search) {
        setSemanticPriceMatches([]);
        return;
      }

      void crmApi.ai.search({
        query,
        entity_types: ["PricingItem", "QuoteItem", "QuoteImport", "PriceListImport"],
        limit: 5,
      })
        .then((response) => {
          if (!cancelled) {
            setSemanticPriceMatches(Array.isArray(response?.results) ? response.results : []);
          }
        })
        .catch(() => {
          if (!cancelled) setSemanticPriceMatches([]);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [masterPriceListSearch]);

  const pricingCategoryOptions = useMemo(
    () => normalisePricingCategoryOptions(pricingCategoryRecords, DEFAULT_PRICING_CATEGORIES),
    [pricingCategoryRecords]
  );
  const pricingSectionOptions = useMemo(
    () => normalisePricingSectionOptions(pricingSectionRecords, DEFAULT_PRICING_SECTIONS),
    [pricingSectionRecords]
  );
  const categoryManagementRows = useMemo(() => {
    const byValue = new Map();
    DEFAULT_PRICING_CATEGORIES.forEach(([value, label]) => {
      byValue.set(value, {
        recordId: "",
        value,
        label,
        is_active: true,
        is_default: true,
      });
    });
    pricingCategoryRecords.forEach((record) => {
      const label = String(record.name || record.label || "").trim();
      const value = String(record.key || record.value || buildPricingCategoryRecord(label).key).trim();
      if (!value) return;
      const existing = byValue.get(value) || { value, label: label || value, is_default: false };
      byValue.set(value, {
        ...existing,
        recordId: record.id || "",
        value,
        label: label || existing.label || value,
        is_active: record.is_active !== false,
        is_default: existing.is_default || DEFAULT_PRICING_CATEGORIES.some(([defaultValue]) => defaultValue === value),
      });
    });

    return [...byValue.values()].map((row) => ({
      ...row,
      merged_into_category_id: pricingCategoryRecords.find((record) => String(record.id || "") === String(row.recordId || ""))?.merged_into_category_id || "",
      merged_into_category_name: pricingCategoryRecords.find((record) => String(record.id || "") === String(row.recordId || ""))?.merged_into_category_name || "",
      statusLabel: pricingCategoryRecords.find((record) => String(record.id || "") === String(row.recordId || ""))?.merged_into_category_id
        ? "Merged"
        : row.is_active === false
          ? "Inactive"
          : "Active",
      usage: {
        pricingItems: masterPricingItems.filter((item) => item.category === row.value).length,
        quoteItems: quoteLineItems.filter((item) => item.category === row.value).length,
        globalInclusions: globalAutoInclusions.filter((item) => item.category === row.value).length,
        triggeredRuleInclusions: triggeredAutoInclusionRules.filter((item) => item.inclusion_category === row.value).length,
        triggeredRuleTriggers: triggeredAutoInclusionRules.filter((item) => item.trigger_category === row.value).length,
        importItems: importLineItems.filter((item) => item.category === row.value).length + items.filter((item) => item.category === row.value).length,
        quoteImports: quoteImportRecords.filter((record) => Array.isArray(record.structured_items) && record.structured_items.some((item) => String(item?.category || "").trim() === row.value)).length,
      },
    }));
  }, [pricingCategoryRecords, masterPricingItems, quoteLineItems, globalAutoInclusions, triggeredAutoInclusionRules, importLineItems, items, quoteImportRecords]);
  const categoryLookup = useMemo(
    () => new Map(categoryManagementRows.map((category) => [category.value, category.label])),
    [categoryManagementRows]
  );
  const sectionManagementRows = useMemo(() => {
    const byValue = new Map();
    DEFAULT_PRICING_SECTIONS.forEach(([value, label, displayOrder]) => {
      byValue.set(value, {
        recordId: "",
        value,
        label,
        description: "",
        display_order: displayOrder,
        is_active: true,
        is_default: true,
      });
    });

    pricingSectionRecords.forEach((record) => {
      const label = String(record.name || record.label || "").trim();
      const value = String(record.key || record.value || buildPricingSectionRecord(label).key).trim();
      if (!value) return;
      const existing = byValue.get(value) || { value, label: label || value, description: "", display_order: 999, is_default: false };
      byValue.set(value, {
        ...existing,
        recordId: record.id || "",
        value,
        label: label || existing.label || value,
        description: record.description || "",
        display_order: Number(record.display_order ?? existing.display_order ?? 999),
        is_active: record.is_active !== false,
        is_default: existing.is_default || DEFAULT_PRICING_SECTIONS.some(([defaultValue]) => defaultValue === value),
      });
    });

    const sourceName = (record) => String(record.section || record.heading_category || "").trim();
    const matchesRow = (row, record) => {
      const recordSectionId = String(record.section_id || "").trim();
      const recordSectionKey = String(record.section_key || "").trim();
      const recordSectionName = sourceName(record).toLowerCase();
      return recordSectionId === String(row.recordId || "")
        || (recordSectionKey && recordSectionKey === String(row.value || ""))
        || (recordSectionName && recordSectionName === String(row.label || "").trim().toLowerCase());
    };

    return [...byValue.values()].map((row) => ({
      ...row,
      usage: {
        quoteItems: quoteLineItems.filter((item) => matchesRow(row, item)).length,
        importItems: importLineItems.filter((item) => matchesRow(row, item)).length,
        quoteImports: quoteImportRecords.filter((record) => Array.isArray(record.structured_items) && record.structured_items.some((item) => {
          const heading = String(item?.heading_category || item?.section || "").trim().toLowerCase();
          return heading && heading === String(row.label || "").trim().toLowerCase();
        })).length,
      },
    }));
  }, [importLineItems, pricingSectionRecords, quoteImportRecords, quoteLineItems]);

  const importCsv = async () => {
    setLoading(true);
    try {
      setMaterialStatus("Parsing");
      const result = await crmApi.pricing.importMozaikCsv(materialFile?.file_base64
        ? { file_base64: materialFile.file_base64, file_name: materialFile.name, file_type: materialFile.type, raw_csv: rawCsv, job_name: jobName, quote_id: quoteId }
        : { raw_csv: rawCsv, job_name: jobName, quote_id: quoteId });
      const importedItems = (result.items || []).map((item, index) => ({
        ...applyMasterDefaults(item, masterPricingItems, masterAutoInclusions),
        id: item.id || `item-${index + 1}`,
        review_state: "active",
        learning_state: "Needs review",
      }));
      setItems(importedItems);
      setWarnings(result.warnings || []);
      setMaterialStatus("Needs review");
      await calculate(importedItems, false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "CSV import failed",
        description: error instanceof Error ? error.message : "Check the file and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculate = async (nextItems = items, persist = false) => {
    setSaving(persist);
    try {
      const result = await crmApi.pricing.calculate({
        job_name: jobName,
        quote_id: quoteId,
        items: nextItems.filter((item) => item.review_state !== "excluded" && item.review_state !== "deleted"),
        auto_inclusions: buildQuoteAutoInclusions(nextItems),
        labour_profile: labourProfile || undefined,
        assumptions,
        persist,
      });
      setCalculation(result.calculation);
      setScenarios(result.scenarios || []);
      setHistorical(result.historical || null);
      setWarnings(result.calculation?.warnings || warnings);
      if (persist) {
        toast({ title: "Pricing snapshot saved" });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Pricing calculation failed",
        description: error instanceof Error ? error.message : "Review the items and assumptions.",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index, field, value) => {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, [field]: ["quantity", "buy_price", "markup_percent"].includes(field) ? toNumber(value) : value }
        : item
    )));
  };

  const readImportFile = async (file, setFile, setStatus) => {
    if (!file) return;
    if (!/\.csv$|\.xlsx$|\.pdf$/i.test(file.name)) {
      setStatus("Import failed");
      toast({ variant: "destructive", title: "Invalid file type", description: "Upload a CSV, XLSX, or PDF file." });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStatus("Import failed");
      toast({ variant: "destructive", title: "File too large", description: "Uploads are limited to 25MB." });
      return;
    }
    setStatus("Uploading");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const text = file.name.toLowerCase().endsWith(".csv") ? await file.text().catch(() => "") : "";
    const rowCount = text ? Math.max(0, text.split(/\r?\n/).filter(Boolean).length - 1) : 0;
    const nextFile = {
      name: file.name,
      size: file.size,
      type: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
      file_base64: dataUrl.split(",")[1] || "",
      row_count: rowCount,
    };
    setFile((current) => {
      if (current?.name === nextFile.name && current?.size === nextFile.size && !window.confirm("Process this same file again?")) {
        return current;
      }
      return nextFile;
    });
    setStatus("Ready for mapping");
  };

  const setItemReviewState = (ids, state) => {
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, review_state: state } : item));
    setSelectedItemIds([]);
  };

  const saveDefaults = async () => {
    const editedItems = items.filter((item) => item.review_state !== "deleted");
    if (!window.confirm("Apply these changes to future quotes? Choose Cancel to keep them for this quote/import only.")) {
      setItems((current) => current.map((item) => ({ ...item, learning_state: "This quote only" })));
      return;
    }
    const result = await crmApi.pricing.saveItemDefaults({
      source_import_id: stagedImport?.id || "",
      items: editedItems.map((item) => ({
        pricing_item_id: item.master_item_id || "",
        match_name: item.name,
        fields: {
          category: item.category,
          buy_price: item.buy_price,
          markup_percent: item.markup_percent,
          unit: item.unit,
          supplier: item.supplier || "",
          product_number: item.product_number || item.supplier_sku || "",
          waste_factor: item.waste_factor || 0,
          labour_defaults: item.labour_defaults || {},
          default_inclusion_behaviour: item.default_inclusion_behaviour || "standard",
        },
      })),
    });
    setItems((current) => current.map((item) => ({
      ...item,
      learning_state: item.master_item_id ? "Saved to future quotes" : "New default created",
    })));
    await loadPriceListRecords();
    toast({ title: "Defaults saved", description: `${result.updated || 0} updated · ${result.created || 0} created.` });
  };

  const openAutoModal = (index) => {
    setAutoModalItemIndex(index);
    setAutoModalRows([...(items[index]?.row_auto_inclusions || [])]);
  };

  const saveAutoModal = async (saveAsDefault = false) => {
    const item = items[autoModalItemIndex];
    if (!item) return;
    const nextRows = autoModalRows.map((row) => ({
      ...row,
      parent_item_id: item.id,
      is_enabled: row.is_enabled !== false,
      inclusion_category: row.inclusion_category || row.category || "misc_fixings",
      unit_cost: toNumber(row.unit_cost, 0),
      markup_percent: toNumber(row.markup_percent, 30),
      quantity_value: toNumber(row.quantity_value, 1),
      calculated_quantity: calculateInclusionQuantity(row, item),
      learning_state: saveAsDefault ? "Default inclusions saved" : "Quote-only inclusion",
    }));
    setItems((current) => current.map((row, index) => index === autoModalItemIndex ? {
      ...row,
      row_auto_inclusions: nextRows,
      auto_inclusion_state: saveAsDefault ? "Default inclusions saved" : "Auto-inclusions applied",
    } : row));

    if (saveAsDefault && item.master_item_id) {
      await crmApi.pricing.saveItemAutoInclusions(item.master_item_id, {
        save_as_default: true,
        source_import_id: stagedImport?.id || "",
        inclusions: nextRows.map((row) => ({
          inclusion_pricing_item_id: row.inclusion_pricing_item_id || "",
          inclusion_sku: row.inclusion_sku || "",
          inclusion_description: row.inclusion_description,
          inclusion_category: row.inclusion_category || "misc_fixings",
          quantity_logic: row.quantity_logic || "per_imported_item",
          quantity_value: row.quantity_value || 1,
          custom_formula: row.custom_formula || "",
          unit_cost: row.unit_cost || 0,
          markup_percent: row.markup_percent || 30,
          is_active: row.is_enabled !== false,
        })),
      });
      await loadPriceListRecords();
    }
    setAutoModalItemIndex(null);
    setAutoModalRows([]);
    toast({ title: saveAsDefault ? "Default inclusions saved" : "Quote-only inclusions saved" });
  };

  const updateGlobalInclusionForm = (field, value) => {
    setGlobalInclusionForm((current) => ({ ...current, [field]: value }));
  };

  const openNewCategoryDialog = (target = "global-inclusions") => {
    setNewCategoryTarget(target);
    setNewCategoryName("");
    setNewCategoryError("");
    setShowNewCategoryDialog(true);
  };

  const openNewSectionDialog = (target = "quote-sections") => {
    setNewSectionTarget(target);
    setNewSectionName("");
    setNewSectionError("");
    setShowNewSectionDialog(true);
  };

  const handleGlobalInclusionCategoryChange = (value) => {
    if (value === ADD_PRICING_CATEGORY_VALUE) {
      openNewCategoryDialog("global-inclusions");
      return;
    }
    updateGlobalInclusionForm("category", value);
  };

  const saveNewPricingCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      setNewCategoryError("Category name is required.");
      return;
    }
    if (isDuplicatePricingCategoryName(pricingCategoryOptions, trimmedName)) {
      setNewCategoryError("That category already exists.");
      return;
    }
    try {
      const payload = buildPricingCategoryRecord(trimmedName);
      const created = await crmApi.entities.PricingCategory.create(payload);
      setPricingCategoryRecords((current) => [...current, created]);
      if (newCategoryTarget === "global-inclusions") {
        updateGlobalInclusionForm("category", created.key || payload.key);
      } else if (newCategoryTarget === "triggered-inclusions") {
        updateTriggeredRuleForm("inclusion_category", created.key || payload.key);
      } else if (newCategoryTarget === "category-editor") {
        setEditingCategoryValue(created.key || payload.key);
        setMergeCategorySourceId(created.id || "");
        setMergeCategoryTargetId("");
        setCategoryEditor({
          label: created.name || created.label || trimmedName,
          value: created.key || payload.key,
          is_active: created.is_active !== false,
          recordId: created.id || "",
          is_default: false,
        });
      }
      setShowNewCategoryDialog(false);
      setNewCategoryName("");
      setNewCategoryError("");
      toast({ title: "Category created", description: `${trimmedName} is now available for future inclusions.` });
    } catch (error) {
      setNewCategoryError(error instanceof Error ? error.message : "Category could not be saved.");
    }
  };

  const saveNewPricingSection = async () => {
    const trimmedName = newSectionName.trim();
    if (!trimmedName) {
      setNewSectionError("Section name is required.");
      return;
    }
    if (isDuplicatePricingSectionName(pricingSectionOptions, trimmedName)) {
      setNewSectionError("That section already exists.");
      return;
    }
    try {
      const payload = buildPricingSectionRecord(trimmedName, { displayOrder: pricingSectionOptions.length * 10 + 10 });
      const created = await crmApi.entities.PricingSection.create(payload);
      setPricingSectionRecords((current) => [...current, created]);
      if (newSectionTarget === "section-editor") {
        setEditingSectionValue(created.key || payload.key);
        setSectionEditor({
          label: created.name || created.label || trimmedName,
          value: created.key || payload.key,
          description: created.description || "",
          display_order: Number(created.display_order ?? payload.display_order ?? 999),
          is_active: created.is_active !== false,
          recordId: created.id || "",
          is_default: false,
        });
      }
      setShowNewSectionDialog(false);
      setNewSectionName("");
      setNewSectionError("");
      toast({ title: "Section created", description: `${trimmedName} is now available for quote grouping.` });
    } catch (error) {
      setNewSectionError(error instanceof Error ? error.message : "Section could not be saved.");
    }
  };

  const resetGlobalInclusionForm = () => {
    setGlobalInclusionForm(DEFAULT_GLOBAL_INCLUSION_FORM);
    setEditingGlobalInclusionId("");
  };

  const updateTriggeredRuleForm = (field, value) => {
    setTriggeredRuleForm((current) => ({ ...current, [field]: value }));
  };

  const resetTriggeredRuleForm = () => {
    setTriggeredRuleForm(DEFAULT_TRIGGERED_RULE_FORM);
    setEditingTriggeredRuleId("");
  };

  const editCategory = (row) => {
    setEditingCategoryValue(row.value);
    setMergeCategorySourceId(row.recordId || "");
    setMergeCategoryTargetId("");
    setCategoryEditor({
      label: row.label || "",
      value: row.value || "",
      is_active: row.is_active !== false,
      recordId: row.recordId || "",
      is_default: row.is_default === true,
    });
  };

  const resetCategoryEditor = () => {
    setEditingCategoryValue("");
    setCategoryEditor({ label: "", value: "", is_active: true, recordId: "", is_default: false });
    setMergeCategorySourceId("");
    setMergeCategoryTargetId("");
  };

  const editSection = (row) => {
    setEditingSectionValue(row.value);
    setSectionEditor({
      label: row.label || "",
      value: row.value || "",
      description: row.description || "",
      display_order: Number(row.display_order ?? 999),
      is_active: row.is_active !== false,
      recordId: row.recordId || "",
      is_default: row.is_default === true,
    });
  };

  const resetSectionEditor = () => {
    setEditingSectionValue("");
    setSectionEditor({ label: "", value: "", description: "", display_order: 999, is_active: true, recordId: "", is_default: false });
    setMergeSectionSourceId("");
    setMergeSectionTargetId("");
  };

  const saveCategoryEditor = async () => {
    const trimmedName = String(categoryEditor.label || "").trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Category name required" });
      return;
    }
    const duplicate = categoryManagementRows.some((row) =>
      row.value !== categoryEditor.value &&
      String(row.label || "").trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      toast({ variant: "destructive", title: "Duplicate category", description: "That category name is already in use." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        label: trimmedName,
        key: categoryEditor.value,
        value: categoryEditor.value,
        is_active: categoryEditor.is_active !== false,
      };
      if (categoryEditor.recordId) {
        const updated = await crmApi.entities.PricingCategory.update(categoryEditor.recordId, payload);
        setPricingCategoryRecords((current) => current.map((record) => record.id === updated.id ? updated : record));
      } else {
        const created = await crmApi.entities.PricingCategory.create(payload);
        setPricingCategoryRecords((current) => [...current, created]);
        setMergeCategorySourceId(created.id || "");
        setCategoryEditor((current) => ({ ...current, recordId: created.id || "" }));
      }
      toast({ title: "Category updated" });
    } catch (error) {
      toast({ variant: "destructive", title: "Category save failed", description: error instanceof Error ? error.message : "Check the category details." });
    } finally {
      setSaving(false);
    }
  };

  const toggleCategoryActive = async (row) => {
    if (!row.recordId) {
      editCategory(row);
      toast({ title: "Save this category first", description: "Default categories need a stored record before they can be deactivated." });
      return;
    }
    await crmApi.entities.PricingCategory.update(row.recordId, { is_active: row.is_active === false });
    await loadPriceListRecords();
    if (editingCategoryValue === row.value) {
      setCategoryEditor((current) => ({ ...current, is_active: row.is_active === false }));
    }
    toast({ title: row.is_active === false ? "Category reactivated" : "Category deactivated" });
  };

  const deleteCategory = async (row) => {
    const totalUsage = (row.usage?.pricingItems || 0)
      + (row.usage?.quoteItems || 0)
      + (row.usage?.globalInclusions || 0)
      + (row.usage?.triggeredRuleInclusions || 0)
      + (row.usage?.triggeredRuleTriggers || 0)
      + (row.usage?.importItems || 0)
      + (row.usage?.quoteImports || 0);
    if (totalUsage > 0) {
      toast({
        variant: "destructive",
        title: "Category is in use",
        description: "Deactivate it or merge it into another category instead of deleting it.",
      });
      return;
    }
    if (!row.recordId) {
      toast({ variant: "destructive", title: "Category cannot be archived yet", description: "This default category does not have a stored record yet." });
      return;
    }
    if (!window.confirm(`Archive category "${row.label}"? It can be restored by activating it again if it is still stored.`)) {
      return;
    }
    await crmApi.pricing.deleteCategory(row.recordId);
    setPricingCategoryRecords((current) => current.filter((record) => record.id !== row.recordId));
    if (editingCategoryValue === row.value) {
      resetCategoryEditor();
    }
    toast({ title: "Category archived", description: "Existing history was left intact." });
  };

  const mergeCategories = async () => {
    if (!mergeCategorySourceId || !mergeCategoryTargetId) {
      toast({ variant: "destructive", title: "Choose both categories to merge" });
      return;
    }
    if (mergeCategorySourceId === mergeCategoryTargetId) {
      toast({ variant: "destructive", title: "Choose a different target category" });
      return;
    }
    const source = categoryManagementRows.find((row) => row.recordId === mergeCategorySourceId);
    const target = categoryManagementRows.find((row) => row.recordId === mergeCategoryTargetId);
    if (!source || !target) {
      toast({ variant: "destructive", title: "Category selection invalid" });
      return;
    }
    const summary = `${source.usage.pricingItems} pricing items, ${source.usage.quoteItems} quote line items, ${source.usage.globalInclusions + source.usage.triggeredRuleInclusions + source.usage.triggeredRuleTriggers} auto-inclusion rules, ${source.usage.importItems + source.usage.quoteImports} import mappings`;
    const mergeNotice = target.is_active === false ? "\n\nThe target category is inactive and will still receive the merged records." : "";
    if (!window.confirm(`Merge "${source.label}" into "${target.label}"?\n\nAffected records: ${summary}${mergeNotice}`)) {
      return;
    }
    setSaving(true);
    try {
      await crmApi.pricing.mergeCategory(source.recordId, {
        target_category_id: target.recordId,
        allow_inactive_target: target.is_active === false,
      });
      await loadPriceListRecords();
      toast({ title: "Category merged", description: `${source.label} now points to ${target.label}.` });
      resetCategoryEditor();
    } catch (error) {
      toast({ variant: "destructive", title: "Category merge failed", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const saveSectionEditor = async () => {
    const trimmedName = String(sectionEditor.label || "").trim();
    if (!trimmedName) {
      toast({ variant: "destructive", title: "Section name required" });
      return;
    }
    const duplicate = sectionManagementRows.some((row) =>
      row.value !== sectionEditor.value &&
      String(row.label || "").trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      toast({ variant: "destructive", title: "Duplicate section", description: "That section name is already in use." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        label: trimmedName,
        key: sectionEditor.value || buildPricingSectionRecord(trimmedName).key,
        value: sectionEditor.value || buildPricingSectionRecord(trimmedName).key,
        description: String(sectionEditor.description || "").trim(),
        display_order: toNumber(sectionEditor.display_order, 999),
        is_active: sectionEditor.is_active !== false,
      };
      if (sectionEditor.recordId) {
        const updated = await crmApi.entities.PricingSection.update(sectionEditor.recordId, payload);
        setPricingSectionRecords((current) => current.map((record) => record.id === updated.id ? updated : record));
      } else {
        const created = await crmApi.entities.PricingSection.create(payload);
        setPricingSectionRecords((current) => [...current, created]);
        setSectionEditor((current) => ({ ...current, recordId: created.id || "", value: created.key || payload.key }));
      }
      toast({ title: "Section updated" });
    } catch (error) {
      toast({ variant: "destructive", title: "Section save failed", description: error instanceof Error ? error.message : "Check the section details." });
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (row) => {
    if ((row.usage?.quoteItems || 0) + (row.usage?.importItems || 0) + (row.usage?.quoteImports || 0) > 0) {
      toast({
        variant: "destructive",
        title: "Section is in use",
        description: "Deactivate it or merge it into another section instead of deleting it.",
      });
      return;
    }
    if (!window.confirm(`Archive section "${row.label}"? It can be recreated if needed.`)) {
      return;
    }
    await crmApi.pricing.deleteSection(row.recordId);
    setPricingSectionRecords((current) => current.filter((record) => record.id !== row.recordId));
    toast({ title: "Section archived", description: "Existing quote history was left intact." });
  };

  const mergeSections = async () => {
    if (!mergeSectionSourceId || !mergeSectionTargetId) {
      toast({ variant: "destructive", title: "Choose both sections to merge" });
      return;
    }
    if (mergeSectionSourceId === mergeSectionTargetId) {
      toast({ variant: "destructive", title: "Choose a different target section" });
      return;
    }
    const source = sectionManagementRows.find((row) => row.recordId === mergeSectionSourceId);
    const target = sectionManagementRows.find((row) => row.recordId === mergeSectionTargetId);
    if (!source || !target) {
      toast({ variant: "destructive", title: "Section selection invalid" });
      return;
    }
    const summary = `${source.usage.quoteItems} quote line items, ${source.usage.importItems} import rows, ${source.usage.quoteImports} import mappings`;
    if (!window.confirm(`Merge "${source.label}" into "${target.label}"?\n\nAffected records: ${summary}`)) {
      return;
    }
    setSaving(true);
    try {
      await crmApi.pricing.mergeSection(source.recordId, { target_section_id: target.recordId });
      await loadPriceListRecords();
      toast({ title: "Section merged", description: `${source.label} now points to ${target.label}.` });
      resetSectionEditor();
    } catch (error) {
      toast({ variant: "destructive", title: "Section merge failed", description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const editTriggeredRule = (record) => {
    setEditingTriggeredRuleId(record.id);
    setTriggeredRuleForm({
      rule_name: record.rule_name || "",
      match_mode: record.match_mode || "all",
      trigger_category: record.trigger_category || "",
      trigger_description_contains: record.trigger_description_contains || "",
      trigger_product_number_equals: record.trigger_product_number_equals || "",
      trigger_product_number_contains: record.trigger_product_number_contains || "",
      trigger_supplier: record.trigger_supplier || "",
      trigger_item_type: record.trigger_item_type || "",
      inclusion_pricing_item_id: record.inclusion_pricing_item_id || "",
      inclusion_description: record.inclusion_description || "",
      inclusion_category: record.inclusion_category || "misc_fixings",
      inclusion_sku: record.inclusion_sku || "",
      inclusion_supplier: record.inclusion_supplier || "",
      quantity_logic: record.quantity_logic || "per_imported_item",
      quantity_multiplier: toNumber(record.quantity_multiplier, 1),
      unit: record.unit || "ea",
      cost: toNumber(record.cost, 0),
      markup_percent: toNumber(record.markup_percent, 30),
      gst_treatment: record.gst_treatment || "ex_gst",
      review_required: record.review_required !== false,
      active: record.active !== false,
      notes: record.notes || "",
    });
  };

  const saveTriggeredRule = async () => {
    if (!String(triggeredRuleForm.rule_name || "").trim()) {
      toast({ variant: "destructive", title: "Rule name required" });
      return;
    }
    if (!String(triggeredRuleForm.inclusion_description || "").trim()) {
      toast({ variant: "destructive", title: "Inclusion description required" });
      return;
    }
    if (![
      triggeredRuleForm.trigger_category,
      triggeredRuleForm.trigger_description_contains,
      triggeredRuleForm.trigger_product_number_equals,
      triggeredRuleForm.trigger_product_number_contains,
      triggeredRuleForm.trigger_supplier,
      triggeredRuleForm.trigger_item_type,
    ].some(Boolean)) {
      toast({ variant: "destructive", title: "At least one trigger condition is required" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...triggeredRuleForm,
        quantity_multiplier: toNumber(triggeredRuleForm.quantity_multiplier, 1),
        cost: toNumber(triggeredRuleForm.cost, 0),
        markup_percent: toNumber(triggeredRuleForm.markup_percent, 30),
      };
      if (editingTriggeredRuleId) {
        await crmApi.entities.TriggeredAutoInclusionRule.update(editingTriggeredRuleId, payload);
      } else {
        await crmApi.entities.TriggeredAutoInclusionRule.create(payload);
      }
      await loadPriceListRecords();
      resetTriggeredRuleForm();
      toast({ title: editingTriggeredRuleId ? "Triggered rule updated" : "Triggered rule added" });
    } catch (error) {
      toast({ variant: "destructive", title: "Triggered rule save failed", description: error instanceof Error ? error.message : "Check the rule details." });
    } finally {
      setSaving(false);
    }
  };

  const duplicateTriggeredRule = async (record) => {
    const payload = {
      ...record,
      rule_name: `${record.rule_name || "Triggered rule"} copy`,
    };
    delete payload.id;
    delete payload.row_version;
    await crmApi.entities.TriggeredAutoInclusionRule.create(payload);
    await loadPriceListRecords();
    toast({ title: "Triggered rule duplicated" });
  };

  const toggleTriggeredRuleActive = async (record) => {
    await crmApi.entities.TriggeredAutoInclusionRule.update(record.id, { active: record.active === false });
    await loadPriceListRecords();
  };

  const deleteTriggeredRule = async (record) => {
    if (!window.confirm("Remove this triggered auto-inclusion rule?")) return;
    await crmApi.entities.TriggeredAutoInclusionRule.delete(record.id);
    await loadPriceListRecords();
    if (editingTriggeredRuleId === record.id) resetTriggeredRuleForm();
  };

  const editGlobalInclusion = (record) => {
    setEditingGlobalInclusionId(record.id);
    setGlobalInclusionForm({
      description: record.description || "",
      category: record.category || "misc_fixings",
      quantity: toNumber(record.quantity, 1),
      unit: record.unit || "ea",
      cost: toNumber(record.cost, 0),
      markup: toNumber(record.markup, 30),
      gst_treatment: record.gst_treatment || "ex_gst",
      active: record.active !== false,
      review_required: record.review_required !== false,
      notes: record.notes || "",
    });
  };

  const saveGlobalInclusion = async () => {
    if (!String(globalInclusionForm.description || "").trim()) {
      toast({ variant: "destructive", title: "Description required" });
      return;
    }
    setSaving(true);
    try {
      const isEditing = Boolean(editingGlobalInclusionId);
      const payload = {
        ...globalInclusionForm,
        quantity: toNumber(globalInclusionForm.quantity, 1),
        cost: toNumber(globalInclusionForm.cost, 0),
        markup: toNumber(globalInclusionForm.markup, 30),
      };
      if (isEditing) {
        await crmApi.entities.GlobalAutoInclusion.update(editingGlobalInclusionId, payload);
      } else {
        await crmApi.entities.GlobalAutoInclusion.create(payload);
      }
      await loadPriceListRecords();
      resetGlobalInclusionForm();
      toast({ title: isEditing ? "Global inclusion updated" : "Global inclusion added" });
    } catch (error) {
      toast({ variant: "destructive", title: "Global inclusion save failed", description: error instanceof Error ? error.message : "Check the rule details." });
    } finally {
      setSaving(false);
    }
  };

  const toggleGlobalInclusionActive = async (record) => {
    await crmApi.entities.GlobalAutoInclusion.update(record.id, { active: record.active === false });
    await loadPriceListRecords();
  };

  const deleteGlobalInclusion = async (record) => {
    if (!window.confirm("Remove this Every Job Inclusion rule? Existing quotes will keep their quote-specific line items.")) return;
    await crmApi.entities.GlobalAutoInclusion.delete(record.id);
    await loadPriceListRecords();
    if (editingGlobalInclusionId === record.id) resetGlobalInclusionForm();
  };

  const applyGlobalInclusionsToSelectedQuote = async () => {
    if (!quoteId) {
      toast({ variant: "destructive", title: "Select a quote first", description: "Choose an existing quote in CSV upload before applying Every Job Inclusions." });
      return;
    }
    const result = await crmApi.pricing.applyGlobalInclusions(quoteId);
    toast({ title: "Every Job Inclusions applied", description: `${result.added?.length || 0} added · ${result.skipped || 0} already present.` });
  };

  const totals = calculation?.totals || {};
  const autoInclusions = calculation?.auto_inclusions || [];
  const clientSafePricingRows = useMemo(() => items.map((item, index) => {
    const quantity = toNumber(item.quantity, 1);
    const sellExGst = toNumber(item.sell_price ?? item.total_sell_price, toNumber(item.buy_price, 0) * quantity * (1 + toNumber(item.markup_percent, 0) / 100));
    return {
      id: item.id || `${item.name || "item"}-${index}`,
      description: item.name || item.description || "Pricing line",
      category: item.category || "Item",
      quantity,
      unit: item.unit || item.supplier_unit || "ea",
      totalIncGst: toClientFacingIncGst(sellExGst),
      status: item.review_state || item.status || "active",
    };
  }), [items]);
  const filteredPriceRows = priceListRows.filter((row) => {
    if (priceListFilter === "all") return true;
    if (priceListFilter === "changed") return row.price_change_percent !== 0;
    if (priceListFilter === "warning") return row.warnings?.length > 0;
    if (priceListFilter === "error") return row.errors?.length > 0;
    return row.status === priceListFilter || row.mapped?.category === priceListFilter;
  });
  const filteredMasterPricingItems = useMemo(() => {
    const query = String(masterPriceListSearch || "").trim().toLowerCase();
    if (!query) return masterPricingItems;
    return masterPricingItems.filter((item) =>
      [
        item.name,
        item.description,
        item.supplier,
        item.supplier_name,
        item.product_number,
        item.supplier_sku,
        item.original_sku,
        item.category,
      ].some((value) => String(value || "").toLowerCase().includes(query))
    );
  }, [masterPriceListSearch, masterPricingItems]);
  const filteredCategoryManagementRows = useMemo(() => {
    if (categoryStatusFilter === "all") return categoryManagementRows;
    if (categoryStatusFilter === "merged") return categoryManagementRows.filter((row) => row.merged_into_category_id);
    if (categoryStatusFilter === "inactive") return categoryManagementRows.filter((row) => row.is_active === false && !row.merged_into_category_id);
    return categoryManagementRows.filter((row) => row.is_active !== false && !row.merged_into_category_id);
  }, [categoryManagementRows, categoryStatusFilter]);
  const itemReviewRows = useMemo(() => items.map((item, index) => ({ item, index })), [items]);
  const autoModalReviewRows = useMemo(() => autoModalRows.map((row, index) => ({ row, index })), [autoModalRows]);
  const { sortedRows: sortedPriceRows, sortState: priceRowsSortState, requestSort: requestPriceRowsSort } = useSortableRows(filteredPriceRows, PRICE_LIST_ROW_SORT_COLUMNS);
  const { sortedRows: sortedPriceHistory, sortState: priceHistorySortState, requestSort: requestPriceHistorySort } = useSortableRows(priceHistory.slice(0, 30), PRICE_HISTORY_SORT_COLUMNS);
  const { sortedRows: sortedMasterPricingItems, sortState: masterPriceListSortState, requestSort: requestMasterPriceListSort } = useSortableRows(filteredMasterPricingItems, MASTER_PRICE_LIST_SORT_COLUMNS);
  const { sortedRows: sortedItemReviewRows, sortState: itemReviewSortState, requestSort: requestItemReviewSort } = useSortableRows(itemReviewRows, ITEM_REVIEW_SORT_COLUMNS);
  const { sortedRows: sortedGlobalAutoInclusions, sortState: globalInclusionSortState, requestSort: requestGlobalInclusionSort } = useSortableRows(globalAutoInclusions, GLOBAL_INCLUSION_SORT_COLUMNS);
  const { sortedRows: sortedTriggeredAutoInclusionRules, sortState: triggeredRuleSortState, requestSort: requestTriggeredRuleSort } = useSortableRows(triggeredAutoInclusionRules, TRIGGERED_RULE_SORT_COLUMNS);
  const { sortedRows: sortedAutoModalRows, sortState: autoModalSortState, requestSort: requestAutoModalSort } = useSortableRows(autoModalReviewRows, AUTO_MODAL_SORT_COLUMNS);
  const { sortedRows: sortedCategoryManagementRows, sortState: categorySortState, requestSort: requestCategorySort } = useSortableRows(filteredCategoryManagementRows, CATEGORY_SORT_COLUMNS);
  const { sortedRows: sortedSectionManagementRows, sortState: sectionSortState, requestSort: requestSectionSort } = useSortableRows(sectionManagementRows, SECTION_SORT_COLUMNS);
  const triggeredRuleMatchesPreview = matchesTriggeredRule(triggeredRuleForm, triggeredRuleTest);
  const triggeredRulePreviewQuantity = calculateTriggeredRuleQuantity(triggeredRuleForm, triggeredRuleTest.quantity);

  const readPriceListFile = async (file) => {
    await readImportFile(file, (updater) => {
      const nextFile = typeof updater === "function" ? updater({ name: priceListForm.file_name, size: priceListForm.file_size }) : updater;
      if (!nextFile) return;
      setPriceListForm((current) => ({ ...current, file_name: nextFile.name, file_type: nextFile.type, file_base64: nextFile.file_base64, file_size: nextFile.size, row_count: nextFile.row_count }));
    }, () => {});
  };

  const stagePriceListImport = async () => {
    setLoading(true);
    try {
      const mapping = priceListMappingText.trim() ? JSON.parse(priceListMappingText) : undefined;
      const result = await crmApi.pricing.stagePriceListImport({ ...priceListForm, column_mapping: mapping });
      setStagedImport(result.import);
      setPriceListRows(result.rows || []);
      await loadPriceListRecords();
      toast({ title: "Price list staged", description: `${result.summary?.total_rows || 0} rows ready for review.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Price list import failed", description: error instanceof Error ? error.message : "Check the file and mapping." });
    } finally {
      setLoading(false);
    }
  };

  const commitPriceListImport = async (createNewItems = false) => {
    if (!stagedImport?.id) return;
    setSaving(true);
    try {
      const rowIds = priceListRows.filter((row) => row.review_state !== "deleted" && row.review_state !== "excluded").map((row) => row.id);
      await crmApi.pricing.commitPriceListImport(stagedImport.id, { create_new_items: createNewItems, row_ids: rowIds });
      await loadPriceListRecords();
      setStagedImport(null);
      setPriceListRows([]);
      toast({ title: "Price list confirmed" });
    } catch (error) {
      toast({ variant: "destructive", title: "Confirm import failed", description: error instanceof Error ? error.message : "No pricing was updated." });
    } finally {
      setSaving(false);
    }
  };

  const setPriceRowsReviewState = (ids, state) => {
    setPriceListRows((current) => current.map((row) => ids.includes(row.id) ? { ...row, review_state: state } : row));
    setSelectedPriceRows([]);
  };

  const rollbackImport = async (importId) => {
    setSaving(true);
    try {
      await crmApi.pricing.rollbackPriceListImport(importId);
      await loadPriceListRecords();
      toast({ title: "Import rolled back" });
    } catch (error) {
      toast({ variant: "destructive", title: "Rollback failed", description: error instanceof Error ? error.message : "Prices were not changed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="jf-reference-page jf-pricing-workbench">
      <PageHeader
        title="Pricing Workbench"
        subtitle={`${items.length} priced lines · ${formatCurrency(totals.total_inc_gst || 0)} inc GST`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => calculate()} disabled={loading || items.length === 0}>
              <RefreshCw className="mr-2 h-4 w-4" />Recalculate
            </Button>
            <Button size="sm" className="min-h-[40px]" onClick={() => calculate(items, true)} disabled={saving || items.length === 0}>
              <Save className="mr-2 h-4 w-4" />Save Snapshot
            </Button>
          </div>
        )}
      />

      {!clientMode && warnings.length > 0 ? (
        <Alert className="border-[#dfc38e] bg-[#f8eddc] text-[#7a5621] dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertDescription className="space-y-1">
            {warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </AlertDescription>
        </Alert>
      ) : null}

      <GuidedWorkflow
        className="pricing-workflow"
        title="Pricing workflow"
        subtitle={clientMode ? "Client Screen Mode is active. Only customer-facing totals and descriptions are shown." : "What to do next: import the Mozaik file, review costs that need attention, then save defaults only when the workshop should reuse them."}
        steps={[
          { title: "Upload file", detail: "Bring in a Mozaik CSV or supplier price list." },
          { title: "Review items", detail: clientMode ? "Discuss scope and totals without internal pricing." : "Check anything marked for review before it affects pricing." },
          { title: "Confirm import", detail: "Apply only the rows you are happy with." },
          { title: "Save defaults", detail: "Only save defaults when future quotes should reuse them." },
        ]}
      />

      {clientMode ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="jf-reference-metric p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Client Total Incl GST</p>
              <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.total_inc_gst || clientSafePricingRows.reduce((sum, row) => sum + row.totalIncGst, 0))}</p>
              <p className="mt-1 text-xs text-muted-foreground">Customer-facing total</p>
            </Card>
            <Card className="jf-reference-metric p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Line Items</p>
              <p className="mt-1 text-2xl font-semibold">{items.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Visible scope lines</p>
            </Card>
            <Card className="jf-reference-metric p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Status</p>
              <p className="mt-1 text-2xl font-semibold">Client safe</p>
              <p className="mt-1 text-xs text-muted-foreground">Internal pricing hidden</p>
            </Card>
            <Card className="jf-reference-metric p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Quote Link</p>
              <p className="mt-1 text-2xl font-semibold">{quoteId ? "Linked" : "Draft"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Presentation view</p>
            </Card>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Description</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Total Incl GST</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {clientSafePricingRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{row.description}</td>
                    <td className="p-3">{categoryLookup.get(row.category) || row.category || "-"}</td>
                    <td className="p-3 text-right">{row.quantity}</td>
                    <td className="p-3">{row.unit}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(row.totalIncGst)}</td>
                    <td className="p-3"><Badge variant="secondary">{row.status}</Badge></td>
                  </tr>
                ))}
                {clientSafePricingRows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-center text-sm text-muted-foreground" colSpan={6}>No client-facing pricing lines to show yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
      <>
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="jf-reference-metric p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Direct purchase</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.total_direct_purchase_cost || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Material cost basis</p>
        </Card>
        <Card className="jf-reference-metric p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Labour hours</p>
          <p className="mt-1 text-2xl font-semibold">{totals.estimated_labour_hours || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">Workshop estimate</p>
        </Card>
        <Card className="jf-reference-metric p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Gross margin</p>
          <p className="mt-1 text-2xl font-semibold">{totals.gross_margin_percent || 0}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Quote health marker</p>
        </Card>
        <Card className="jf-reference-metric p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Return / labour hr</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(totals.effective_return_per_labour_hour || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Capacity signal</p>
        </Card>
      </div>

      <Tabs defaultValue="upload" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="upload">Mozaik Import</TabsTrigger>
          <TabsTrigger value="price-lists">Supplier Prices</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="items">Review Items</TabsTrigger>
          <TabsTrigger value="labour">Labour</TabsTrigger>
          <TabsTrigger value="inclusions">Automatic Additions</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card className="p-4">
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-3">
                <Field label="Job name">
                  <Select
                    value={quoteId || "manual"}
                    onValueChange={(value) => {
                      if (value === "manual") {
                        setQuoteId("");
                        return;
                      }
                      const selectedQuote = quoteRecords.find((record) => record.id === value);
                      setQuoteId(value);
                      setJobName(selectedQuote?.title || selectedQuote?.quote_number || jobName);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual pricing draft</SelectItem>
                      {quoteRecords.map((record) => (
                        <SelectItem key={record.id} value={record.id}>
                          {[record.title || record.quote_number, record.contact_name || record.company_name, record.status, record.created_date?.slice(0, 10)].filter(Boolean).join(" · ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!quoteId ? <Input className="mt-2" value={jobName} onChange={(event) => setJobName(event.target.value)} /> : null}
                </Field>
                <ImportWizard
                  title="Mozaik material import"
                  description="Upload the Mozaik material file, review the items found, then save only when the pricing looks right."
                  fileInfo={materialFile}
                  status={materialStatus}
                  rows={items}
                  warnings={warnings}
                  onFile={(file) => readImportFile(file, setMaterialFile, setMaterialStatus)}
                  onCancel={() => { setMaterialFile(null); setMaterialStatus("Waiting for file"); }}
                  onParse={importCsv}
                  parseLabel="Review Mozaik File"
                />
              </div>
              <Textarea className="min-h-[320px] font-mono text-xs" value={rawCsv} onChange={(event) => setRawCsv(event.target.value)} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="price-lists">
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card className="p-4">
              <div className="space-y-3">
                <Field label="Supplier">
                  <Input value={priceListForm.supplier} onChange={(event) => setPriceListForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Supplier name" />
                </Field>
                <ImportWizard
                  title="Supplier price list import"
                  description="Upload the supplier price list, check Column Matching, then confirm the rows you trust."
                  fileInfo={priceListForm.file_name ? { name: priceListForm.file_name, size: priceListForm.file_size, type: priceListForm.file_type, row_count: priceListForm.row_count } : null}
                  status={priceListRows.length ? "Needs review" : priceListForm.file_base64 ? "Ready for Column Matching" : "Waiting for file"}
                  rows={priceListRows}
                  warnings={priceListRows.flatMap((row) => row.warnings || []).slice(0, 3)}
                  errors={priceListRows.flatMap((row) => row.errors || []).slice(0, 3)}
                  onFile={readPriceListFile}
                  onCancel={() => setPriceListForm((current) => ({ ...current, file_name: "", file_base64: "", file_size: 0, row_count: 0 }))}
                  onParse={stagePriceListImport}
                  parseLabel="Review Import"
                  confirmActions={stagedImport ? (
                    <>
                      <Button variant="outline" onClick={() => commitPriceListImport(false)} disabled={saving}>
                        Confirm Matched Rows
                      </Button>
                      <Button onClick={() => commitPriceListImport(true)} disabled={saving}>
                        Confirm and Add New Items
                      </Button>
                    </>
                  ) : null}
                />
                <Field label="Large movement warning %">
                  <Input type="number" value={priceListForm.movement_threshold_percent} onChange={(event) => setPriceListForm((current) => ({ ...current, movement_threshold_percent: toNumber(event.target.value, 15) }))} />
                </Field>
                <Field label="Column Matching">
                  <Textarea
                    className="min-h-[150px] font-mono text-xs"
                    value={priceListMappingText}
                    onChange={(event) => setPriceListMappingText(event.target.value)}
                    placeholder={'{"product_number":"SKU","description":"Description","unit_cost_ex_gst":"Net Price","unit":"UOM"}'}
                  />
                </Field>
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Import review</p>
                    <p className="text-sm text-muted-foreground">{priceListRows.length} staged rows</p>
                  </div>
                  <Select value={priceListFilter} onValueChange={setPriceListFilter}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["all", "changed", "unchanged", "new", "warning", "error", "matched", "manual_review", "invalid"].map((value) => (
                        <SelectItem key={value} value={value}>{value.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <SortableHeader columnKey="status" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">Status</SortableHeader>
                        <th className="p-3">Select</th>
                        <SortableHeader columnKey="sku" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">SKU</SortableHeader>
                        <SortableHeader columnKey="description" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">Description</SortableHeader>
                        <SortableHeader columnKey="unit" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">Unit</SortableHeader>
                        <SortableHeader columnKey="old" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">Old</SortableHeader>
                        <SortableHeader columnKey="new" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">New</SortableHeader>
                        <SortableHeader columnKey="change" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">Change</SortableHeader>
                        <SortableHeader columnKey="warnings" sortState={priceRowsSortState} onSort={requestPriceRowsSort} className="p-3">Warnings</SortableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPriceRows.map((row) => (
                        <tr key={row.id} className={`border-b last:border-0 ${row.review_state === "excluded" ? "opacity-60" : ""}`}>
                          <td className="p-3"><Badge variant={row.errors?.length ? "destructive" : "secondary"}>{row.review_state || row.status}</Badge></td>
                          <td className="p-3"><input type="checkbox" checked={selectedPriceRows.includes(row.id)} onChange={(event) => setSelectedPriceRows((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></td>
                          <td className="p-3">{row.mapped?.product_number || row.mapped?.supplier_item_code || "-"}</td>
                          <td className="p-3">{row.mapped?.description || "-"}</td>
                          <td className="p-3">{row.mapped?.unit || "-"}</td>
                          <td className="p-3">{formatCurrency(row.old_values?.buy_price || 0)}</td>
                          <td className="p-3">{formatCurrency(row.new_values?.buy_price || 0)}</td>
                          <td className="p-3">{row.price_change_percent || 0}%</td>
                          <td className="p-3 text-xs text-muted-foreground">{[...(row.warnings || []), ...(row.errors || [])].join(" ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPriceRowsReviewState(selectedPriceRows, "excluded")} disabled={selectedPriceRows.length === 0}><Ban className="mr-2 h-4 w-4" />Exclude selected</Button>
                  <Button variant="outline" size="sm" onClick={() => setPriceRowsReviewState(selectedPriceRows, "deleted")} disabled={selectedPriceRows.length === 0}><Trash2 className="mr-2 h-4 w-4" />Delete selected</Button>
                  <Button variant="ghost" size="sm" onClick={() => setPriceRowsReviewState(priceListRows.map((row) => row.id), "active")}>Undo removals</Button>
                </div>
              </Card>

              <Card className="p-4">
                <p className="font-semibold">Recent imports</p>
                <div className="mt-3 space-y-2">
                  {priceListImports.slice(0, 8).map((record) => (
                    <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">{record.supplier} · {record.file_name}</p>
                        <p className="text-muted-foreground">{record.import_status} · {new Date(record.created_date).toLocaleString()}</p>
                      </div>
                      {record.import_status === "committed" ? (
                        <Button variant="outline" size="sm" onClick={() => rollbackImport(record.id)} disabled={saving}>
                          <RotateCcw className="mr-2 h-4 w-4" />Rollback
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">Current price list</p>
                    <p className="text-sm text-muted-foreground">Includes pricing defaults saved from quote pricing review.</p>
                  </div>
                  <Input
                    className="w-full max-w-xs"
                    value={masterPriceListSearch}
                    onChange={(event) => setMasterPriceListSearch(event.target.value)}
                    placeholder="Search name, supplier, SKU..."
                  />
                </div>
                {semanticPriceMatches.length > 0 ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {semanticPriceMatches.map((result) => (
                      <div key={`${result.entity}-${result.record_id}`} className="rounded-lg border px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{result.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.snippet}</p>
                          </div>
                          <Badge variant="outline">{Math.round(Number(result.score || 0) * 100)}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <SortableHeader columnKey="state" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">State</SortableHeader>
                        <SortableHeader columnKey="name" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Item</SortableHeader>
                        <SortableHeader columnKey="supplier" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Supplier</SortableHeader>
                        <SortableHeader columnKey="sku" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">SKU</SortableHeader>
                        <SortableHeader columnKey="category" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Category</SortableHeader>
                        <SortableHeader columnKey="unit" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Unit</SortableHeader>
                        <SortableHeader columnKey="buy" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Buy</SortableHeader>
                        <SortableHeader columnKey="markup" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Markup</SortableHeader>
                        <SortableHeader columnKey="updated" sortState={masterPriceListSortState} onSort={requestMasterPriceListSort} className="p-3">Updated</SortableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMasterPricingItems.map((item) => (
                        <tr key={item.id} className={`border-b last:border-0 ${item.is_active === false ? "opacity-60" : ""}`}>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={item.is_active === false ? "outline" : "secondary"}>{item.is_active === false ? "Inactive" : "Active"}</Badge>
                              {item.is_user_created ? <Badge variant="outline">Saved default</Badge> : null}
                            </div>
                          </td>
                          <td className="p-3">
                            <p className="font-medium">{item.name || item.description || "-"}</p>
                            {item.description && item.description !== item.name ? <p className="mt-1 text-xs text-muted-foreground">{item.description}</p> : null}
                          </td>
                          <td className="p-3">{item.supplier || item.supplier_name || "-"}</td>
                          <td className="p-3">{item.product_number || item.supplier_sku || item.original_sku || "-"}</td>
                          <td className="p-3">{categoryLookup.get(item.category) || item.category || "-"}</td>
                          <td className="p-3">{item.unit || item.supplier_unit || "-"}</td>
                          <td className="p-3">{formatCurrency(item.buy_price || 0)}</td>
                          <td className="p-3">{item.markup_percent ?? item.default_markup ?? 0}%</td>
                          <td className="p-3 text-xs text-muted-foreground">{new Date(item.last_price_update_date || item.last_price_update_at || item.updated_date || item.created_date).toLocaleString()}</td>
                        </tr>
                      ))}
                      {sortedMasterPricingItems.length === 0 ? (
                        <tr>
                          <td className="p-6 text-center text-sm text-muted-foreground" colSpan={9}>No pricing items found.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-4">
                <p className="font-semibold">Price history</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <SortableHeader columnKey="supplier" sortState={priceHistorySortState} onSort={requestPriceHistorySort} className="p-3">Supplier</SortableHeader>
                        <SortableHeader columnKey="product" sortState={priceHistorySortState} onSort={requestPriceHistorySort} className="p-3">Product</SortableHeader>
                        <SortableHeader columnKey="old" sortState={priceHistorySortState} onSort={requestPriceHistorySort} className="p-3">Old</SortableHeader>
                        <SortableHeader columnKey="new" sortState={priceHistorySortState} onSort={requestPriceHistorySort} className="p-3">New</SortableHeader>
                        <SortableHeader columnKey="change" sortState={priceHistorySortState} onSort={requestPriceHistorySort} className="p-3">Change</SortableHeader>
                        <SortableHeader columnKey="when" sortState={priceHistorySortState} onSort={requestPriceHistorySort} className="p-3">When</SortableHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPriceHistory.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="p-3">{row.supplier}</td>
                          <td className="p-3">{row.product_number}</td>
                          <td className="p-3">{formatCurrency(row.old_cost || 0)}</td>
                          <td className="p-3">{formatCurrency(row.new_cost || 0)}</td>
                          <td className="p-3">{row.percentage_change || 0}%</td>
                          <td className="p-3">{new Date(row.created_date).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="categories">
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card className="p-4">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">{editingCategoryValue ? "Edit pricing category" : "Select a category"}</p>
                  <p className="text-sm text-muted-foreground">These category labels are used across pricing, auto-inclusions, quote defaults, and imported item review.</p>
                </div>
                {editingCategoryValue ? (
                  <>
                    <Field label="Display name">
                      <Input
                        value={categoryEditor.label}
                        onChange={(event) => setCategoryEditor((current) => ({ ...current, label: event.target.value }))}
                        placeholder="Category label"
                      />
                    </Field>
                    <Field label="System key">
                      <Input value={categoryEditor.value} readOnly className="bg-muted/40" />
                    </Field>
                    <div className="grid gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={categoryEditor.is_active}
                          onChange={(event) => setCategoryEditor((current) => ({ ...current, is_active: event.target.checked }))}
                        />
                        Active for future dropdowns
                      </label>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Usage</p>
                      <p className="mt-1 text-muted-foreground">
                        {(categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.pricingItems || 0)} pricing items · {" "}
                        {(categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.quoteItems || 0)} quote line items · {" "}
                        {((categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.globalInclusions || 0)
                          + (categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.triggeredRuleInclusions || 0)
                          + (categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.triggeredRuleTriggers || 0))} inclusion rules · {" "}
                        {((categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.importItems || 0)
                          + (categoryManagementRows.find((row) => row.value === editingCategoryValue)?.usage.quoteImports || 0))} import references
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-3">
                      <div>
                        <p className="font-medium">Merge category</p>
                        <p className="mt-1 text-muted-foreground">Move all active references into another category and keep this one as merged/inactive.</p>
                      </div>
                      <Field label="Merge into">
                        <Select value={mergeCategoryTargetId} onValueChange={setMergeCategoryTargetId}>
                          <SelectTrigger><SelectValue placeholder="Choose target category" /></SelectTrigger>
                          <SelectContent>
                            {categoryManagementRows
                              .filter((row) => row.recordId && row.recordId !== mergeCategorySourceId)
                              .map((row) => (
                                <SelectItem key={row.recordId} value={row.recordId}>
                                  {row.label}{row.is_active === false ? " (inactive)" : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Button
                        variant="outline"
                        onClick={() => void mergeCategories()}
                        disabled={!mergeCategorySourceId || !mergeCategoryTargetId || saving}
                      >
                        Merge category
                      </Button>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="outline" onClick={resetCategoryEditor}>Clear</Button>
                      <Button onClick={() => void saveCategoryEditor()} disabled={saving}>Save category</Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Pick a category from the table to edit its label or active status.
                  </div>
                )}
                <Button variant="outline" onClick={() => openNewCategoryDialog("category-editor")}>Create new category</Button>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">System categories</p>
                  <p className="text-sm text-muted-foreground">{sortedCategoryManagementRows.length} categories available across JoinerFlow.</p>
                </div>
                <Select value={categoryStatusFilter} onValueChange={setCategoryStatusFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="merged">Merged</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <SortableHeader columnKey="state" sortState={categorySortState} onSort={requestCategorySort} className="p-3">State</SortableHeader>
                      <SortableHeader columnKey="name" sortState={categorySortState} onSort={requestCategorySort} className="p-3">Name</SortableHeader>
                      <SortableHeader columnKey="key" sortState={categorySortState} onSort={requestCategorySort} className="p-3">Key</SortableHeader>
                      <SortableHeader columnKey="pricing" sortState={categorySortState} onSort={requestCategorySort} className="p-3">Pricing items</SortableHeader>
                      <SortableHeader columnKey="quotes" sortState={categorySortState} onSort={requestCategorySort} className="p-3">Quote items</SortableHeader>
                      <SortableHeader columnKey="inclusions" sortState={categorySortState} onSort={requestCategorySort} className="p-3">Inclusions</SortableHeader>
                      <SortableHeader columnKey="imported" sortState={categorySortState} onSort={requestCategorySort} className="p-3">Import refs</SortableHeader>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCategoryManagementRows.map((row) => (
                      <tr key={row.value} className={`border-b last:border-0 ${row.is_active === false ? "opacity-60" : ""}`}>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={row.statusLabel === "Active" ? "secondary" : "outline"}>{row.statusLabel}</Badge>
                            {row.is_default ? <Badge variant="outline">Default</Badge> : <Badge variant="outline">Custom</Badge>}
                          </div>
                        </td>
                        <td className="p-3 font-medium">
                          {row.label}
                          {row.merged_into_category_name ? (
                            <p className="mt-1 text-xs text-muted-foreground">Merged into {row.merged_into_category_name}</p>
                          ) : null}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{row.value}</td>
                        <td className="p-3">{row.usage.pricingItems}</td>
                        <td className="p-3">{row.usage.quoteItems}</td>
                        <td className="p-3">{row.usage.globalInclusions + row.usage.triggeredRuleInclusions + row.usage.triggeredRuleTriggers}</td>
                        <td className="p-3">{row.usage.importItems + row.usage.quoteImports}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                editCategory(row);
                                setMergeCategorySourceId(row.recordId || "");
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                editCategory(row);
                                setMergeCategorySourceId(row.recordId || "");
                              }}
                              disabled={!row.recordId}
                            >
                              Merge
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void toggleCategoryActive(row)}>
                              {row.is_active === false ? "Activate" : "Deactivate"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void deleteCategory(row)} disabled={!row.recordId}>
                              Archive
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {sortedCategoryManagementRows.length === 0 ? (
                      <tr>
                        <td className="p-6 text-center text-sm text-muted-foreground" colSpan={8}>No categories found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sections">
          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <Card className="p-4">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">{editingSectionValue ? "Edit pricing section" : "Select a section"}</p>
                  <p className="text-sm text-muted-foreground">Sections control how quote line items are grouped in the quote list, imports, and generated documents.</p>
                </div>
                {editingSectionValue ? (
                  <>
                    <Field label="Display name">
                      <Input
                        value={sectionEditor.label}
                        onChange={(event) => setSectionEditor((current) => ({ ...current, label: event.target.value }))}
                        placeholder="Section label"
                      />
                    </Field>
                    <Field label="Description">
                      <Textarea
                        rows={3}
                        value={sectionEditor.description}
                        onChange={(event) => setSectionEditor((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Optional guidance for imports or document grouping"
                      />
                    </Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="System key">
                        <Input value={sectionEditor.value} readOnly className="bg-muted/40" />
                      </Field>
                      <Field label="Display order">
                        <Input
                          type="number"
                          value={sectionEditor.display_order}
                          onChange={(event) => setSectionEditor((current) => ({ ...current, display_order: toNumber(event.target.value, 999) }))}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sectionEditor.is_active}
                          onChange={(event) => setSectionEditor((current) => ({ ...current, is_active: event.target.checked }))}
                        />
                        Active for future dropdowns
                      </label>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Usage</p>
                      <p className="mt-1 text-muted-foreground">
                        {(sectionManagementRows.find((row) => row.value === editingSectionValue)?.usage.quoteItems || 0)} quote line items · {" "}
                        {(sectionManagementRows.find((row) => row.value === editingSectionValue)?.usage.importItems || 0)} staged import rows · {" "}
                        {(sectionManagementRows.find((row) => row.value === editingSectionValue)?.usage.quoteImports || 0)} import mappings
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Merge into another section</p>
                      <div className="mt-3 grid gap-2">
                        <Select value={mergeSectionSourceId || sectionEditor.recordId || "__none__"} onValueChange={(value) => setMergeSectionSourceId(value === "__none__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Source section" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Source section</SelectItem>
                            {sortedSectionManagementRows.filter((row) => row.recordId).map((row) => (
                              <SelectItem key={row.recordId} value={row.recordId}>{row.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={mergeSectionTargetId || "__none__"} onValueChange={(value) => setMergeSectionTargetId(value === "__none__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Target section" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Target section</SelectItem>
                            {sortedSectionManagementRows.filter((row) => row.recordId && row.recordId !== (mergeSectionSourceId || sectionEditor.recordId)).map((row) => (
                              <SelectItem key={row.recordId} value={row.recordId}>{row.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => void mergeSections()} disabled={saving || !(mergeSectionSourceId || sectionEditor.recordId) || !mergeSectionTargetId}>
                          Merge section
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const currentRow = sectionManagementRows.find((row) => row.value === editingSectionValue);
                          if (currentRow?.recordId) {
                            void deleteSection(currentRow);
                          }
                        }}
                        disabled={!sectionManagementRows.find((row) => row.value === editingSectionValue)?.recordId}
                      >
                        Delete if unused
                      </Button>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={resetSectionEditor}>Clear</Button>
                        <Button onClick={() => void saveSectionEditor()} disabled={saving}>Save section</Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Pick a section from the table to edit its name, description, order, or active status.
                  </div>
                )}
                <Button variant="outline" onClick={() => openNewSectionDialog("section-editor")}>Create new section</Button>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">System sections</p>
                  <p className="text-sm text-muted-foreground">{sortedSectionManagementRows.length} sections available for quote grouping.</p>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <SortableHeader columnKey="state" sortState={sectionSortState} onSort={requestSectionSort} className="p-3">State</SortableHeader>
                      <SortableHeader columnKey="order" sortState={sectionSortState} onSort={requestSectionSort} className="p-3">Order</SortableHeader>
                      <SortableHeader columnKey="name" sortState={sectionSortState} onSort={requestSectionSort} className="p-3">Name</SortableHeader>
                      <SortableHeader columnKey="key" sortState={sectionSortState} onSort={requestSectionSort} className="p-3">Key</SortableHeader>
                      <SortableHeader columnKey="quotes" sortState={sectionSortState} onSort={requestSectionSort} className="p-3">Quote items</SortableHeader>
                      <SortableHeader columnKey="imports" sortState={sectionSortState} onSort={requestSectionSort} className="p-3">Imports</SortableHeader>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSectionManagementRows.map((row) => (
                      <tr key={row.value} className={`border-b last:border-0 ${row.is_active === false ? "opacity-60" : ""}`}>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={row.is_active === false ? "outline" : "secondary"}>{row.is_active === false ? "Inactive" : "Active"}</Badge>
                            {row.is_default ? <Badge variant="outline">Default</Badge> : <Badge variant="outline">Custom</Badge>}
                          </div>
                        </td>
                        <td className="p-3">{row.display_order}</td>
                        <td className="p-3">
                          <p className="font-medium">{row.label}</p>
                          {row.description ? <p className="mt-1 text-xs text-muted-foreground">{row.description}</p> : null}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{row.value}</td>
                        <td className="p-3">{row.usage.quoteItems}</td>
                        <td className="p-3">{row.usage.importItems + row.usage.quoteImports}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => editSection(row)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => void deleteSection(row)}>Archive</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {sortedSectionManagementRows.length === 0 ? (
                      <tr>
                        <td className="p-6 text-center text-sm text-muted-foreground" colSpan={7}>No sections found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="items">
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <SortableHeader columnKey="item" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Item</SortableHeader>
                  <SortableHeader columnKey="state" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">State</SortableHeader>
                  <th className="p-3">Select</th>
                  <SortableHeader columnKey="category" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Category</SortableHeader>
                  <SortableHeader columnKey="qty" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Qty</SortableHeader>
                  <SortableHeader columnKey="buy" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Buy</SortableHeader>
                  <SortableHeader columnKey="markup" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Markup</SortableHeader>
                  <th className="p-3">Auto-inclusions</th>
                  <SortableHeader columnKey="cabinet" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Cabinet</SortableHeader>
                  <SortableHeader columnKey="dimensions" sortState={itemReviewSortState} onSort={requestItemReviewSort} className="p-3">Dimensions</SortableHeader>
                </tr>
              </thead>
              <tbody>
                {sortedItemReviewRows.map(({ item, index }) => (
                  <tr key={item.id || index} className={`border-b last:border-0 ${item.review_state === "excluded" ? "opacity-60" : ""}`}>
                    <td className="p-3"><Input value={item.name || ""} onChange={(event) => updateItem(index, "name", event.target.value)} /></td>
                    <td className="p-3"><Badge variant={item.review_state === "deleted" ? "destructive" : "secondary"}>{item.review_state || "active"}</Badge><div className="mt-1 text-xs text-muted-foreground">{item.learning_state}</div></td>
                    <td className="p-3"><input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={(event) => setSelectedItemIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></td>
                    <td className="p-3">
                      <Select value={item.category || "misc_fixings"} onValueChange={(value) => updateItem(index, "category", value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-3"><Input type="number" value={item.quantity || 0} onChange={(event) => updateItem(index, "quantity", event.target.value)} /></td>
                    <td className="p-3"><Input type="number" value={item.buy_price || 0} onChange={(event) => updateItem(index, "buy_price", event.target.value)} /></td>
                    <td className="p-3"><Input type="number" value={item.markup_percent || 0} onChange={(event) => updateItem(index, "markup_percent", event.target.value)} /></td>
                    <td className="p-3">
                      <Button variant="outline" size="sm" onClick={() => openAutoModal(index)}>
                        Auto-inclusions
                      </Button>
                      <div className="mt-1 text-xs text-muted-foreground">{item.auto_inclusion_state || "Needs review"}</div>
                      {(item.row_auto_inclusions || []).some((row) => !row.unit_cost) ? <Badge variant="outline" className="pricing-warning-badge mt-1">Missing inclusion price</Badge> : null}
                    </td>
                    <td className="p-3">{item.cabinet_reference || "-"}</td>
                    <td className="p-3 text-muted-foreground">{[item.dimensions?.length_mm, item.dimensions?.width_mm, item.dimensions?.thickness_mm].filter(Boolean).join(" x ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-2 border-t p-3">
              <Button variant="outline" size="sm" onClick={() => setItemReviewState(selectedItemIds, "excluded")} disabled={selectedItemIds.length === 0}><Ban className="mr-2 h-4 w-4" />Exclude selected</Button>
              <Button variant="outline" size="sm" onClick={() => setItemReviewState(selectedItemIds, "deleted")} disabled={selectedItemIds.length === 0}><Trash2 className="mr-2 h-4 w-4" />Delete selected</Button>
              <Button variant="ghost" size="sm" onClick={() => setItemReviewState(items.map((item) => item.id), "active")}>Undo removals</Button>
              <Button size="sm" onClick={saveDefaults} disabled={items.length === 0}>Save edited defaults</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="labour">
          <Card className="p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Labour sell rate">
                <Select value={String(assumptions.labour_sell_rate)} onValueChange={(value) => setAssumptions((current) => ({ ...current, labour_sell_rate: toNumber(value, 110) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">$100/hr</SelectItem>
                    <SelectItem value="110">$110/hr</SelectItem>
                    <SelectItem value="120">$120/hr</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Custom rate">
                <Input type="number" value={assumptions.labour_sell_rate} onChange={(event) => setAssumptions((current) => ({ ...current, labour_sell_rate: toNumber(event.target.value, 110) }))} />
              </Field>
              <Field label="Complexity">
                <Select value={assumptions.complexity} onValueChange={(value) => setAssumptions((current) => ({ ...current, complexity: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMPLEXITY_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {Object.entries(calculation?.assumptions?.labour || labourProfile?.assumptions || {}).map(([key, value]) => (
                <div key={key} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                  <p className="mt-1 font-semibold">{String(value)}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inclusions">
          <Tabs defaultValue="every-job" className="space-y-4">
            <TabsList>
              <TabsTrigger value="every-job">Every Job Inclusions</TabsTrigger>
              <TabsTrigger value="triggered">Triggered inclusions ({autoInclusions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="every-job">
              <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                <Card className="p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold">{editingGlobalInclusionId ? "Edit Every Job Inclusion" : "Add Every Job Inclusion"}</p>
                      <p className="text-sm text-muted-foreground">Active rules are added once to new quotes and pricing updates.</p>
                    </div>
                    <Field label="Description">
                      <Input value={globalInclusionForm.description} onChange={(event) => updateGlobalInclusionForm("description", event.target.value)} placeholder="Freight, packaging, consumables..." />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Category">
                        <Select value={globalInclusionForm.category} onValueChange={handleGlobalInclusionCategoryChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                            <SelectItem value={ADD_PRICING_CATEGORY_VALUE}>+ Add new category</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Unit">
                        <Input value={globalInclusionForm.unit} onChange={(event) => updateGlobalInclusionForm("unit", event.target.value)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Quantity">
                        <Input type="number" value={globalInclusionForm.quantity} onChange={(event) => updateGlobalInclusionForm("quantity", toNumber(event.target.value, 1))} />
                      </Field>
                      <Field label="Cost">
                        <Input type="number" value={globalInclusionForm.cost} onChange={(event) => updateGlobalInclusionForm("cost", toNumber(event.target.value, 0))} />
                      </Field>
                      <Field label="Markup %">
                        <Input type="number" value={globalInclusionForm.markup} onChange={(event) => updateGlobalInclusionForm("markup", toNumber(event.target.value, 30))} />
                      </Field>
                    </div>
                    <Field label="GST treatment">
                      <Select value={globalInclusionForm.gst_treatment} onValueChange={(value) => updateGlobalInclusionForm("gst_treatment", value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ex_gst">Ex GST</SelectItem>
                          <SelectItem value="inc_gst">Inc GST</SelectItem>
                          <SelectItem value="unknown">Needs review</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="grid gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={globalInclusionForm.active} onChange={(event) => updateGlobalInclusionForm("active", event.target.checked)} />
                        Active
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={globalInclusionForm.review_required} onChange={(event) => updateGlobalInclusionForm("review_required", event.target.checked)} />
                        Needs review when auto-added
                      </label>
                    </div>
                    <Field label="Notes">
                      <Textarea rows={3} value={globalInclusionForm.notes} onChange={(event) => updateGlobalInclusionForm("notes", event.target.value)} />
                    </Field>
                    <div className="rounded-lg bg-muted/40 p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sell value</span>
                        <strong>{formatCurrency(toNumber(globalInclusionForm.cost, 0) * toNumber(globalInclusionForm.quantity, 1) * (1 + toNumber(globalInclusionForm.markup, 30) / 100))}</strong>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {editingGlobalInclusionId ? <Button variant="outline" onClick={resetGlobalInclusionForm}>Cancel</Button> : null}
                      <Button onClick={() => void saveGlobalInclusion()} disabled={saving || !globalInclusionForm.description.trim()}>
                        <Save className="mr-2 h-4 w-4" />{editingGlobalInclusionId ? "Save changes" : "Add inclusion"}
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Every Job Inclusion Rules</p>
                      <p className="text-sm text-muted-foreground">{globalAutoInclusions.length} configured defaults</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">Future quotes by default</Badge>
                      <Button variant="outline" size="sm" onClick={() => void applyGlobalInclusionsToSelectedQuote()} disabled={!quoteId}>Apply to selected quote</Button>
                    </div>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <SortableHeader columnKey="state" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">State</SortableHeader>
                          <SortableHeader columnKey="description" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">Description</SortableHeader>
                          <SortableHeader columnKey="category" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">Category</SortableHeader>
                          <SortableHeader columnKey="qty" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">Qty</SortableHeader>
                          <SortableHeader columnKey="cost" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">Cost</SortableHeader>
                          <SortableHeader columnKey="markup" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">Markup</SortableHeader>
                          <SortableHeader columnKey="gst" sortState={globalInclusionSortState} onSort={requestGlobalInclusionSort} className="p-3">GST</SortableHeader>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedGlobalAutoInclusions.map((record) => (
                          <tr key={record.id} className={`border-b last:border-0 ${record.active === false ? "opacity-60" : ""}`}>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={record.active === false ? "outline" : "secondary"}>{record.active === false ? "Inactive" : "Active"}</Badge>
                                {record.review_required !== false ? <Badge variant="outline">Review</Badge> : null}
                              </div>
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{record.description}</p>
                              {record.notes ? <p className="mt-1 text-xs text-muted-foreground">{record.notes}</p> : null}
                            </td>
                            <td className="p-3">{categoryLookup.get(record.category) || record.category}</td>
                            <td className="p-3">{record.quantity} {record.unit}</td>
                            <td className="p-3">{formatCurrency(record.cost || 0)}</td>
                            <td className="p-3">{record.markup || 0}%</td>
                            <td className="p-3">{String(record.gst_treatment || "ex_gst").replace(/_/g, " ")}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => editGlobalInclusion(record)}>Edit</Button>
                                <Button variant="outline" size="sm" onClick={() => void toggleGlobalInclusionActive(record)}>{record.active === false ? "Activate" : "Deactivate"}</Button>
                                <Button variant="ghost" size="sm" onClick={() => void deleteGlobalInclusion(record)}>Delete</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {globalAutoInclusions.length === 0 ? (
                          <tr>
                            <td className="p-6 text-center text-sm text-muted-foreground" colSpan={8}>No Every Job Inclusions yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="triggered">
              <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                <Card className="p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold">{editingTriggeredRuleId ? "Edit Triggered Rule" : "Add Triggered Rule"}</p>
                      <p className="text-sm text-muted-foreground">Match imported quote rows and auto-add related pricing items before commit.</p>
                    </div>
                    <Field label="Rule name">
                      <Input value={triggeredRuleForm.rule_name} onChange={(event) => updateTriggeredRuleForm("rule_name", event.target.value)} placeholder="MERIVO E fixing screws" />
                    </Field>
                    <Field label="Match mode">
                      <Select value={triggeredRuleForm.match_mode} onValueChange={(value) => updateTriggeredRuleForm("match_mode", value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Match all conditions</SelectItem>
                          <SelectItem value="any">Match any condition</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Trigger category">
                        <Select value={triggeredRuleForm.trigger_category || "__none__"} onValueChange={(value) => updateTriggeredRuleForm("trigger_category", value === "__none__" ? "" : value)}>
                          <SelectTrigger><SelectValue placeholder="Any category" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Any category</SelectItem>
                            {pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Trigger item type">
                        <Input value={triggeredRuleForm.trigger_item_type} onChange={(event) => updateTriggeredRuleForm("trigger_item_type", event.target.value)} placeholder="guide, hinge, drawer..." />
                      </Field>
                    </div>
                    <Field label="Description contains">
                      <Input value={triggeredRuleForm.trigger_description_contains} onChange={(event) => updateTriggeredRuleForm("trigger_description_contains", event.target.value)} placeholder="MERIVO E, LEGRABOX, hinge" />
                    </Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="SKU equals">
                        <Input value={triggeredRuleForm.trigger_product_number_equals} onChange={(event) => updateTriggeredRuleForm("trigger_product_number_equals", event.target.value)} placeholder="770C600" />
                      </Field>
                      <Field label="SKU contains">
                        <Input value={triggeredRuleForm.trigger_product_number_contains} onChange={(event) => updateTriggeredRuleForm("trigger_product_number_contains", event.target.value)} placeholder="MERIVO" />
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Supplier equals">
                        <Input value={triggeredRuleForm.trigger_supplier} onChange={(event) => updateTriggeredRuleForm("trigger_supplier", event.target.value)} placeholder="Blum" />
                      </Field>
                      <Field label="Inclusion description">
                        <Input value={triggeredRuleForm.inclusion_description} onChange={(event) => updateTriggeredRuleForm("inclusion_description", event.target.value)} placeholder="Fixing screws" />
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Inclusion category">
                        <Select value={triggeredRuleForm.inclusion_category} onValueChange={(value) => {
                          if (value === ADD_PRICING_CATEGORY_VALUE) {
                            openNewCategoryDialog("triggered-inclusions");
                            return;
                          }
                          updateTriggeredRuleForm("inclusion_category", value);
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                            <SelectItem value={ADD_PRICING_CATEGORY_VALUE}>+ Add new category</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Inclusion SKU">
                        <Input value={triggeredRuleForm.inclusion_sku} onChange={(event) => updateTriggeredRuleForm("inclusion_sku", event.target.value)} placeholder="EURO-SCREW" />
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Quantity logic">
                        <Select value={triggeredRuleForm.quantity_logic} onValueChange={(value) => updateTriggeredRuleForm("quantity_logic", value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed quantity</SelectItem>
                            <SelectItem value="per_imported_item">Per imported item</SelectItem>
                            <SelectItem value="quantity_per_unit">Per unit</SelectItem>
                            <SelectItem value="custom_multiplier">Custom multiplier</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Multiplier">
                        <Input type="number" value={triggeredRuleForm.quantity_multiplier} onChange={(event) => updateTriggeredRuleForm("quantity_multiplier", toNumber(event.target.value, 1))} />
                      </Field>
                      <Field label="Unit">
                        <Input value={triggeredRuleForm.unit} onChange={(event) => updateTriggeredRuleForm("unit", event.target.value)} />
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Cost">
                        <Input type="number" value={triggeredRuleForm.cost} onChange={(event) => updateTriggeredRuleForm("cost", toNumber(event.target.value, 0))} />
                      </Field>
                      <Field label="Markup %">
                        <Input type="number" value={triggeredRuleForm.markup_percent} onChange={(event) => updateTriggeredRuleForm("markup_percent", toNumber(event.target.value, 30))} />
                      </Field>
                      <Field label="GST treatment">
                        <Select value={triggeredRuleForm.gst_treatment} onValueChange={(value) => updateTriggeredRuleForm("gst_treatment", value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ex_gst">Ex GST</SelectItem>
                            <SelectItem value="inc_gst">Inc GST</SelectItem>
                            <SelectItem value="unknown">Needs review</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={triggeredRuleForm.active} onChange={(event) => updateTriggeredRuleForm("active", event.target.checked)} />
                        Active
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={triggeredRuleForm.review_required} onChange={(event) => updateTriggeredRuleForm("review_required", event.target.checked)} />
                        Needs review when auto-added
                      </label>
                    </div>
                    <Field label="Notes">
                      <Textarea rows={3} value={triggeredRuleForm.notes} onChange={(event) => updateTriggeredRuleForm("notes", event.target.value)} />
                    </Field>
                    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Rule tester</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <Input value={triggeredRuleTest.description} onChange={(event) => setTriggeredRuleTest((current) => ({ ...current, description: event.target.value }))} placeholder="Sample description" />
                        <Input value={triggeredRuleTest.sku} onChange={(event) => setTriggeredRuleTest((current) => ({ ...current, sku: event.target.value }))} placeholder="Sample SKU" />
                        <Input value={triggeredRuleTest.supplier} onChange={(event) => setTriggeredRuleTest((current) => ({ ...current, supplier: event.target.value }))} placeholder="Sample supplier" />
                        <Input value={triggeredRuleTest.item_type} onChange={(event) => setTriggeredRuleTest((current) => ({ ...current, item_type: event.target.value }))} placeholder="Sample item type" />
                        <Input value={triggeredRuleTest.category} onChange={(event) => setTriggeredRuleTest((current) => ({ ...current, category: event.target.value }))} placeholder="Sample category" />
                        <Input type="number" value={triggeredRuleTest.quantity} onChange={(event) => setTriggeredRuleTest((current) => ({ ...current, quantity: toNumber(event.target.value, 1) }))} placeholder="Sample qty" />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant={triggeredRuleMatchesPreview ? "secondary" : "outline"}>{triggeredRuleMatchesPreview ? "Rule matches" : "No match"}</Badge>
                        <span className="text-muted-foreground">Preview qty {triggeredRulePreviewQuantity}</span>
                        <span className="text-muted-foreground">Preview sell {formatCurrency(triggeredRulePreviewQuantity * toNumber(triggeredRuleForm.cost, 0) * (1 + toNumber(triggeredRuleForm.markup_percent, 30) / 100))}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {editingTriggeredRuleId ? <Button variant="outline" onClick={resetTriggeredRuleForm}>Cancel</Button> : null}
                      <Button onClick={() => void saveTriggeredRule()} disabled={saving}>
                        <Save className="mr-2 h-4 w-4" />{editingTriggeredRuleId ? "Save changes" : "Add rule"}
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Triggered Auto-Inclusion Rules</p>
                      <p className="text-sm text-muted-foreground">{triggeredAutoInclusionRules.length} saved rules</p>
                    </div>
                    {autoInclusions.length ? <Badge variant="secondary">{autoInclusions.length} current calculated inclusions</Badge> : null}
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[1120px] text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <SortableHeader columnKey="state" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">State</SortableHeader>
                          <SortableHeader columnKey="rule" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">Rule</SortableHeader>
                          <SortableHeader columnKey="trigger" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">Trigger</SortableHeader>
                          <SortableHeader columnKey="inclusion" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">Inclusion</SortableHeader>
                          <SortableHeader columnKey="qty" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">Qty logic</SortableHeader>
                          <SortableHeader columnKey="cost" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">Cost</SortableHeader>
                          <SortableHeader columnKey="markup" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">Markup</SortableHeader>
                          <SortableHeader columnKey="gst" sortState={triggeredRuleSortState} onSort={requestTriggeredRuleSort} className="p-3">GST</SortableHeader>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTriggeredAutoInclusionRules.map((record) => (
                          <tr key={record.id} className={`border-b last:border-0 ${record.active === false ? "opacity-60" : ""}`}>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={record.active === false ? "outline" : "secondary"}>{record.active === false ? "Inactive" : "Active"}</Badge>
                                {record.review_required !== false ? <Badge variant="outline">Review</Badge> : null}
                              </div>
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{record.rule_name}</p>
                              {record.notes ? <p className="mt-1 text-xs text-muted-foreground">{record.notes}</p> : null}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {[record.trigger_category ? `Category ${categoryLookup.get(record.trigger_category) || record.trigger_category}` : "", record.trigger_description_contains ? `Desc ${record.trigger_description_contains}` : "", record.trigger_product_number_equals ? `SKU = ${record.trigger_product_number_equals}` : "", record.trigger_product_number_contains ? `SKU contains ${record.trigger_product_number_contains}` : "", record.trigger_supplier ? `Supplier ${record.trigger_supplier}` : "", record.trigger_item_type ? `Type ${record.trigger_item_type}` : ""].filter(Boolean).join(" · ")}
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{record.inclusion_description}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{categoryLookup.get(record.inclusion_category) || record.inclusion_category}{record.inclusion_sku ? ` · ${record.inclusion_sku}` : ""}</p>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">{String(record.quantity_logic || "per_imported_item").replace(/_/g, " ")} · x{record.quantity_multiplier || 1}</td>
                            <td className="p-3">{formatCurrency(record.cost || 0)}</td>
                            <td className="p-3">{record.markup_percent || 0}%</td>
                            <td className="p-3">{String(record.gst_treatment || "ex_gst").replace(/_/g, " ")}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => editTriggeredRule(record)}>Edit</Button>
                                <Button variant="outline" size="sm" onClick={() => void duplicateTriggeredRule(record)}>Duplicate</Button>
                                <Button variant="outline" size="sm" onClick={() => void toggleTriggeredRuleActive(record)}>{record.active === false ? "Activate" : "Deactivate"}</Button>
                                <Button variant="ghost" size="sm" onClick={() => void deleteTriggeredRule(record)}>Delete</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {triggeredAutoInclusionRules.length === 0 ? (
                          <tr>
                            <td className="p-6 text-center text-sm text-muted-foreground" colSpan={9}>No triggered auto-inclusion rules yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="scenarios">
          {scenarios.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {scenarios.map((scenario) => (
                <Card key={scenario.name} className="p-4">
                  <p className="font-semibold">{scenario.name}</p>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(scenario.total_inc_gst)}</p>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p>Ex GST {formatCurrency(scenario.subtotal_ex_gst)}</p>
                    <p>GST {formatCurrency(scenario.gst)}</p>
                    <p>Margin {scenario.gross_margin_percent}%</p>
                    <p>{scenario.labour_hours} hrs @ {formatCurrency(scenario.labour_rate)}</p>
                    <p>Markup {scenario.material_markup_percent}%</p>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6">
              <div className="max-w-2xl space-y-3">
                <div>
                  <p className="font-semibold">No scenarios to show yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Scenario comparisons appear after the pricing model runs a calculation. Right now the tab is empty because nothing has been calculated in this session yet.
                  </p>
                </div>
                {items.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" size="sm" onClick={() => void calculate()} disabled={loading || saving}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Calculate scenarios
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll compare minimum acceptable, recommended, and premium pricing once the calculation finishes.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Import or add pricing items first, then run a calculation to generate scenario comparisons.
                  </p>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card className="p-4">
            <p className="font-semibold">Historical comparison</p>
            <p className="mt-2 text-sm text-muted-foreground">Peer jobs: {historical?.peer_count || 0}</p>
            {historical?.averages ? (
              <div className="mt-4 grid gap-3 md:grid-cols-5">
                {Object.entries(historical.averages).map(([key, value]) => (
                  <div key={key} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                    <p className="mt-1 font-semibold">{key.includes("percent") || key.includes("hours") ? value : formatCurrency(value)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {historical?.anomalies?.length ? (
              <Alert className="mt-4 border-amber-300 bg-amber-50 text-amber-900">
                <AlertDescription>{historical.anomalies.join(" ")}</AlertDescription>
              </Alert>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Tabs defaultValue="internal">
            <TabsList>
              <TabsTrigger value="internal">Internal</TabsTrigger>
              <TabsTrigger value="client">Client</TabsTrigger>
            </TabsList>
            <TabsContent value="internal">
              <Card className="p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {Object.entries(totals).map(([key, value]) => (
                    <div key={key} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</p>
                      <p className="mt-1 font-semibold">{key.includes("percent") || key.includes("hours") ? value : formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="client">
              <Card className="p-4">
                <div className="max-w-2xl space-y-3">
                  <h2 className="text-xl font-semibold">{jobName}</h2>
                  <p className="text-sm text-muted-foreground">{items.length} priced lines including materials, hardware, labour, and allowances.</p>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between"><span>Materials allowance</span><strong>{formatCurrency(totals.marked_up_purchase_sell_price || 0)}</strong></div>
                    <div className="flex justify-between"><span>Labour allowance</span><strong>{formatCurrency(totals.labour_sell_value || 0)}</strong></div>
                    <div className="flex justify-between"><span>Total ex GST</span><strong>{formatCurrency(totals.subtotal_ex_gst || 0)}</strong></div>
                    <div className="flex justify-between"><span>GST</span><strong>{formatCurrency(totals.gst || 0)}</strong></div>
                    <div className="flex justify-between text-lg"><span>Total inc GST</span><strong>{formatCurrency(totals.total_inc_gst || 0)}</strong></div>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
      </>
      )}
      <Dialog open={autoModalItemIndex !== null} onOpenChange={(open) => { if (!open) setAutoModalItemIndex(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Auto-inclusions</DialogTitle>
            <DialogDescription>Review and adjust automatically included pricing rows for the selected imported item.</DialogDescription>
          </DialogHeader>
          {autoModalItemIndex !== null ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{items[autoModalItemIndex]?.name}</p>
                <p className="text-muted-foreground">SKU {items[autoModalItemIndex]?.product_number || items[autoModalItemIndex]?.supplier_sku || "-"} · Qty {items[autoModalItemIndex]?.quantity || 0}</p>
              </div>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <SortableHeader columnKey="description" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">Selector / description</SortableHeader>
                      <SortableHeader columnKey="sku" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">SKU</SortableHeader>
                      <SortableHeader columnKey="category" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">Category</SortableHeader>
                      <SortableHeader columnKey="logic" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">Logic</SortableHeader>
                      <SortableHeader columnKey="value" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">Value</SortableHeader>
                      <th className="p-2">Preview</th>
                      <SortableHeader columnKey="cost" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">Cost</SortableHeader>
                      <SortableHeader columnKey="markup" sortState={autoModalSortState} onSort={requestAutoModalSort} className="p-2">Markup</SortableHeader>
                      <th className="p-2">Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAutoModalRows.map(({ row, index: rowIndex }) => (
                      <tr key={rowIndex} className="border-b">
                        <td className="p-2">
                          <Input
                            list="pricing-inclusion-options"
                            value={row.inclusion_description || ""}
                            onChange={(event) => {
                              const selected = masterPricingItems.find((item) => item.name === event.target.value);
                              setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? {
                                ...entry,
                                inclusion_description: event.target.value,
                                inclusion_pricing_item_id: selected?.id || entry.inclusion_pricing_item_id || "",
                                inclusion_sku: selected?.product_number || selected?.supplier_sku || entry.inclusion_sku || "",
                                inclusion_category: selected?.category || entry.inclusion_category || "misc_fixings",
                                unit_cost: selected?.buy_price ?? entry.unit_cost ?? 0,
                                markup_percent: selected?.markup_percent ?? entry.markup_percent ?? 30,
                              } : entry));
                            }}
                          />
                        </td>
                        <td className="p-2"><Input value={row.inclusion_sku || ""} onChange={(event) => setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? { ...entry, inclusion_sku: event.target.value } : entry))} /></td>
                        <td className="p-2">
                          <Select value={row.inclusion_category || "misc_fixings"} onValueChange={(value) => setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? { ...entry, inclusion_category: value } : entry))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select value={row.quantity_logic || "per_imported_item"} onValueChange={(value) => setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? { ...entry, quantity_logic: value } : entry))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{INCLUSION_QUANTITY_LOGIC.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="p-2"><Input type="number" value={row.quantity_value || 0} onChange={(event) => setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? { ...entry, quantity_value: toNumber(event.target.value, 1) } : entry))} /></td>
                        <td className="p-2">{calculateInclusionQuantity(row, items[autoModalItemIndex])}</td>
                        <td className="p-2"><Input type="number" value={row.unit_cost || 0} onChange={(event) => setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? { ...entry, unit_cost: toNumber(event.target.value, 0) } : entry))} /></td>
                        <td className="p-2"><Input type="number" value={row.markup_percent || 0} onChange={(event) => setAutoModalRows((current) => current.map((entry, index) => index === rowIndex ? { ...entry, markup_percent: toNumber(event.target.value, 30) } : entry))} /></td>
                        <td className="p-2"><Button variant="ghost" size="sm" onClick={() => setAutoModalRows((current) => current.filter((_, index) => index !== rowIndex))}>Remove</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <datalist id="pricing-inclusion-options">
                {masterPricingItems.map((item) => <option key={item.id} value={item.name} />)}
              </datalist>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={() => setAutoModalRows((current) => [...current, {
                  inclusion_description: "",
                  inclusion_sku: "",
                  inclusion_category: "misc_fixings",
                  quantity_logic: "per_imported_item",
                  quantity_value: 1,
                  unit_cost: 0,
                  markup_percent: 30,
                  is_enabled: true,
                }])}>Add inclusion</Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => saveAutoModal(false)}>Save for this quote/import only</Button>
                  <Button onClick={() => saveAutoModal(true)} disabled={!items[autoModalItemIndex]?.master_item_id}>Save as default for future imports</Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={showNewCategoryDialog} onOpenChange={setShowNewCategoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new pricing category</DialogTitle>
            <DialogDescription>Add a reusable category for grouping pricing model items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Category name">
              <Input
                autoFocus
                value={newCategoryName}
                onChange={(event) => {
                  setNewCategoryName(event.target.value);
                  setNewCategoryError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveNewPricingCategory();
                  }
                }}
                placeholder="e.g. Installation consumables"
              />
            </Field>
            {newCategoryError ? (
              <Alert variant="destructive">
                <AlertDescription>{newCategoryError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewCategoryDialog(false)}>Cancel</Button>
              <Button onClick={() => void saveNewPricingCategory()}>Save category</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showNewSectionDialog} onOpenChange={setShowNewSectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new pricing section</DialogTitle>
            <DialogDescription>Add a reusable section for organizing quote pricing output.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Section name">
              <Input
                autoFocus
                value={newSectionName}
                onChange={(event) => {
                  setNewSectionName(event.target.value);
                  setNewSectionError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveNewPricingSection();
                  }
                }}
                placeholder="e.g. Stone, Appliances, Site works"
              />
            </Field>
            {newSectionError ? (
              <Alert variant="destructive">
                <AlertDescription>{newSectionError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewSectionDialog(false)}>Cancel</Button>
              <Button onClick={() => void saveNewPricingSection()}>Save section</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
