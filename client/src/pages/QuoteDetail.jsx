import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import RecordAuditPanel from "../components/RecordAuditPanel";
import AttachmentVersionDialog from "../components/AttachmentVersionDialog";
import StatusBadge from "../components/StatusBadge";
import ImportWizard from "../components/imports/ImportWizard";
import ReviewStateBadge, { getQuoteItemReviewState, getReviewStateRowClass } from "../components/ReviewStateBadge";
import SiteMeasureWorkflow from "../components/SiteMeasureWorkflow";
import ActualLabourPanel from "../components/time/ActualLabourPanel";
import ApprovalPanel from "../components/workflow/ApprovalPanel";
import ChecklistPanel from "../components/workflow/ChecklistPanel";
import ChangeOrderPanel from "../components/workflow/ChangeOrderPanel";
import AiDraftPanel from "../components/ai/AiDraftPanel";
import { SortableButton } from "@/components/ui/sortable-header";
import { getNextSortState } from "@/lib/tableSorting";
import { groupRowsWithChildren } from "@/lib/parentChildRows";
import { buildXlsxBlob } from "@/lib/xlsx/workbook";
import { loadDocumentEditorSections, saveDocumentEditorSections } from "@/lib/documentEditorSections";
import { toClientFacingIncGst, useClientMode } from "@/lib/clientMode.jsx";
import {
  HANDOFF_STATUS_OPTIONS,
  buildApprovalHistoryEntry,
  buildChangeOrderEntry,
  getOptionMeta,
  summarizeQuoteWorkflow,
} from "../lib/workflowReadiness";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HELP_TEXT } from "../lib/uploadRules";
import {
  buildPostApprovalRevisionPatch,
  buildQuoteApprovalPatch,
  isQuoteApprovalLocked,
} from "../lib/quoteApproval";
import { GST_RATE, QUOTE_STATUSES, WORKFLOW_PHASES, formatCurrency, formatDate, formatDateForInput, getStageConfig, normalizeQuoteStatus } from "../lib/helpers";
import { ADD_PRICING_CATEGORY_VALUE, buildPricingCategoryRecord, isDuplicatePricingCategoryName, normalisePricingCategoryOptions } from "../lib/pricingCategories";
import {
  ADD_PRICING_SECTION_VALUE,
  buildPricingSectionRecord,
  findMatchingPricingSection,
  isDuplicatePricingSectionName,
  normalisePricingSectionOptions,
} from "../lib/pricingSections";
import { ChevronRight, Download, Eye, EyeOff, Lock, Plus, Printer, Trash2, Briefcase, Edit2, File as FileIcon, FileImage, FileText, Unlock, UploadCloud } from "lucide-react";

const CATS = ["labour", "materials", "hardware", "doors_fronts", "packaging_freight", "freight_delivery", "subcontract", "delivery", "install", "other"];
const QUOTE_ITEM_CATEGORY_DEFAULTS = CATS.map((category) => [category, category.replace(/_/g, " ")]);
const QUOTE_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "awaiting_bruce", label: "Awaiting Bruce" },
  { value: "awaiting_mathew", label: "Awaiting Mathew" },
  { value: "quote_complete", label: "Quote Complete" },
  { value: "awaiting_confirmation", label: "Awaiting Confirmation" },
  { value: "won", label: "Won" },
  { value: "archived", label: "Archived" },
];

const QUOTE_LINE_ITEM_SORT_COLUMNS = {
  description: { accessor: (item) => item.description, type: "text" },
  category: { accessor: (item) => item.category, type: "text" },
  qty: { accessor: (item) => item.quantity, type: "number" },
  cost: { accessor: (item) => item.unit_cost, type: "currency" },
  markup: { accessor: (item) => item.markup_percent, type: "percent" },
  total: { accessor: (item) => item.total, type: "currency" },
  status: { accessor: (item) => `${item.review_status || ""} ${item.source || ""}`, type: "status" },
};

const QUOTE_IMPORT_REVIEW_SORT_COLUMNS = {
  description: { accessor: (row) => row.description || row.name, type: "text" },
  category: { accessor: (row) => row.category, type: "text" },
  qty: { accessor: (row) => row.quantity, type: "number" },
  unit: { accessor: (row) => row.unit, type: "text" },
  cost: { accessor: (row) => row.buy_price, type: "currency" },
  markup: { accessor: (row) => row.markup_percent, type: "percent" },
  sell: { accessor: (row) => row.total_sell_price, type: "currency" },
  source: { accessor: (row) => row.source_page || row.source_row, type: "number" },
};

function formatQuoteListCurrency(amount) {
  return formatCurrency(amount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuoteListIncGst(amount, gstRate = GST_RATE) {
  return formatQuoteListCurrency(toClientFacingIncGst(amount, gstRate));
}

function sanitizeExportFilename(value) {
  return String(value || "quote-list")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "quote-list";
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(attachment) {
  const mimeType = String(attachment.mime_type || "");
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  return "file";
}

function isBackupAttachmentFile(record) {
  const name = String(record?.name || record?.stored_name || "").toLowerCase();
  return name.includes(".bak");
}

function formatPricingDocumentType(value) {
  const labels = {
    mozaik_material_list: "Mozaik material list",
    supplier_quote: "Supplier quote",
    supplier_invoice: "Supplier invoice",
    supplier_estimate: "Supplier estimate",
    generic_pricing_document: "Pricing document",
  };
  return labels[value] || "Pricing document";
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatGstTreatmentLabel(value) {
  const normalized = String(value || "unknown").trim().toLowerCase();
  if (normalized === "ex_gst") return "Ex GST";
  if (normalized === "inc_gst") return "Inc GST";
  if (normalized === "zero_rated") return "Zero-rated";
  if (normalized === "exempt") return "GST exempt";
  return "Needs review";
}

function getQuoteItemGstRate(item) {
  const treatment = String(item?.gst_treatment || "").trim().toLowerCase();
  if (treatment === "zero_rated" || treatment === "exempt") return 0;
  const explicitRate = Number(item?.gst_rate ?? item?.gst_percent);
  if (Number.isFinite(explicitRate) && explicitRate >= 0) {
    return explicitRate > 1 ? explicitRate / 100 : explicitRate;
  }
  return GST_RATE;
}

function safeMarginPercent(sellValue, costValue) {
  const sell = Number(sellValue || 0);
  const cost = Number(costValue || 0);
  if (!Number.isFinite(sell) || sell <= 0) {
    return 0;
  }
  return ((sell - cost) / sell) * 100;
}

function getMarginTone(marginPercent) {
  if (marginPercent < 35) {
    return {
      cardClass: "border-[#d7ada5] bg-[#eedbd7]/45",
      badgeColor: "red",
      valueClass: "text-[#7e4038]",
    };
  }
  if (marginPercent > 45) {
    return {
      cardClass: "border-[#c9d7be] bg-[#e6ece0]/55",
      badgeColor: "emerald",
      valueClass: "text-[#4f6540]",
    };
  }
  return {
    cardClass: "border-[#c9d7be] bg-white/70",
    badgeColor: "green",
    valueClass: "text-[#4f6540]",
  };
}

const QUOTE_LIFECYCLE_STEPS = [
  { id: "lead", label: "Lead", helper: "Optional", target: "leads" },
  { id: "details", label: "Quote Details", helper: "In progress", target: "overview" },
  { id: "pricing", label: "Import / Pricing", helper: "Costing", target: "pricing" },
  { id: "review", label: "Review", helper: "Needs review", target: "quote-list" },
  { id: "document", label: "Generate Document", helper: "Pending", target: "document" },
  { id: "send", label: "Send / Print", helper: "Pending", target: "send" },
  { id: "schedule", label: "Schedule Install", helper: "Pending", target: "schedule" },
  { id: "archive", label: "Archive / Complete", helper: "Pending", target: "archive" },
];

function QuoteLifecycleRail({ steps, currentIndex = 1, onStep }) {
  return (
    <section className="jf-reference-panel p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Quote workflow</p>
          <h2 className="font-heading text-lg font-semibold text-foreground">Core workshop flow</h2>
        </div>
        <p className="text-sm text-muted-foreground">Lead to archive, one step at a time.</p>
      </div>
      <ol className="grid gap-2 lg:grid-cols-8">
        {steps.map((step, index) => {
          const active = index === currentIndex;
          const complete = index < currentIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onStep(step.target)}
                aria-label={step.id === "pricing" ? "Add pricing" : step.label}
                className={`flex h-full min-h-[74px] w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-[#7e9272] bg-[#e6ece0]/70 shadow-sm"
                    : complete
                      ? "border-border/50 bg-white/75"
                      : "border-border/45 bg-white/55 hover:bg-muted/25"
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  active ? "bg-[#5f7555] text-white" : complete ? "bg-muted text-foreground" : "bg-muted/70 text-muted-foreground"
                }`}>
                  {index + 1}
                </span>
                <span className="mt-2 text-xs font-semibold leading-4 text-foreground">{step.label}</span>
                <span className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{step.helper}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function isMaterialMarginCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const excluded = new Set([
    "labour",
    "install",
    "delivery",
    "freight_delivery",
    "packaging_freight",
    "subcontract",
    "subcontracted_items",
    "admin",
    "admin_prep",
    "design",
    "service",
  ]);
  if (excluded.has(normalized)) {
    return false;
  }
  if (normalized.includes("labour") || normalized.includes("install") || normalized.includes("freight") || normalized.includes("delivery") || normalized.includes("admin") || normalized.includes("design")) {
    return false;
  }
  return true;
}

function isLabourMarginCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "labour" || normalized.includes("labour");
}

function isActiveQuoteMarginItem(item) {
  const reviewState = String(item?.review_state || "").trim().toLowerCase();
  return item?.is_optional !== true && reviewState !== "deleted" && reviewState !== "excluded";
}

function buildQuoteMarginAdjustmentPreview(items, {
  mode,
  targetMarginPercent,
  includeLocked = false,
}) {
  const activeItems = items.filter(isActiveQuoteMarginItem);
  const scopeItems = mode === "material"
    ? activeItems.filter((item) => isMaterialMarginCategory(item.category))
    : activeItems.filter((item) => !isLabourMarginCategory(item.category));
  const lockedItems = scopeItems.filter((item) => item.is_price_locked === true);
  const eligibleItems = includeLocked ? scopeItems : scopeItems.filter((item) => item.is_price_locked !== true);
  const currentSellTotal = roundMoney(eligibleItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const currentCostTotal = roundMoney(eligibleItems.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0));
  const currentMarginPercent = safeMarginPercent(currentSellTotal, currentCostTotal);

  if (!eligibleItems.length || (currentSellTotal <= 0 && currentCostTotal <= 0)) {
    return {
      mode,
      targetMarginPercent,
      includeLocked,
      eligibleItems,
      lockedItems,
      excludedItems: items.filter((item) => !isActiveQuoteMarginItem(item)),
      currentSellTotal,
      currentCostTotal,
      currentMarginPercent,
      targetSellTotal: 0,
      delta: 0,
      updates: [],
    };
  }

  const targetSellTotal = roundMoney(currentCostTotal / Math.max(0.0001, 1 - (Number(targetMarginPercent || 0) / 100)));
  const adjustmentBase = currentSellTotal > 0 ? currentSellTotal : currentCostTotal;
  const adjustmentFactor = adjustmentBase > 0 ? targetSellTotal / adjustmentBase : 1;
  const updates = eligibleItems.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unit_cost || 0);
    const costTotal = roundMoney(unitCost * quantity);
    const sourceTotal = currentSellTotal > 0 ? roundMoney(Number(item.total || 0)) : costTotal;
    return {
      item,
      quantity,
      costTotal,
      currentTotal: sourceTotal,
      nextTotal: roundMoney(sourceTotal * adjustmentFactor),
    };
  });

  if (updates.length > 0) {
    const sumWithoutLast = roundMoney(updates.slice(0, -1).reduce((sum, entry) => sum + entry.nextTotal, 0));
    updates[updates.length - 1].nextTotal = roundMoney(targetSellTotal - sumWithoutLast);
  }

  return {
    mode,
    targetMarginPercent,
    includeLocked,
    eligibleItems,
    lockedItems,
    excludedItems: items.filter((item) => !isActiveQuoteMarginItem(item)),
    currentSellTotal,
    currentCostTotal,
    currentMarginPercent,
    targetSellTotal,
    delta: roundMoney(targetSellTotal - currentSellTotal),
    updates: updates.map((entry) => ({
      ...entry,
      nextTotal: Math.max(0, roundMoney(entry.nextTotal)),
      nextMarkupPercent: entry.costTotal > 0
        ? roundMoney((((Math.max(0, roundMoney(entry.nextTotal))) - entry.costTotal) / entry.costTotal) * 100)
        : roundMoney(Number(entry.item.markup_percent || 0)),
    })),
  };
}

function buildQuoteGrossMarginScenario(items, targetMarginPercent) {
  const activeItems = items.filter(isActiveQuoteMarginItem);
  const preview = buildQuoteMarginAdjustmentPreview(items, {
    mode: "gross",
    targetMarginPercent,
    includeLocked: false,
  });
  const eligibleIds = new Set(preview.eligibleItems.map((item) => String(item.id || "")));
  const unaffectedItems = activeItems.filter((item) => !eligibleIds.has(String(item.id || "")));
  const unaffectedSellTotal = roundMoney(unaffectedItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const unaffectedCostTotal = roundMoney(unaffectedItems.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0));
  const subtotalExGst = roundMoney(preview.targetSellTotal + unaffectedSellTotal);
  const gst = roundMoney(subtotalExGst * GST_RATE);
  const totalIncGst = roundMoney(subtotalExGst + gst);
  const totalDirectCost = roundMoney(preview.currentCostTotal + unaffectedCostTotal);
  const totalProfit = roundMoney(subtotalExGst - totalDirectCost);
  const currentQuoteSell = roundMoney(activeItems.reduce((sum, item) => sum + Number(item.total || 0), 0));
  return {
    name: `${Number(targetMarginPercent || 0).toFixed(0)}% gross margin`,
    targetMarginPercent: Number(targetMarginPercent || 0),
    subtotalExGst,
    gst,
    totalIncGst,
    totalProfit,
    currentGrossMarginPercent: preview.currentMarginPercent,
    currentEligibleSellTotal: preview.currentSellTotal,
    eligibleSellTotal: preview.targetSellTotal,
    eligibleCostTotal: preview.currentCostTotal,
    deltaExGst: roundMoney(subtotalExGst - currentQuoteSell),
    affectedLineItemCount: preview.eligibleItems.length,
    lockedLineItemCount: preview.lockedItems.length,
    excludedLineItemCount: preview.excludedItems.length,
    labourCostExcluded: roundMoney(
      activeItems
        .filter((item) => isLabourMarginCategory(item.category))
        .reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0)
    ),
  };
}

function DocumentEditorSection({ title, isOpen, onToggle, children }) {
  return (
    <section className={`jf-document-editor-section transition-colors ${isOpen ? "" : "jf-document-editor-section-collapsed"}`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{isOpen ? "Shown in editor" : "Hidden in editor"}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-2"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          {isOpen ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span>{isOpen ? "Hide in editor" : "Show in editor"}</span>
          <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </Button>
      </div>
      <div className={`grid transition-all duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-border/45 px-3 py-3">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function enhancePrintableDocumentHtml(html = "") {
  if (!html || html.includes("jf-millbrook-document-print")) {
    return html;
  }

  const style = `
    <style id="jf-millbrook-document-print">
      :root { color-scheme: light; }
      body {
        background: #fbfaf7 !important;
        color: #29251f !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        break-inside: auto;
        page-break-inside: auto;
      }
      thead {
        display: table-header-group;
      }
      tfoot {
        display: table-footer-group;
      }
      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      th {
        background: #eee7db !important;
        color: #4f4940 !important;
      }
      th, td {
        border-color: rgba(103, 78, 54, 0.24) !important;
      }
      img, svg {
        max-width: 100%;
      }
      .cont-on-next-page,
      .continued,
      [data-continuation],
      [data-continued] {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      @media print {
        body { background: #fff !important; }
        table { page-break-inside: auto; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
      }
    </style>
  `;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${style}</head>`);
  }
  return `${style}${html}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function sanitizeJobNumberPart(value) {
  return String(value || "").replace(/[^a-z]/gi, "").toUpperCase();
}

function parseContactNameParts(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

function buildBaseJobNumberPrefix(quote) {
  const { firstName, lastName } = parseContactNameParts(quote?.contact_name || quote?.company_name || quote?.title || "");
  const lastNamePrefix = sanitizeJobNumberPart(lastName).slice(0, 4);
  const firstInitial = sanitizeJobNumberPart(firstName).slice(0, 1);
  const rawPrefix = `${lastNamePrefix}${firstInitial}`;

  if (rawPrefix.length >= 2) {
    return rawPrefix;
  }

  const fallback = sanitizeJobNumberPart(quote?.quote_number || quote?.title || "JOB").slice(0, 5);
  return fallback || "JOB";
}

function buildSuggestedJobNumber(quote, jobs) {
  const prefix = buildBaseJobNumberPrefix(quote);
  const matchingNumbers = jobs
    .map((job) => String(job.job_number || "").trim().toUpperCase())
    .filter((jobNumber) => jobNumber.startsWith(prefix))
    .map((jobNumber) => {
      const suffix = jobNumber.slice(prefix.length).match(/(\d{4})$/);
      return suffix ? Number.parseInt(suffix[1], 10) : 0;
    });

  const nextNumber = (matchingNumbers.length > 0 ? Math.max(...matchingNumbers) : 0) + 1;
  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
}

function getContactDisplayName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.full_name || contact.email || "Unnamed Contact";
}

function getChecklistBadgeColor(summary) {
  if (summary.signoffCompleteCount === summary.signoffTotalCount) {
    return "emerald";
  }
  if (summary.signoffCompleteCount > 0) {
    return "amber";
  }
  return "slate";
}

function isWorkflowTaskComplete(task) {
  const normalizedStatus = String(task?.status || "").trim().toLowerCase();
  return normalizedStatus === "complete" || normalizedStatus === "completed";
}

function getPreferredQuoteSectionValue(sectionOptions = [], quoteItem = null) {
  const currentSectionKey = String(quoteItem?.section_key || "").trim();
  if (currentSectionKey && sectionOptions.some((option) => option.value === currentSectionKey)) {
    return currentSectionKey;
  }
  const currentSectionName = String(quoteItem?.section || "").trim().toLowerCase();
  if (currentSectionName) {
    const matchingOption = sectionOptions.find((option) => String(option.label || "").trim().toLowerCase() === currentSectionName);
    if (matchingOption) {
      return matchingOption.value;
    }
  }
  if (sectionOptions.some((option) => option.value === "general")) {
    return "general";
  }
  return sectionOptions[0]?.value || "general";
}

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clientMode } = useClientMode();
  const fileInputRef = useRef(null);
  const [quote, setQuote] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [staffRecords, setStaffRecords] = useState([]);
  const [pricingCategoryRecords, setPricingCategoryRecords] = useState([]);
  const [pricingSectionRecords, setPricingSectionRecords] = useState([]);
  const [items, setItems] = useState([]);
  const [quoteImports, setQuoteImports] = useState([]);
  const [siteMeasures, setSiteMeasures] = useState([]);
  const [pricingReviewRows, setPricingReviewRows] = useState([]);
  const [workflowTasks, setWorkflowTasks] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [showItem, setShowItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingQuote, setEditingQuote] = useState(false);
  const [showWinDialog, setShowWinDialog] = useState(false);
  const [qForm, setQForm] = useState({});
  const [itemForm, setItemForm] = useState({ description: "", category: "materials", quantity: 1, unit: "ea", unit_cost: 0, markup_percent: 30, section: "General", section_id: "", section_key: "general", section_display_order: 999, is_optional: false, is_price_locked: false });
  const [editItemForm, setEditItemForm] = useState({ description: "", category: "materials", quantity: 1, unit: "ea", unit_cost: 0, markup_percent: 30, section: "General", section_id: "", section_key: "general", section_display_order: 999, is_optional: false, is_price_locked: false });
  const [editItemSaveAsDefault, setEditItemSaveAsDefault] = useState(false);
  const [saveDefaultsItem, setSaveDefaultsItem] = useState(null);
  const [saveDefaultsFields, setSaveDefaultsFields] = useState({ price: true, category: true, section: true });
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [jobNumber, setJobNumber] = useState("");
  const [jobNumberError, setJobNumberError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [versionAttachment, setVersionAttachment] = useState(null);
  const [showOlderAttachmentVersions, setShowOlderAttachmentVersions] = useState(false);
  const [showBackupAttachments, setShowBackupAttachments] = useState(false);
  const [attachmentVersionsByAttachmentId, setAttachmentVersionsByAttachmentId] = useState({});
  const [attachmentVersionLoadStateById, setAttachmentVersionLoadStateById] = useState({});
  const [pricingImportFile, setPricingImportFile] = useState(null);
  const [pricingImportStatus, setPricingImportStatus] = useState("Waiting for file");
  const [pricingImportError, setPricingImportError] = useState("");
  const [pricingImportNotice, setPricingImportNotice] = useState("");
  const [dirtyPricingImportIds, setDirtyPricingImportIds] = useState(() => new Set());
  const [pricingReviewSortState, setPricingReviewSortState] = useState({ key: null, direction: null });
  const [assigningTaskId, setAssigningTaskId] = useState("");
  const [showDocumentGenerator, setShowDocumentGenerator] = useState(false);
  const [quoteDocument, setQuoteDocument] = useState(null);
  const [quoteDocumentPreviewHtml, setQuoteDocumentPreviewHtml] = useState("");
  const [quoteDocumentWarnings, setQuoteDocumentWarnings] = useState([]);
  const [quoteDocumentErrors, setQuoteDocumentErrors] = useState([]);
  const [generatedDocumentAttachment, setGeneratedDocumentAttachment] = useState(null);
  const [generatingDocument, setGeneratingDocument] = useState(false);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [selectedDocumentTemplateId, setSelectedDocumentTemplateId] = useState("");
  const [documentEditorSections, setDocumentEditorSections] = useState(() => loadDocumentEditorSections(typeof window !== "undefined" ? window.localStorage : null, { quoteId: "", documentType: "contract" }));
  const [showNewCategoryDialog, setShowNewCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState("");
  const [newCategoryTarget, setNewCategoryTarget] = useState("edit");
  const [showNewSectionDialog, setShowNewSectionDialog] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionError, setNewSectionError] = useState("");
  const [newSectionTarget, setNewSectionTarget] = useState("edit");
  const [showGlobalInclusionSectionDialog, setShowGlobalInclusionSectionDialog] = useState(false);
  const [pendingGlobalInclusionConfirm, setPendingGlobalInclusionConfirm] = useState({ mode: "single", itemId: "" });
  const [globalInclusionSectionValue, setGlobalInclusionSectionValue] = useState("general");
  const [globalInclusionSectionError, setGlobalInclusionSectionError] = useState("");
  const [quoteListSortState, setQuoteListSortState] = useState({ key: null, direction: null });
  const [grossMarginTarget, setGrossMarginTarget] = useState("40");
  const [materialMarginTarget, setMaterialMarginTarget] = useState("35");
  const [pendingMarginAdjustment, setPendingMarginAdjustment] = useState(null);
  const [includeLockedMarginItems, setIncludeLockedMarginItems] = useState(false);
  const [applyingMarginAdjustment, setApplyingMarginAdjustment] = useState(false);
  const [activeQuoteTab, setActiveQuoteTab] = useState("overview");
  const [similarQuotes, setSimilarQuotes] = useState([]);
  const [quoteInsights, setQuoteInsights] = useState(null);
  const [quoteRiskAnalysis, setQuoteRiskAnalysis] = useState(null);
  const [similarHistoricalJobs, setSimilarHistoricalJobs] = useState([]);
  const [quoteKnowledgeResults, setQuoteKnowledgeResults] = useState([]);
  const [advancedQuoteMode, setAdvancedQuoteMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage?.getItem("joinerflow-quote-advanced-mode") === "true";
  });
  const [quoteEditUnlocked, setQuoteEditUnlocked] = useState(false);
  const [clientApprovalForm, setClientApprovalForm] = useState({
    approval_date: "",
    notes: "",
    attachment_id: "",
  });
  const setQuoteAdvancedMode = (enabled) => {
    setAdvancedQuoteMode(enabled);
    if (typeof window !== "undefined") {
      window.localStorage?.setItem("joinerflow-quote-advanced-mode", enabled ? "true" : "false");
    }
  };
  const requestQuoteListSort = (columnKey) => {
    setQuoteListSortState((current) => getNextSortState(current, columnKey));
  };
  const requestPricingReviewSort = (columnKey) => {
    setPricingReviewSortState((current) => getNextSortState(current, columnKey));
  };

  useEffect(() => { void loadData(); }, [id]);

  useEffect(() => {
    if (!showDocumentGenerator || !quoteDocument) return;
    setDocumentEditorSections(
      loadDocumentEditorSections(typeof window !== "undefined" ? window.localStorage : null, {
        quoteId: id,
        documentType: quoteDocument.documentType || "contract",
      })
    );
  }, [id, showDocumentGenerator, quoteDocument?.documentType]);

  useEffect(() => {
    if (!showDocumentGenerator || !quoteDocument) return;
    saveDocumentEditorSections(typeof window !== "undefined" ? window.localStorage : null, {
      quoteId: id,
      documentType: quoteDocument.documentType || "contract",
    }, documentEditorSections);
  }, [documentEditorSections, id, showDocumentGenerator, quoteDocument]);

  useEffect(() => {
    if (!quote) return;
    setClientApprovalForm({
      approval_date: quote.client_approval_date || "",
      notes: quote.client_approval_notes || "",
      attachment_id: quote.client_approval_attachment_id || quote.approved_document_attachment_id || "",
    });
    if (quote.has_unapproved_changes) {
      setQuoteEditUnlocked(true);
    }
  }, [quote?.id, quote?.client_approval_date, quote?.client_approval_notes, quote?.client_approval_attachment_id, quote?.approved_document_attachment_id, quote?.has_unapproved_changes]);

  const loadData = async () => {
    const [q, i, workflowTaskRecords, files, contactRecords, jobRecords, staff, imports, siteMeasureRecords, reviewRows, categories, sections, timeEntryRecords] = await Promise.all([
      crmApi.entities.Quote.get(id),
      crmApi.entities.QuoteItem.filter({ quote_id: id }),
      crmApi.entities.JobOperation.filter({ quote_id: id }, "sort_order"),
      crmApi.entities.Attachment.filter({ related_id: id, related_type: "quote" }, "-created_date"),
      crmApi.entities.Contact.list("-created_date", 500),
      crmApi.entities.Job.list("job_number", 500),
      crmApi.entities.Staff.list("name", 500),
      crmApi.entities.QuoteImport.filter({ quote_id: id }, "-created_date", 20),
      crmApi.entities.SiteMeasure.filter({ quote_id: id }, "-measure_date", 10),
      crmApi.entities.PricingQuoteItem.filter({ quote_id: id }, "sort_order", 1000),
      crmApi.entities.PricingCategory.list("name", 10000),
      crmApi.entities.PricingSection.list("display_order", 10000),
      crmApi.entities.TimeEntry.list("-date", 1000),
    ]);
    setQuote(q);
    setQForm(q || {});
    setContacts(contactRecords);
    setJobs(jobRecords);
    setStaffRecords(staff);
    setPricingCategoryRecords(Array.isArray(categories) ? categories : []);
    setPricingSectionRecords(Array.isArray(sections) ? sections : []);
    setQuoteImports(imports);
    setSiteMeasures(Array.isArray(siteMeasureRecords) ? siteMeasureRecords : []);
    setPricingReviewRows(reviewRows);
    setItems(i.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    setWorkflowTasks((Array.isArray(workflowTaskRecords) ? workflowTaskRecords : []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    setTimeEntries(Array.isArray(timeEntryRecords) ? timeEntryRecords : []);
    setAttachments(files);
    if (q?.id && crmApi.ai) {
      if (crmApi.ai.similarQuotes) {
        crmApi.ai.similarQuotes(q.id, { limit: 4 })
          .then((response) => setSimilarQuotes(Array.isArray(response?.results) ? response.results : []))
          .catch(() => setSimilarQuotes([]));
      }
      if (crmApi.ai.quoteInsights) {
        crmApi.ai.quoteInsights(q.id)
          .then((response) => setQuoteInsights(response || null))
          .catch(() => setQuoteInsights(null));
      }
      if (crmApi.ai.quoteRiskAnalysis) {
        crmApi.ai.quoteRiskAnalysis(q.id)
          .then((response) => setQuoteRiskAnalysis(response || null))
          .catch(() => setQuoteRiskAnalysis(null));
      }
      if (crmApi.ai.similarHistoricalJobs) {
        crmApi.ai.similarHistoricalJobs(q.id, { limit: 6 })
          .then((response) => setSimilarHistoricalJobs(Array.isArray(response?.results) ? response.results : []))
          .catch(() => setSimilarHistoricalJobs([]));
      }
      if (crmApi.ai.knowledgeSearch) {
        const query = [q.quote_number, q.title, q.contact_name || q.customer_name || q.company_name]
          .filter(Boolean)
          .join(" ");
        crmApi.ai.knowledgeSearch({
          query: query || String(q.title || q.quote_number || "quote"),
          limit: 4,
          entity_type: "Quote",
        })
          .then((response) => setQuoteKnowledgeResults(Array.isArray(response?.results) ? response.results : []))
          .catch(() => setQuoteKnowledgeResults([]));
      }
    } else {
      setSimilarQuotes([]);
      setQuoteInsights(null);
      setQuoteRiskAnalysis(null);
      setSimilarHistoricalJobs([]);
      setQuoteKnowledgeResults([]);
    }
  };

  const latestGeneratedDocument = () => {
    if (generatedDocumentAttachment?.id) return generatedDocumentAttachment;
    const generated = attachments.find((attachment) => String(attachment.source || "") === "generated-document");
    if (generated) return generated;
    return attachments.find((attachment) => String(attachment.mime_type || "").includes("pdf")) || null;
  };

  const ensureQuoteEditAllowed = () => {
    if (!isQuoteApprovalLocked(quote) || quoteEditUnlocked) {
      return true;
    }
    const confirmed = window.confirm("This quote has an approved price or document. Unlock editing and create a new revision before changing it?");
    if (confirmed) {
      setQuoteEditUnlocked(true);
      toast({
        title: "Quote unlocked for revision",
        description: "The approved version is preserved. Your next change will be tracked as a new revision.",
      });
    }
    return confirmed;
  };

  const buildRevisionPatchForApprovedChange = (changeType, summary, nextItems = items) => buildPostApprovalRevisionPatch({
    quote,
    items: nextItems,
    changeType,
    summary,
    actor: quote?.approval_owner || "JoinerFlow",
  });

  const updateQuoteWithRevision = async (patch, options = {}) => {
    const revisionPatch = options.trackRevision
      ? buildRevisionPatchForApprovedChange(options.changeType || "quote_edit", options.summary || "Approved quote changed", options.nextItems || items)
      : {};
    await crmApi.entities.Quote.update(id, { ...patch, ...revisionPatch });
  };

  const recalc = async (lineItems, revisionMeta = {}) => {
    const subtotal = lineItems.filter((item) => !item.is_optional).reduce((sum, item) => sum + (item.total || 0), 0);
    const gst = Math.round(subtotal * GST_RATE * 100) / 100;
    await updateQuoteWithRevision(
      { subtotal, gst, total: subtotal + gst },
      {
        trackRevision: true,
        nextItems: lineItems,
        changeType: revisionMeta.changeType || "pricing_change",
        summary: revisionMeta.summary || "Quote pricing changed after approval",
      }
    );
  };

  const patchQuote = async (patch, options = {}) => {
    await updateQuoteWithRevision(patch, options);
    await loadData();
  };

  const updateQuoteTimeEntry = async (entryId, patch) => {
    await crmApi.entities.TimeEntry.update(entryId, patch);
    await loadData();
    toast({
      title: "Time entry updated",
      description: "Actual labour has been refreshed from the timeclock record.",
    });
  };

  const pricingCategoryOptions = normalisePricingCategoryOptions(pricingCategoryRecords, QUOTE_ITEM_CATEGORY_DEFAULTS);
  const pricingSectionOptions = useMemo(
    () => normalisePricingSectionOptions(pricingSectionRecords),
    [pricingSectionRecords]
  );
  const pricingSectionLookup = useMemo(
    () => new Map(pricingSectionRecords.map((section) => [String(section.id || ""), section])),
    [pricingSectionRecords]
  );
  const activeQuoteSectionOptions = pricingSectionOptions;
  const quoteScopedSectionOptions = useMemo(() => {
    const optionsByValue = new Map(activeQuoteSectionOptions.map((option) => [String(option.value || ""), option]));
    items.forEach((item) => {
      const value = String(item.section_key || buildPricingSectionRecord(item.section || "General").key || "").trim();
      const label = String(item.section || "").trim() || "General";
      if (!value || optionsByValue.has(value)) {
        return;
      }
      optionsByValue.set(value, {
        value,
        label,
        display_order: Number(item.section_display_order || 999),
      });
    });
    return [...optionsByValue.values()].sort((left, right) => {
      const orderCompare = Number(left.display_order || 999) - Number(right.display_order || 999);
      if (orderCompare !== 0) return orderCompare;
      return String(left.label || "").localeCompare(String(right.label || ""), undefined, { sensitivity: "base" });
    });
  }, [activeQuoteSectionOptions, items]);
  const visibleAttachments = useMemo(
    () => attachments.filter((attachment) => showBackupAttachments || !isBackupAttachmentFile(attachment)),
    [attachments, showBackupAttachments]
  );
  const hasHiddenBackupAttachments = useMemo(
    () => attachments.some((attachment) => isBackupAttachmentFile(attachment)),
    [attachments]
  );
  const attachmentsWithOlderVersions = useMemo(
    () => visibleAttachments.filter((attachment) => Number(attachment.version_count || 1) > 1),
    [visibleAttachments]
  );
  const hasOlderAttachmentVersions = attachmentsWithOlderVersions.length > 0;

  useEffect(() => {
    if (!showOlderAttachmentVersions || attachmentsWithOlderVersions.length === 0) {
      return undefined;
    }

    const attachmentIdsToLoad = attachmentsWithOlderVersions
      .map((attachment) => String(attachment.id || ""))
      .filter((attachmentId) => (
        attachmentId
        && !attachmentVersionsByAttachmentId[attachmentId]
        && attachmentVersionLoadStateById[attachmentId] !== "loading"
      ));

    if (attachmentIdsToLoad.length === 0) {
      return undefined;
    }

    let ignore = false;

    setAttachmentVersionLoadStateById((current) => {
      const next = { ...current };
      attachmentIdsToLoad.forEach((attachmentId) => {
        next[attachmentId] = "loading";
      });
      return next;
    });

    void Promise.all(
      attachmentIdsToLoad.map(async (attachmentId) => {
        try {
          const versions = await crmApi.filesystem.listVersions(attachmentId);
          return {
            attachmentId,
            versions: Array.isArray(versions) ? versions : [],
            error: "",
          };
        } catch (error) {
          return {
            attachmentId,
            versions: [],
            error: error instanceof Error ? error.message : "Failed to load older versions",
          };
        }
      })
    ).then((results) => {
      if (ignore) {
        return;
      }

      setAttachmentVersionsByAttachmentId((current) => {
        const next = { ...current };
        results.forEach(({ attachmentId, versions, error }) => {
          next[attachmentId] = {
            rows: versions,
            error,
          };
        });
        return next;
      });

      setAttachmentVersionLoadStateById((current) => {
        const next = { ...current };
        results.forEach(({ attachmentId, error }) => {
          next[attachmentId] = error ? "error" : "loaded";
        });
        return next;
      });
    });

    return () => {
      ignore = true;
    };
  }, [
    showOlderAttachmentVersions,
    attachmentsWithOlderVersions,
    attachmentVersionsByAttachmentId,
    attachmentVersionLoadStateById,
  ]);

  const openNewCategoryDialog = (target = "edit") => {
    setNewCategoryTarget(target);
    setNewCategoryName("");
    setNewCategoryError("");
    setShowNewCategoryDialog(true);
  };

  const openNewSectionDialog = (target = "edit") => {
    setNewSectionTarget(target);
    setNewSectionName("");
    setNewSectionError("");
    setShowNewSectionDialog(true);
  };

  const handleItemCategoryChange = (value, target = "edit") => {
    if (value === ADD_PRICING_CATEGORY_VALUE) {
      openNewCategoryDialog(target);
      return;
    }
    if (target === "add") {
      setItemForm((current) => ({ ...current, category: value }));
      return;
    }
    setEditItemForm((current) => ({ ...current, category: value }));
  };

  const applySectionSelection = (value, target = "edit") => {
    if (value === ADD_PRICING_SECTION_VALUE) {
      openNewSectionDialog(target);
      return;
    }
    const selectedRecord = pricingSectionRecords.find((section) => String(section.key || section.value || "") === value) || null;
    const selectedOption = pricingSectionOptions.find((section) => String(section.value || "") === value) || null;
    const nextSectionState = {
      section: selectedRecord?.label || selectedRecord?.name || selectedOption?.label || value,
      section_id: selectedRecord?.id || "",
      section_key: selectedRecord?.key || selectedRecord?.value || selectedOption?.value || value,
      section_display_order: Number(selectedRecord?.display_order ?? selectedOption?.display_order ?? 999),
    };
    if (target === "add") {
      setItemForm((current) => ({ ...current, ...nextSectionState }));
      return;
    }
    if (target === "global-confirm") {
      setGlobalInclusionSectionValue(selectedRecord?.key || selectedRecord?.value || selectedOption?.value || value);
      setGlobalInclusionSectionError("");
      return;
    }
    setEditItemForm((current) => ({ ...current, ...nextSectionState }));
  };

  const saveNewQuoteItemCategory = async () => {
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
      if (newCategoryTarget === "add") {
        setItemForm((current) => ({ ...current, category: created.key || payload.key }));
      } else {
        setEditItemForm((current) => ({ ...current, category: created.key || payload.key }));
      }
      setShowNewCategoryDialog(false);
      setNewCategoryName("");
      setNewCategoryError("");
      toast({ title: "Category created", description: `${trimmedName} is now available in quote line items.` });
    } catch (error) {
      setNewCategoryError(error instanceof Error ? error.message : "Category could not be saved.");
    }
  };

  const saveNewQuoteItemSection = async () => {
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
      const nextSectionState = {
        section: created.label || created.name || trimmedName,
        section_id: created.id || "",
        section_key: created.key || payload.key,
        section_display_order: Number(created.display_order ?? payload.display_order ?? 999),
      };
      if (newSectionTarget === "add") {
        setItemForm((current) => ({ ...current, ...nextSectionState }));
      } else if (newSectionTarget === "global-confirm") {
        setGlobalInclusionSectionValue(nextSectionState.section_key);
        setGlobalInclusionSectionError("");
      } else {
        setEditItemForm((current) => ({ ...current, ...nextSectionState }));
      }
      setShowNewSectionDialog(false);
      setNewSectionName("");
      setNewSectionError("");
      toast({ title: "Section created", description: `${trimmedName} is now available in quote line items.` });
    } catch (error) {
      setNewSectionError(error instanceof Error ? error.message : "Section could not be saved.");
    }
  };

  const addItem = async () => {
    if (!ensureQuoteEditAllowed()) return;
    const total = itemForm.unit_cost * itemForm.quantity * (1 + itemForm.markup_percent / 100);
    const selectedSection = pricingSectionRecords.find((section) => String(section.key || section.value || "") === String(itemForm.section_key || "general")) || null;
    const selectedSectionOption = pricingSectionOptions.find((section) => String(section.value || "") === String(itemForm.section_key || "general")) || null;
    await crmApi.entities.QuoteItem.create({
      ...itemForm,
      section: selectedSection?.label || selectedSection?.name || selectedSectionOption?.label || itemForm.section || "General",
      section_id: selectedSection?.id || itemForm.section_id || "",
      section_key: selectedSection?.key || selectedSection?.value || selectedSectionOption?.value || itemForm.section_key || "general",
      section_display_order: Number(selectedSection?.display_order ?? selectedSectionOption?.display_order ?? itemForm.section_display_order ?? 999),
      total,
      quote_id: id,
      sort_order: items.length,
    });
    const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
    await recalc(updated, { changeType: "line_item_create", summary: "Line item added after approval" });
    await loadData();
    setShowItem(false);
    setItemForm({ description: "", category: "materials", quantity: 1, unit: "ea", unit_cost: 0, markup_percent: 30, section: "General", section_id: "", section_key: "general", section_display_order: 999, is_optional: false, is_price_locked: false });
  };

  const openEditItem = (item) => {
    setEditingItem(item);
    setEditItemSaveAsDefault(false);
    setEditItemForm({
      description: item.description || "",
      category: item.category || "materials",
      quantity: Number(item.quantity || 1),
      unit: item.unit || "ea",
      unit_cost: Number(item.unit_cost || 0),
      markup_percent: Number(item.markup_percent || 0),
      section: item.section || "General",
      section_id: item.section_id || "",
      section_key: item.section_key || "",
      section_display_order: Number(item.section_display_order || 999),
      is_optional: Boolean(item.is_optional),
      is_price_locked: item.is_price_locked === true,
    });
  };

  const openSaveDefaultsDialog = (item) => {
    setSaveDefaultsItem(item);
    setSaveDefaultsFields({ price: true, category: true, section: true });
  };

  const closeSaveDefaultsDialog = () => {
    setSaveDefaultsItem(null);
    setSaveDefaultsFields({ price: true, category: true, section: true });
  };

  const saveQuoteListItemAsDefault = async () => {
    if (!saveDefaultsItem) return;
    const selectedCount = Object.values(saveDefaultsFields).filter(Boolean).length;
    if (selectedCount === 0) {
      toast({
        title: "Choose at least one default",
        description: "Select price, category, or section before saving defaults.",
        variant: "destructive",
      });
      return;
    }

    const matchedSectionRecord = String(saveDefaultsItem.section_id || "").trim()
      ? pricingSectionLookup.get(String(saveDefaultsItem.section_id || "").trim()) || null
      : pricingSectionRecords.find((section) => String(section.key || section.value || "") === String(saveDefaultsItem.section_key || "").trim()) || null;
    const sectionFallback = buildPricingSectionRecord(saveDefaultsItem.section || "General");
    const fields = {
      ...(saveDefaultsFields.price ? {
        buy_price: Number(saveDefaultsItem.unit_cost || 0),
        markup_percent: Number(saveDefaultsItem.markup_percent || 0),
        default_markup: Number(saveDefaultsItem.markup_percent || 0),
        unit: saveDefaultsItem.unit || "ea",
      } : {}),
      ...(saveDefaultsFields.category ? {
        category: saveDefaultsItem.category || "materials",
      } : {}),
      ...(saveDefaultsFields.section ? {
        section: matchedSectionRecord?.label || matchedSectionRecord?.name || saveDefaultsItem.section || "General",
        section_id: matchedSectionRecord?.id || saveDefaultsItem.section_id || "",
        section_key: matchedSectionRecord?.key || matchedSectionRecord?.value || saveDefaultsItem.section_key || sectionFallback.key,
        section_display_order: Number(
          matchedSectionRecord?.display_order
          ?? saveDefaultsItem.section_display_order
          ?? 999
        ),
      } : {}),
    };

    setSavingDefaults(true);
    try {
      await crmApi.pricing.saveItemDefaults({
        source_quote_id: id,
        items: [{
          pricing_item_id: saveDefaultsItem.pricing_item_id || "",
          match_name: saveDefaultsItem.description || "Quote line item",
          fields: {
            ...fields,
            supplier: saveDefaultsItem.supplier || "",
            product_number: saveDefaultsItem.product_number || saveDefaultsItem.source_item_code || "",
            supplier_sku: saveDefaultsItem.product_number || saveDefaultsItem.source_item_code || "",
            original_sku: saveDefaultsItem.product_number || saveDefaultsItem.source_item_code || "",
          },
        }],
      });
      await loadData();
      toast({
        title: "Defaults saved",
        description: "Future imports of this item will use the selected defaults.",
      });
    } finally {
      setSavingDefaults(false);
    }
    closeSaveDefaultsDialog();
  };

  const updateItem = async () => {
    if (!editingItem) return;
    if (!ensureQuoteEditAllowed()) return;
    const quantity = Number(editItemForm.quantity || 1);
    const unitCost = Number(editItemForm.unit_cost || 0);
    const markupPercent = Number(editItemForm.markup_percent || 0);
    const total = Math.round(unitCost * quantity * (1 + markupPercent / 100) * 100) / 100;
    const selectedSection = pricingSectionRecords.find((section) => String(section.key || section.value || "") === String(editItemForm.section_key || "general")) || null;
    const selectedSectionOption = quoteScopedSectionOptions.find((section) => String(section.value || "") === String(editItemForm.section_key || "general")) || null;
    const nextSection = selectedSection?.label || selectedSection?.name || selectedSectionOption?.label || editItemForm.section || "General";
    const nextSectionId = selectedSection?.id || editItemForm.section_id || "";
    const nextSectionKey = selectedSection?.key || selectedSection?.value || selectedSectionOption?.value || editItemForm.section_key || "general";
    const nextSectionDisplayOrder = Number(selectedSection?.display_order ?? selectedSectionOption?.display_order ?? editItemForm.section_display_order ?? 999);
    await crmApi.entities.QuoteItem.update(editingItem.id, {
      ...editItemForm,
      section: nextSection,
      section_id: nextSectionId,
      section_key: nextSectionKey,
      section_display_order: nextSectionDisplayOrder,
      quantity,
      unit_cost: unitCost,
      markup_percent: markupPercent,
      total,
    });
    if (editItemSaveAsDefault) {
      await crmApi.pricing.saveItemDefaults({
        source_quote_id: id,
        items: [{
          pricing_item_id: editingItem.pricing_item_id || "",
          match_name: editingItem.description || editItemForm.description || "Quote line item",
          fields: {
            description: editItemForm.description || editingItem.description || "",
            category: editItemForm.category || editingItem.category || "materials",
            buy_price: unitCost,
            markup_percent: markupPercent,
            default_markup: markupPercent,
            unit: editItemForm.unit || editingItem.unit || "ea",
            supplier: editingItem.supplier || "",
            product_number: editingItem.product_number || editingItem.source_item_code || "",
            supplier_sku: editingItem.product_number || editingItem.source_item_code || "",
            original_sku: editingItem.product_number || editingItem.source_item_code || "",
            section: nextSection,
            section_id: nextSectionId,
            section_key: nextSectionKey,
            section_display_order: nextSectionDisplayOrder,
          },
        }],
      });
    }
    const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
    await recalc(updated, { changeType: "line_item_update", summary: "Line item changed after approval" });
    await loadData();
    if (editItemSaveAsDefault) {
      toast({
        title: "Line item updated",
        description: "Quote line item updated and saved as the new default for future imports.",
      });
    }
    setEditItemSaveAsDefault(false);
    setEditingItem(null);
  };

  const toggleItemPriceLock = async (item) => {
    if (!ensureQuoteEditAllowed()) return;
    const nextLocked = item.is_price_locked !== true;
    await crmApi.entities.QuoteItem.update(item.id, {
      is_price_locked: nextLocked,
      is_manual_override: nextLocked ? true : item.is_manual_override === true,
    });
    const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
    setItems(updated.sort((left, right) => (left.sort_order || 0) - (right.sort_order || 0)));
    await patchQuote({}, {
      trackRevision: true,
      nextItems: updated,
      changeType: "line_item_lock_change",
      summary: nextLocked ? "Line item price locked after approval" : "Line item price unlocked after approval",
    });
    toast({
      title: nextLocked ? "Line item locked" : "Line item unlocked",
      description: nextLocked ? "Margin card adjustments will skip this line item." : "This line item can now be adjusted by the margin cards.",
    });
  };

  const openMarginAdjustmentDialog = (mode) => {
    const targetValue = mode === "gross" ? grossMarginTarget : materialMarginTarget;
    const targetMarginPercent = Number(targetValue || 0);
    if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 95) {
      toast({
        title: "Choose a valid target margin",
        description: "Enter a target margin between 0% and 95%.",
        variant: "destructive",
      });
      return;
    }
    const preview = buildQuoteMarginAdjustmentPreview(items, {
      mode,
      targetMarginPercent,
      includeLocked: false,
    });
    if (!preview.eligibleItems.length) {
      toast({
        title: "No eligible line items",
        description: "There are no active quote line items available for this margin adjustment.",
        variant: "destructive",
      });
      return;
    }
    setIncludeLockedMarginItems(false);
    setPendingMarginAdjustment({
      mode,
      targetMarginPercent,
    });
  };

  const marginAdjustmentPreview = useMemo(() => {
    if (!pendingMarginAdjustment) {
      return null;
    }
    return buildQuoteMarginAdjustmentPreview(items, {
      mode: pendingMarginAdjustment.mode,
      targetMarginPercent: pendingMarginAdjustment.targetMarginPercent,
      includeLocked: includeLockedMarginItems,
    });
  }, [includeLockedMarginItems, items, pendingMarginAdjustment]);

  const applyMarginAdjustment = async () => {
    if (!pendingMarginAdjustment || !marginAdjustmentPreview?.eligibleItems.length) {
      return;
    }
    if (!ensureQuoteEditAllowed()) return;
    setApplyingMarginAdjustment(true);
    try {
      const result = await crmApi.pricing.adjustQuoteMargins(id, {
        action_type: pendingMarginAdjustment.mode === "gross" ? "gross_margin_adjustment" : "material_margin_adjustment",
        target_margin_percent: pendingMarginAdjustment.targetMarginPercent,
        include_locked: includeLockedMarginItems,
      });
      if (result?.quote) {
        const revisionPatch = buildRevisionPatchForApprovedChange(
          "margin_adjustment",
          `${pendingMarginAdjustment.mode === "gross" ? "Gross" : "Material"} margin adjusted after approval`,
          Array.isArray(result?.items) ? result.items : items
        );
        if (Object.keys(revisionPatch).length > 0) {
          await crmApi.entities.Quote.update(id, revisionPatch);
        }
        setQuote({ ...result.quote, ...revisionPatch });
        setQForm({ ...result.quote, ...revisionPatch });
      }
      if (Array.isArray(result?.items)) {
        setItems(result.items);
      } else {
        await loadData();
      }
      setPendingMarginAdjustment(null);
      setIncludeLockedMarginItems(false);
      toast({
        title: "Quote margin updated",
        description: marginAdjustmentPreview.lockedItems.length > 0 && !includeLockedMarginItems
          ? "Some line items were locked and were not adjusted."
          : "Quote line items were updated to the selected target margin.",
      });
    } catch (error) {
      toast({
        title: "Could not update quote margin",
        description: error instanceof Error ? error.message : "Margin adjustment failed.",
        variant: "destructive",
      });
    } finally {
      setApplyingMarginAdjustment(false);
    }
  };

  const confirmGlobalInclusion = async (itemId) => {
    const targetItem = items.find((item) => item.id === itemId) || null;
    setPendingGlobalInclusionConfirm({ mode: "single", itemId });
    setGlobalInclusionSectionValue(getPreferredQuoteSectionValue(activeQuoteSectionOptions, targetItem));
    setGlobalInclusionSectionError("");
    setShowGlobalInclusionSectionDialog(true);
  };

  const confirmTriggeredInclusion = async (itemId) => {
    await crmApi.pricing.confirmTriggeredInclusion(id, itemId);
    await loadData();
  };

  const confirmAllGlobalInclusions = async () => {
    const targetItem = items.find((item) => item.source === "global_auto_inclusion" && item.review_status === "auto_added_needs_review") || null;
    setPendingGlobalInclusionConfirm({ mode: "all", itemId: "" });
    setGlobalInclusionSectionValue(getPreferredQuoteSectionValue(activeQuoteSectionOptions, targetItem));
    setGlobalInclusionSectionError("");
    setShowGlobalInclusionSectionDialog(true);
  };

  const submitGlobalInclusionSectionConfirmation = async () => {
    if (!globalInclusionSectionValue) {
      setGlobalInclusionSectionError("Choose a section before confirming.");
      return;
    }
    const selectedSection = pricingSectionRecords.find((section) => String(section.key || section.value || "") === globalInclusionSectionValue) || null;
    const selectedSectionOption = pricingSectionOptions.find((section) => String(section.value || "") === globalInclusionSectionValue) || null;
    const payload = {
      section: selectedSection?.label || selectedSection?.name || selectedSectionOption?.label || "General",
      section_id: selectedSection?.id || "",
      section_key: selectedSection?.key || selectedSection?.value || selectedSectionOption?.value || globalInclusionSectionValue,
      section_display_order: Number(selectedSection?.display_order ?? selectedSectionOption?.display_order ?? 999),
    };
    try {
      if (pendingGlobalInclusionConfirm.mode === "all") {
        await crmApi.pricing.confirmAllGlobalInclusions(id, payload);
      } else if (pendingGlobalInclusionConfirm.itemId) {
        await crmApi.pricing.confirmGlobalInclusion(id, pendingGlobalInclusionConfirm.itemId, payload);
      }
      setShowGlobalInclusionSectionDialog(false);
      setPendingGlobalInclusionConfirm({ mode: "single", itemId: "" });
      setGlobalInclusionSectionError("");
      await loadData();
    } catch (error) {
      setGlobalInclusionSectionError(error instanceof Error ? error.message : "Could not confirm the inclusion.");
    }
  };

  const deleteItem = async (itemId) => {
    if (!ensureQuoteEditAllowed()) return;
    const confirmed = window.confirm("Remove this line from the quote? The quote will be recalculated after it is removed.");
    if (!confirmed) return;
    await crmApi.entities.QuoteItem.delete(itemId);
    const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
    await recalc(updated, { changeType: "line_item_delete", summary: "Line item removed after approval" });
    await loadData();
    toast({ title: "Line item removed", description: "The quote total has been recalculated." });
  };

  const convertToJob = async (manualJobNumber) => {
    const existingJobs = await crmApi.entities.Job.list();
    const nextJobNumber = String(manualJobNumber || "").trim();

    if (!nextJobNumber) {
      throw new Error("Job number is required");
    }

    if (existingJobs.some((job) => String(job.job_number || "").toLowerCase() === nextJobNumber.toLowerCase())) {
      throw new Error("That job number already exists");
    }

    const job = await crmApi.quotes.convertToJob(id, { job_number: nextJobNumber });
    navigate(`/jobs/${job.id}`);
  };

  const updateQuoteStatus = async (status) => {
    await patchQuote({ status });
  };

  const archiveQuote = async () => {
    if (!window.confirm("Archive this quote? It will be hidden from active quote lists, but it can be restored later.")) return;
    await patchQuote({
      status: "archived",
      archived_at: new Date().toISOString(),
    });
    toast({
      title: "Quote archived",
      description: "The quote is safely stored and can be restored from this page.",
    });
  };

  const restoreQuote = async () => {
    await patchQuote({
      status: "draft",
      archived_at: "",
    });
    toast({
      title: "Quote restored",
      description: "The quote is back in the active workflow.",
    });
  };

  const markQuoteSent = async () => {
    await patchQuote({ status: "awaiting_confirmation", sent_at: quote.sent_at || new Date().toISOString() });
    toast({
      title: "Quote marked as sent",
      description: "It now appears as awaiting client confirmation.",
    });
  };

  const saveQuote = async () => {
    if (!ensureQuoteEditAllowed()) return;
    const selectedContact = contacts.find((contact) => contact.id === qForm.contact_id) || null;
    await updateQuoteWithRevision({
      ...qForm,
      title: String(qForm.title || "").trim(),
      contact_id: selectedContact?.id || "",
      contact_name: selectedContact ? getContactDisplayName(selectedContact) : String(qForm.contact_name || "").trim(),
      company_id: selectedContact?.company_id || "",
      company_name: selectedContact?.company_name || String(qForm.company_name || "").trim(),
    }, {
      trackRevision: true,
      changeType: "quote_details_update",
      summary: "Quote details changed after approval",
    });
    setEditingQuote(false);
    await loadData();
  };

  const openQuoteEditDialog = () => {
    if (!ensureQuoteEditAllowed()) return;
    setEditingQuote(true);
  };

  const handleOpenConvert = async () => {
    const jobRecords = await crmApi.entities.Job.list();
    setJobNumber(buildSuggestedJobNumber(quote, jobRecords));
    setJobNumberError("");
    setShowWinDialog(true);
  };

  const handleStatusChange = async (nextStatus) => {
    const currentStatus = normalizeQuoteStatus(quote.status);

    if (nextStatus === currentStatus) {
      return;
    }

    if (nextStatus === "won") {
      await handleOpenConvert();
      return;
    }

    await updateQuoteStatus(nextStatus);
  };

  const handleConfirmWon = async () => {
    try {
      setJobNumberError("");
      await convertToJob(jobNumber);
    } catch (error) {
      setJobNumberError(error instanceof Error ? error.message : "Failed to convert quote to job");
    }
  };

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        await crmApi.filesystem.create({
          related_id: id,
          related_type: "quote",
          name: file.name,
          mime_type: file.type || "application/octet-stream",
          size: file.size,
          data_base64: dataUrl,
          document_information: "",
        });
      }

      await loadData();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      setUploading(false);
      setDragActive(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const saveSiteMeasure = async (payload, existingMeasure = null) => {
    if (existingMeasure?.id) {
      await crmApi.entities.SiteMeasure.update(existingMeasure.id, payload);
    } else {
      await crmApi.entities.SiteMeasure.create(payload);
    }
    await loadData();
  };

  const uploadSiteMeasureFile = async ({ file, file_base64, measure, form }) => {
    const siteMeasure = measure?.id
      ? measure
      : await crmApi.entities.SiteMeasure.create({
        ...form,
        quote_id: id,
        quote_number: quote.quote_number || "",
        status: "draft",
      });
    const attachment = await crmApi.filesystem.create({
      related_id: id,
      related_type: "quote",
      name: file.name,
      mime_type: file.type || "application/octet-stream",
      size: file.size,
      data_base64: file_base64,
      document_information: `Site measure file for ${quote.quote_number || quote.title || "quote"}`,
    });
    await crmApi.entities.Attachment.update(attachment.id, {
      source: "site-measure",
      file_source: "Site Measure",
      site_measure_id: siteMeasure.id,
      document_information: attachment.document_information || `Site measure file for ${quote.quote_number || quote.title || "quote"}`,
    });
    await loadData();
  };

  const readPricingImportFile = async (file) => {
    if (!file) return;
    setPricingImportError("");
    setPricingImportNotice("");
    if (!/\.csv$|\.xlsx$|\.pdf$/i.test(file.name)) {
      setPricingImportStatus("Import failed");
      setPricingImportError("Upload a PDF, CSV, or XLSX file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setPricingImportStatus("Import failed");
      setPricingImportError("Uploads are limited to 25MB.");
      return;
    }
    setPricingImportStatus("Uploading");
    const dataUrl = await readFileAsDataUrl(file);
    const text = file.name.toLowerCase().endsWith(".csv") ? await file.text().catch(() => "") : "";
    setPricingImportFile({
      name: file.name,
      size: file.size,
      type: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
      file_base64: String(dataUrl).split(",")[1] || "",
      row_count: text ? Math.max(0, text.split(/\r?\n/).filter(Boolean).length - 1) : 0,
    });
    setPricingImportStatus(file.name.toLowerCase().endsWith(".pdf") ? "Ready to extract" : "Ready for mapping");
  };

  const importQuotePricingFile = async () => {
    if (!pricingImportFile) return;
    try {
      setPricingImportStatus("Parsing");
      const result = await crmApi.pricing.stageQuoteImport({
        quote_id: id,
        job_name: quote.title || quote.quote_number || "",
        file_name: pricingImportFile.name,
        file_type: pricingImportFile.type,
        file_base64: pricingImportFile.file_base64,
      });
      setPricingImportStatus("Ready for review");
      if (result?.attachment) setPricingImportNotice("File added to Quote Files.");
      setPricingImportFile(null);
      await loadData();
    } catch (error) {
      setPricingImportStatus("Import failed");
      setPricingImportError(error instanceof Error ? error.message : "Pricing import failed.");
    }
  };

  const updateAttachmentDocumentInformation = async (attachment, documentInformation) => {
    await crmApi.entities.Attachment.update(attachment.id, { document_information: documentInformation });
    await loadData();
    setPreviewAttachment((current) => current?.id === attachment.id ? { ...current, document_information: documentInformation } : current);
  };

  const getAttachmentSourceLabel = (attachment) => {
    if (attachment.file_source) return attachment.file_source;
    if (attachment.source === "pricing-import") return "Pricing Import";
    return "Manual Upload";
  };

  const pricingImportHasUnsyncedRows = (importId, rows) => {
    if (dirtyPricingImportIds.has(importId)) return true;
    const quoteItemsByRowId = new Map(items.filter((item) => item.import_id === importId).map((item) => [item.pricing_quote_item_id, item]));
    return rows.some((row) => {
      const quoteItem = quoteItemsByRowId.get(row.id);
      if (!quoteItem) return false;
      const quantity = Number(row.quantity || 0);
      const buyPrice = Number(row.buy_price || 0);
      const markup = Number(row.markup_percent || 0);
      const sellPrice = Math.round((Number(row.sell_price || 0) || buyPrice * (1 + markup / 100)) * 100) / 100;
      const total = Math.round(sellPrice * quantity * 100) / 100;
      const reviewState = String(row.review_state || row.status || "active");
      return String(quoteItem.description || "") !== String(row.description || row.name || "")
        || String(quoteItem.category || "") !== String(row.category || "materials")
        || Number(quoteItem.quantity || 0) !== quantity
        || String(quoteItem.unit || "") !== String(row.unit || "ea")
        || Number(quoteItem.unit_cost || 0) !== buyPrice
        || Number(quoteItem.markup_percent || 0) !== markup
        || Number(quoteItem.sell_price || 0) !== sellPrice
        || Number(quoteItem.total || 0) !== total
        || String(quoteItem.gst_treatment || "unknown") !== String(row.gst_treatment || "unknown")
        || Boolean(quoteItem.is_optional) !== ["excluded", "deleted"].includes(reviewState);
    });
  };

  const updatePricingReviewRow = async (row, patch) => {
    const nextPatch = { ...patch };
    if (["quantity", "buy_price", "markup_percent"].some((field) => Object.prototype.hasOwnProperty.call(nextPatch, field))) {
      const quantity = Number(nextPatch.quantity ?? row.quantity ?? 1);
      const buyPrice = Number(nextPatch.buy_price ?? row.buy_price ?? 0);
      const markup = Number(nextPatch.markup_percent ?? row.markup_percent ?? 30);
      nextPatch.sell_price = Math.round(buyPrice * (1 + markup / 100) * 100) / 100;
      nextPatch.total_buy_price = Math.round(buyPrice * quantity * 100) / 100;
      nextPatch.total_sell_price = Math.round(nextPatch.sell_price * quantity * 100) / 100;
    }
    await crmApi.entities.PricingQuoteItem.update(row.id, nextPatch);
    if (row.import_id) {
      setDirtyPricingImportIds((current) => new Set([...current, row.import_id]));
    }
    await loadData();
  };

  const updatePricingImportMetadata = async (importRecord, patch) => {
    const metadata = { ...(importRecord.metadata || {}), ...patch };
    await crmApi.entities.QuoteImport.update(importRecord.id, { metadata });
    await loadData();
  };

  const commitPricingImport = async (importId, options = {}) => {
    const replaceExisting = Boolean(options.replaceExisting);
    const forceDestructiveReplace = Boolean(options.forceDestructiveReplace);
    if (!ensureQuoteEditAllowed()) return;
    setPricingImportError("");
    try {
      await crmApi.pricing.commitQuoteImport(importId, {
        replace_existing_imported: replaceExisting,
        force_destructive_replace: forceDestructiveReplace,
      });
      setPricingImportStatus("Complete");
      setPricingImportNotice(replaceExisting ? "Imported rows replaced the previous imported quote lines." : "Reviewed rows added to the quote.");
      setDirtyPricingImportIds((current) => {
        const next = new Set(current);
        next.delete(importId);
        return next;
      });
      const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
      await recalc(updated, {
        changeType: "pricing_import_confirmed",
        summary: replaceExisting ? "Imported pricing replaced quote lines after approval" : "Imported pricing added after approval",
      });
      await loadData();
      setActiveQuoteTab("quote-list");
    } catch (error) {
      setPricingImportError(error instanceof Error ? error.message : "Failed to add imported items to the quote.");
    }
  };

  const updateImportedLineItems = async (importId) => {
    if (!ensureQuoteEditAllowed()) return;
    setPricingImportError("");
    try {
      await crmApi.pricing.updateQuoteImportLineItems(importId);
      setPricingImportNotice("Imported line items updated. Review the quote list before sending.");
      setDirtyPricingImportIds((current) => {
        const next = new Set(current);
        next.delete(importId);
        return next;
      });
      const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
      await recalc(updated, {
        changeType: "pricing_import_update",
        summary: "Imported pricing updated quote lines after approval",
      });
      await loadData();
    } catch (error) {
      setPricingImportError(error instanceof Error ? error.message : "Failed to update imported line items.");
    }
  };

  const deletePricingImport = async (importId) => {
    if (!ensureQuoteEditAllowed()) return;
    const confirmed = window.confirm("Remove this import from the quote? Imported line items from this file will be removed, but the original file can be uploaded again.");
    if (!confirmed) return;
    setPricingImportError("");
    try {
      await crmApi.pricing.deleteQuoteImport(importId);
      setPricingImportNotice("Import removed. You can upload the file again if needed.");
      setDirtyPricingImportIds((current) => {
        const next = new Set(current);
        next.delete(importId);
        return next;
      });
      const updated = await crmApi.entities.QuoteItem.filter({ quote_id: id });
      await recalc(updated, {
        changeType: "pricing_import_removed",
        summary: "Imported pricing removed after approval",
      });
      await loadData();
    } catch (error) {
      setPricingImportError(error instanceof Error ? error.message : "Failed to delete pricing import.");
    }
  };

  const savePricingRowAsDefault = async (row) => {
    await crmApi.pricing.saveItemDefaults({
      source_quote_id: id,
      source_import_id: row.import_id || "",
      items: [{
        match_name: row.description || row.name || row.original_sku || "Imported supplier item",
        fields: {
          category: row.category || "materials",
          description: row.description || row.name || "",
          buy_price: Number(row.buy_price || 0),
          markup_percent: Number(row.markup_percent || 30),
          default_markup: Number(row.markup_percent || 30),
          unit: row.unit || "ea",
          supplier: row.supplier || "",
          product_number: row.original_sku || row.product_number || "",
          supplier_sku: row.original_sku || row.product_number || "",
          original_sku: row.original_sku || row.product_number || "",
        },
      }],
    });
    await loadData();
    setPricingImportNotice("Pricing default saved. Future imports of this item will need less checking.");
  };

  const splitPricingReviewRow = async (row) => {
    const quantity = Math.max(1, Number(row.quantity || 1));
    const firstQuantity = Math.max(1, Math.floor(quantity / 2));
    const secondQuantity = Math.max(1, quantity - firstQuantity);
    await crmApi.entities.PricingQuoteItem.update(row.id, {
      quantity: firstQuantity,
      total_buy_price: Math.round(Number(row.buy_price || 0) * firstQuantity * 100) / 100,
      total_sell_price: Math.round(Number(row.sell_price || 0) * firstQuantity * 100) / 100,
    });
    await crmApi.entities.PricingQuoteItem.create({
      ...row,
      id: undefined,
      quantity: secondQuantity,
      total_buy_price: Math.round(Number(row.buy_price || 0) * secondQuantity * 100) / 100,
      total_sell_price: Math.round(Number(row.sell_price || 0) * secondQuantity * 100) / 100,
      notes: `${row.notes || ""} Split from imported row ${row.id}`.trim(),
    });
    if (row.import_id) {
      setDirtyPricingImportIds((current) => new Set([...current, row.import_id]));
    }
    await loadData();
  };

  const mergePricingImportDuplicates = async (rows) => {
    const groups = new Map();
    rows.filter((row) => !["excluded", "deleted", "committed"].includes(String(row.review_state || row.status || ""))).forEach((row) => {
      const key = String(row.original_sku || row.description || row.name || "").toLowerCase();
      if (!key) return;
      groups.set(key, [...(groups.get(key) || []), row]);
    });
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const [first, ...rest] = group;
      const quantity = group.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
      await updatePricingReviewRow(first, { quantity });
      await Promise.all(rest.map((row) => crmApi.entities.PricingQuoteItem.update(row.id, { review_state: "deleted", status: "deleted" })));
      if (first.import_id) {
        setDirtyPricingImportIds((current) => new Set([...current, first.import_id]));
      }
    }
    await loadData();
  };

  const assignWorkflowTask = async (task, staffId) => {
    const staff = staffRecords.find((record) => record.id === staffId);
    const previousTasks = workflowTasks;
    const patch = {
      assigned_staff_ids: staffId ? [staffId] : [],
      assigned_to: staff?.name || "",
      is_unassigned_placeholder: !staffId,
    };
    setWorkflowTasks((current) => current.map((row) => row.id === task.id ? { ...row, ...patch } : row));
    try {
      await crmApi.entities.JobOperation.update(task.id, patch);
      setAssigningTaskId("");
    } catch (error) {
      setWorkflowTasks(previousTasks);
      setUploadError(error instanceof Error ? error.message : "Failed to assign workflow task.");
    }
  };

  const toggleWorkflowTaskDone = async (task) => {
    const previousTasks = workflowTasks;
    const nextStatus = isWorkflowTaskComplete(task) ? "pending" : "complete";
    const optimisticTask = {
      ...task,
      status: nextStatus,
      actual_completion_date: nextStatus === "complete"
        ? task.actual_completion_date || formatDateForInput(new Date())
        : "",
    };
    setWorkflowTasks((current) => current.map((row) => (row.id === task.id ? optimisticTask : row)));
    try {
      await crmApi.entities.JobOperation.update(task.id, { status: nextStatus });
      toast({
        title: nextStatus === "complete" ? "Workflow task marked done" : "Workflow task reopened",
      });
      await loadData();
    } catch (error) {
      setWorkflowTasks(previousTasks);
      setUploadError(error instanceof Error ? error.message : "Failed to update workflow task.");
    }
  };

  const toggleQuoteChecklist = async (field, checked) => {
    await patchQuote({ [field]: checked });
  };

  const saveQuoteNotes = async (patch) => {
    await patchQuote(patch);
  };

  const openDocumentGenerator = async (documentType = "contract") => {
    setGeneratingDocument(true);
    setGeneratedDocumentAttachment(null);
    try {
      const result = await crmApi.quotes.getDocumentDraft(id, documentType);
      const templates = await crmApi.documentTemplates.list({ type: documentType });
      const defaultTemplate = templates.find((template) => template.is_default) || templates[0] || result.template;
      setDocumentTemplates(templates);
      setSelectedDocumentTemplateId(defaultTemplate?.id || result.template?.id || "");
      setQuoteDocument(result.document);
      setQuoteDocumentPreviewHtml(result.html || "");
      setQuoteDocumentWarnings(Array.isArray(result.warnings) ? result.warnings : []);
      setQuoteDocumentErrors(Array.isArray(result.errors) ? result.errors : []);
      setShowDocumentGenerator(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to prepare document generator.");
    } finally {
      setGeneratingDocument(false);
    }
  };

  const updateQuoteDocument = (patch) => {
    setQuoteDocument((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "totalIncGst")) {
        const total = Number(next.totalIncGst || 0);
        const subtotal = Math.round((total / 1.15) * 100) / 100;
        next.subtotalExGst = subtotal;
        next.gstAmount = Math.round((total - subtotal) * 100) / 100;
        if (!Number(current.depositAmount || 0) && !Number(current.balanceDue || 0)) {
          next.depositAmount = Math.round(total * 50) / 100;
          next.balanceDue = Math.round((total - next.depositAmount) * 100) / 100;
        }
      }
      return next;
    });
  };

  const changeQuoteDocumentType = async (documentType) => {
    updateQuoteDocument({ documentType });
    try {
      const templates = await crmApi.documentTemplates.list({ type: documentType });
      setDocumentTemplates(templates);
      const defaultTemplate = templates.find((template) => template.is_default) || templates[0];
      setSelectedDocumentTemplateId(defaultTemplate?.id || "");
    } catch {
      setDocumentTemplates([]);
      setSelectedDocumentTemplateId("");
    }
  };

  const toggleDocumentEditorSection = (sectionKey) => {
    setDocumentEditorSections((current) => ({
      ...current,
      [sectionKey]: !(current?.[sectionKey] ?? true),
    }));
  };

  const applyQuoteDocumentPreviewResult = (result) => {
    setQuoteDocument(result.document);
    setQuoteDocumentPreviewHtml(result.html || "");
    setQuoteDocumentWarnings(Array.isArray(result.warnings) ? result.warnings : []);
    setQuoteDocumentErrors(Array.isArray(result.errors) ? result.errors : []);
    return result;
  };

  const fetchQuoteDocumentPreview = async () => {
    const result = await crmApi.quotes.previewDocument(id, {
      document: quoteDocument,
      template_id: selectedDocumentTemplateId || undefined,
    });
    return applyQuoteDocumentPreviewResult(result);
  };

  const previewQuoteDocument = async () => {
    if (!quoteDocument) return;
    setGeneratingDocument(true);
    try {
      await fetchQuoteDocumentPreview();
    } catch (error) {
      setQuoteDocumentErrors([error instanceof Error ? error.message : "Document preview failed."]);
    } finally {
      setGeneratingDocument(false);
    }
  };

  const printHtmlDocument = (printableHtml, frameTitle = "Document print frame") => {
    if (!printableHtml) {
      throw new Error("Print preview is not available yet.");
    }
    const printFrame = document.createElement("iframe");
    printFrame.setAttribute("title", frameTitle);
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.style.opacity = "0";
    const cleanup = () => {
      window.setTimeout(() => {
        if (printFrame.parentNode) {
          printFrame.parentNode.removeChild(printFrame);
        }
      }, 500);
    };
    printFrame.addEventListener("load", () => {
      const frameWindow = printFrame.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }
      const handleAfterPrint = () => {
        frameWindow.removeEventListener("afterprint", handleAfterPrint);
        cleanup();
      };
      frameWindow.addEventListener("afterprint", handleAfterPrint);
      window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } finally {
          window.setTimeout(cleanup, 1500);
        }
      }, 120);
    }, { once: true });
    document.body.appendChild(printFrame);
    printFrame.srcdoc = enhancePrintableDocumentHtml(printableHtml);
  };

  const printQuoteDocument = async () => {
    if (!quoteDocument) return;
    setGeneratingDocument(true);
    try {
      const result = await fetchQuoteDocumentPreview();
      const printableHtml = result.html || quoteDocumentPreviewHtml;
      if (!printableHtml) {
        throw new Error("Print preview is not available yet.");
      }
      printHtmlDocument(printableHtml, "Quote document print frame");
    } catch (error) {
      setQuoteDocumentErrors([error instanceof Error ? error.message : "Document print failed."]);
    } finally {
      setGeneratingDocument(false);
    }
  };

  const printQuoteList = async () => {
    setGeneratingDocument(true);
    try {
      const draft = await crmApi.quotes.getDocumentDraft(id, "quote_list");
      const templates = await crmApi.documentTemplates.list({ type: "quote_list" });
      const selectedTemplate = templates.find((template) => template.is_default || String(template.name || "").trim().toLowerCase() === "quote list")
        || draft.template
        || templates[0];
      if (!selectedTemplate?.id) {
        throw new Error("Quote List template could not be found.");
      }
      const preview = await crmApi.quotes.previewDocument(id, {
        document_type: "quote_list",
        template_id: selectedTemplate.id,
        document: draft.document,
      });
      const printableHtml = preview.html || draft.html || "";
      if (!printableHtml) {
        throw new Error("Quote List print preview is not available yet.");
      }
      printHtmlDocument(printableHtml, "Quote list print frame");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Quote list print failed.");
    } finally {
      setGeneratingDocument(false);
    }
  };

  const generateQuoteDocument = async () => {
    if (!quoteDocument) return;
    setGeneratingDocument(true);
    try {
      const result = await crmApi.quotes.generateDocument(id, { document: quoteDocument, template_id: selectedDocumentTemplateId || undefined });
      setQuoteDocumentPreviewHtml(result.html || quoteDocumentPreviewHtml);
      setQuoteDocumentWarnings(Array.isArray(result.warnings) ? result.warnings : []);
      setGeneratedDocumentAttachment(result.attachment || null);
      await loadData();
      toast({
        title: "Document generated",
        description: "The PDF has been saved in Quote Files and is ready to send or print.",
      });
    } catch (error) {
      setQuoteDocumentErrors([error instanceof Error ? error.message : "Document generation failed."]);
    } finally {
      setGeneratingDocument(false);
    }
  };

  const addQuoteChangeOrder = async (values) => {
    const nextChangeOrders = [...(Array.isArray(quote.change_orders) ? quote.change_orders : []), buildChangeOrderEntry(values)];
    await patchQuote({ change_orders: nextChangeOrders });
  };

  const updateQuoteChangeOrderStatus = async (changeOrderId, status) => {
    const nextChangeOrders = (Array.isArray(quote.change_orders) ? quote.change_orders : []).map((entry) =>
      entry.id === changeOrderId ? { ...entry, status } : entry
    );
    await patchQuote({ change_orders: nextChangeOrders });
  };

  const exportQuoteListToExcel = () => {
    const allExportItems = sortedQuoteSections.flatMap((section) =>
      sortedQuoteItems
        .filter((item) => (item.section || "General") === section.label)
        .map((item) => ({ section, item }))
    );
    const headerExcelRow = 7;
    const firstItemExcelRow = headerExcelRow + 1;
    const lastItemExcelRow = firstItemExcelRow + allExportItems.length - 1;
    const totalsHeaderExcelRow = allExportItems.length > 0 ? lastItemExcelRow + 1 : firstItemExcelRow;
    const totalsValueExcelRow = totalsHeaderExcelRow + 1;
    if (clientMode) {
      const rows = [
        ["Client Quote List Export"],
        ["Quote", quote.quote_number || ""],
        ["Title", quote.title || ""],
        ["Client", [quote.contact_name, quote.company_name].filter(Boolean).join(" · ")],
        ["Status", sc.label || ""],
        ["Exported", new Date().toLocaleString("en-NZ")],
        [],
        ["Section", "Description", "Quantity", "Unit", "Total Incl GST", "Status"],
      ];
      const rowStyles = { 8: "header" };
      allExportItems.forEach(({ section, item }) => {
        rows.push([
          section.label,
          item.description || "",
          Number(item.quantity || 0),
          item.unit || "",
          roundMoney(toClientFacingIncGst(item.total || 0, getQuoteItemGstRate(item))),
          item.is_optional ? "Optional" : "Included",
        ]);
      });
      rows.push(["Totals"]);
      rowStyles[rows.length] = "summary";
      rows.push(["", "", "", "Total Incl GST", roundMoney(quote.total || 0), ""]);
      rowStyles[rows.length] = "summary";

      downloadBlob(`${sanitizeExportFilename(quote.quote_number || quote.title || "quote-list")}_client_quote_list.xlsx`, buildXlsxBlob({
        sheetName: "Client Quote List",
        rows,
        rowStyles,
        columnWidths: [18, 46, 12, 12, 18, 16],
      }));
      toast({
        title: "Client-safe export created",
        description: "Internal costs, markups, margins, and supplier fields were excluded.",
      });
      return;
    }

    const rows = [
      ["Quote List Export"],
      ["Quote", quote.quote_number || ""],
      ["Title", quote.title || ""],
      ["Client", [quote.contact_name, quote.company_name].filter(Boolean).join(" · ")],
      ["Status", sc.label || ""],
      ["Exported", new Date().toLocaleString("en-NZ")],
      [],
      [
        "Section",
        "Description",
        "Category",
        "Quantity",
        "Unit",
        "Unit Cost",
        "Markup %",
        "Sell Total Ex GST",
        "GST Treatment",
        "GST Rate %",
        "GST Content",
        "Sell Total Inc GST",
        "Source",
        "Review Status",
      ],
    ];
    const rowStyles = { 8: "header" };

    allExportItems.forEach(({ section, item }, index) => {
        const excelRow = firstItemExcelRow + index;
        const sellTotalExGst = roundMoney(item.total || 0);
        const gstRate = getQuoteItemGstRate(item);
        const gstContent = roundMoney(sellTotalExGst * gstRate);
        const sellTotalIncGst = roundMoney(sellTotalExGst + gstContent);
        rows.push([
          section.label,
          item.description || "",
          item.category || "",
          Number(item.quantity || 0),
          item.unit || "",
          Number(Number(item.unit_cost || 0).toFixed(2)),
          Number(Number(item.markup_percent || 0).toFixed(2)),
          { formula: `D${excelRow}*F${excelRow}*(1+G${excelRow}/100)`, result: sellTotalExGst },
          formatGstTreatmentLabel(item.gst_treatment),
          Number((gstRate * 100).toFixed(2)),
          { formula: `H${excelRow}*J${excelRow}/100`, result: gstContent },
          { formula: `H${excelRow}+K${excelRow}`, result: sellTotalIncGst },
          item.source || "",
          item.review_status || "",
        ]);
      });

    rows.push(["Totals"]);
    rowStyles[rows.length] = "summary";
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "Totals",
      allExportItems.length > 0 ? { formula: `SUM(H${firstItemExcelRow}:H${lastItemExcelRow})`, result: roundMoney(allExportItems.reduce((sum, { item }) => sum + Number(item.total || 0), 0)) } : 0,
      "",
      "",
      allExportItems.length > 0 ? { formula: `SUM(K${firstItemExcelRow}:K${lastItemExcelRow})`, result: roundMoney(allExportItems.reduce((sum, { item }) => sum + roundMoney(Number(item.total || 0) * getQuoteItemGstRate(item)), 0)) } : 0,
      allExportItems.length > 0 ? { formula: `SUM(L${firstItemExcelRow}:L${lastItemExcelRow})`, result: roundMoney(allExportItems.reduce((sum, { item }) => {
        const sellTotalExGst = roundMoney(item.total || 0);
        return sum + sellTotalExGst + roundMoney(sellTotalExGst * getQuoteItemGstRate(item));
      }, 0)) } : 0,
      "",
      "",
    ]);
    rowStyles[rows.length] = "summary";

    rows.push(
      ["Subtotal Ex GST", "", "", "", "", "", "", { formula: `H${totalsValueExcelRow}`, result: quote.subtotal || 0 }],
      ["GST", "", "", "", "", "", "", { formula: `K${totalsValueExcelRow}`, result: quote.gst || 0 }],
      ["Total Inc GST", "", "", "", "", "", "", { formula: `L${totalsValueExcelRow}`, result: quote.total || 0 }]
    );
    rowStyles[rows.length - 2] = "summary";
    rowStyles[rows.length - 1] = "summary";
    rowStyles[rows.length] = "summary";

    const workbook = {
      sheetName: "Quote List",
      rows,
      rowStyles,
      columnWidths: [18, 40, 18, 12, 12, 14, 12, 16, 16, 12, 14, 16, 22, 18],
    };

    const filename = `${sanitizeExportFilename(quote.quote_number || quote.title || "quote-list")}_quote_list.xlsx`;
    downloadBlob(filename, buildXlsxBlob(workbook));
  };

  const patchApprovalFields = async (patch) => {
    await patchQuote(patch);
  };

  const logApprovalAction = async (status, note) => {
    const nextHistory = [
      ...(Array.isArray(quote.approval_history) ? quote.approval_history : []),
      buildApprovalHistoryEntry({
        status,
        note,
        actor: quote.approval_owner || "CRM",
      }),
    ];
    const approvalPatch = status === "approved"
      ? buildQuoteApprovalPatch({
        quote,
        items,
        approvedBy: quote.approval_owner || "JoinerFlow",
        notes: note || "",
        documentAttachment: latestGeneratedDocument(),
      })
      : {
        approval_status: status,
        approval_completed_date: status === "approved" ? formatDateForInput(new Date()) : quote.approval_completed_date || "",
      };

    await patchQuote({
      ...approvalPatch,
      approval_status: status,
      approval_requested_date: status === "pending_internal" ? formatDateForInput(new Date()) : quote.approval_requested_date || formatDateForInput(new Date()),
      approval_history: nextHistory,
    });
    if (status === "approved") {
      setQuoteEditUnlocked(false);
      toast({
        title: "Approval snapshot saved",
        description: "Approved totals, line items, and document version are now protected.",
      });
    }
  };

  const createApprovalSnapshot = async () => {
    const note = "Internal quote, pricing, and document approval snapshot created.";
    await logApprovalAction("approved", note);
  };

  const recordClientApproval = async () => {
    const selectedAttachment = attachments.find((attachment) => String(attachment.id || "") === String(clientApprovalForm.attachment_id || "")) || latestGeneratedDocument();
    const approvalDate = clientApprovalForm.approval_date || formatDateForInput(new Date());
    const nextHistory = [
      ...(Array.isArray(quote.approval_history) ? quote.approval_history : []),
      buildApprovalHistoryEntry({
        status: "client_approved",
        note: clientApprovalForm.notes || "Client approval recorded.",
        actor: quote.approval_owner || "CRM",
      }),
    ];
    await patchQuote({
      ...buildQuoteApprovalPatch({
        quote: { ...quote, client_approval_date: approvalDate, client_approval_notes: clientApprovalForm.notes || "" },
        items,
        approvedBy: quote.approval_owner || quote.contact_name || "Client",
        notes: clientApprovalForm.notes || "Client approval recorded.",
        documentAttachment: selectedAttachment,
      }),
      client_approval_date: approvalDate,
      client_approval_notes: clientApprovalForm.notes || "",
      client_approval_attachment_id: selectedAttachment?.id || "",
      client_approval_attachment_name: selectedAttachment?.name || "",
      approval_history: nextHistory,
    });
    setQuoteEditUnlocked(false);
    toast({
      title: "Client approval recorded",
      description: "The approved quote version is locked and ready for controlled revisions only.",
    });
  };

  const sortedQuoteItems = groupRowsWithChildren(items, {
    sortState: quoteListSortState,
    columnDefinitions: QUOTE_LINE_ITEM_SORT_COLUMNS,
    getId: (item) => String(item.id || ""),
    getParentId: (item) => String(item.parent_line_item_id || ""),
  });
  const sortedQuoteSections = useMemo(() => {
    const grouped = new Map();
    sortedQuoteItems.forEach((item) => {
      const fallbackName = String(item.section || "General").trim() || "General";
      const sectionKey = String(item.section_key || "").trim();
      const sectionId = String(item.section_id || "").trim();
      const matchedRecord = (sectionId && pricingSectionLookup.get(sectionId))
        || pricingSectionRecords.find((section) => String(section.key || section.value || "") === sectionKey)
        || findMatchingPricingSection(pricingSectionRecords, fallbackName);
      const mapKey = sectionId || sectionKey || fallbackName.toLowerCase();
      if (!grouped.has(mapKey)) {
        grouped.set(mapKey, {
          key: mapKey,
          label: matchedRecord?.label || matchedRecord?.name || fallbackName,
          display_order: Number(matchedRecord?.display_order ?? item.section_display_order ?? 999),
        });
      }
    });
    return [...grouped.values()].sort((left, right) => {
      const orderCompare = Number(left.display_order || 999) - Number(right.display_order || 999);
      if (orderCompare !== 0) return orderCompare;
      return String(left.label || "").localeCompare(String(right.label || ""), undefined, { sensitivity: "base" });
    });
  }, [pricingSectionLookup, pricingSectionRecords, sortedQuoteItems]);
  const quoteMarginSummary = useMemo(() => {
    const activeItems = items.filter(isActiveQuoteMarginItem);
    const grossItems = activeItems.filter((item) => !isLabourMarginCategory(item.category));
    const materialItems = activeItems.filter((item) => isMaterialMarginCategory(item.category));

    const summarise = (rows) => {
      const sell = roundMoney(rows.reduce((sum, item) => sum + Number(item.total || 0), 0));
      const cost = roundMoney(rows.reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0));
      const profit = roundMoney(sell - cost);
      const marginPercent = safeMarginPercent(sell, cost);
      const missingCostCount = rows.filter((item) => Number(item.total || 0) > 0 && Number(item.unit_cost || 0) <= 0).length;
      const sellBelowCostCount = rows.filter((item) => Number(item.total || 0) < Number(item.unit_cost || 0) * Number(item.quantity || 0)).length;
      return {
        sell,
        cost,
        profit,
        marginPercent,
        missingCostCount,
        sellBelowCostCount,
      };
    };

    const gross = summarise(grossItems);
    const material = summarise(materialItems);

    const breakdown = {
      materials: roundMoney(activeItems.filter((item) => isMaterialMarginCategory(item.category)).reduce((sum, item) => sum + Number(item.total || 0), 0)),
      labour: roundMoney(activeItems.filter((item) => String(item.category || "").toLowerCase() === "labour").reduce((sum, item) => sum + Number(item.total || 0), 0)),
      labourCostExcluded: roundMoney(activeItems.filter((item) => isLabourMarginCategory(item.category)).reduce((sum, item) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 0)), 0)),
      subcontract: roundMoney(activeItems.filter((item) => String(item.category || "").toLowerCase().includes("subcontract")).reduce((sum, item) => sum + Number(item.total || 0), 0)),
      freight: roundMoney(activeItems.filter((item) => ["freight_delivery", "packaging_freight", "delivery"].includes(String(item.category || "").toLowerCase())).reduce((sum, item) => sum + Number(item.total || 0), 0)),
      autoInclusions: roundMoney(activeItems.filter((item) => ["global_auto_inclusion", "triggered_auto_inclusion"].includes(String(item.source || ""))).reduce((sum, item) => sum + Number(item.total || 0), 0)),
    };

    const averageMaterialMarkup = materialItems.length > 0
      ? roundMoney(materialItems.reduce((sum, item) => sum + Number(item.markup_percent || 0), 0) / materialItems.length)
      : 0;

    return {
      gross,
      material,
      breakdown,
      averageMaterialMarkup,
    };
  }, [items]);
  const quoteGrossMarginScenarios = useMemo(() => {
    const activeGrossItems = items.filter((item) => isActiveQuoteMarginItem(item) && !isLabourMarginCategory(item.category));
    if (activeGrossItems.length === 0) {
      return [];
    }
    return [35, 40, 45, 50].map((targetMarginPercent) => buildQuoteGrossMarginScenario(items, targetMarginPercent));
  }, [items]);
  if (!quote) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const displayStatus = normalizeQuoteStatus(quote.status);
  const sc = getStageConfig(QUOTE_STATUSES, displayStatus);
  const quoteApprovalLocked = isQuoteApprovalLocked(quote);
  const approvalSnapshots = Array.isArray(quote.approval_snapshots) ? quote.approval_snapshots : [];
  const latestApprovalSnapshot = approvalSnapshots[approvalSnapshots.length - 1] || null;
  const revisionHistory = Array.isArray(quote.revision_history) ? quote.revision_history : [];
  const autoAddedNeedsReviewCount = items.filter((item) => ["global_auto_inclusion", "triggered_auto_inclusion"].includes(String(item.source || "")) && item.review_status === "auto_added_needs_review").length;
  const sellTotal = itemForm.unit_cost * itemForm.quantity * (1 + itemForm.markup_percent / 100);
  const editSellTotal = editItemForm.unit_cost * editItemForm.quantity * (1 + editItemForm.markup_percent / 100);
  const sortedContacts = [...contacts].sort((left, right) =>
    getContactDisplayName(left).localeCompare(getContactDisplayName(right), undefined, { sensitivity: "base", numeric: true })
  );
  const linkedJobs = jobs.filter((job) => String(job.quote_id || "") === String(id));
  const siteMeasureAttachments = attachments.filter((attachment) => String(attachment.source || "") === "site-measure");
  const workflowSummary = summarizeQuoteWorkflow(quote, items, linkedJobs);
  const handoffMeta = getOptionMeta(HANDOFF_STATUS_OPTIONS, quote.production_handoff_status || "not_ready", "Handoff");
  const latestPricingImport = quoteImports[0] || null;
  const quoteLevelImports = quoteImports
    .filter((record) => record.import_type === "quote_level" || record.source === "quote_level_import")
    .filter((record) => String(record.import_status || "") !== "replaced");
  const grossMarginTone = getMarginTone(quoteMarginSummary.gross.marginPercent);
  const materialMarginTone = getMarginTone(quoteMarginSummary.material.marginPercent);
  const grossWarnings = [
    quoteMarginSummary.gross.marginPercent < 35 ? "Below target margin" : "",
    quoteMarginSummary.gross.missingCostCount > 0 ? `${quoteMarginSummary.gross.missingCostCount} item${quoteMarginSummary.gross.missingCostCount === 1 ? "" : "s"} missing cost` : "",
    quoteMarginSummary.gross.sellBelowCostCount > 0 ? `${quoteMarginSummary.gross.sellBelowCostCount} item${quoteMarginSummary.gross.sellBelowCostCount === 1 ? "" : "s"} selling below cost` : "",
  ].filter(Boolean);
  const materialWarnings = [
    quoteMarginSummary.material.marginPercent > 0 && quoteMarginSummary.material.marginPercent < 20 ? "Material margin unusually low" : "",
    quoteMarginSummary.material.missingCostCount > 0 ? `${quoteMarginSummary.material.missingCostCount} material item${quoteMarginSummary.material.missingCostCount === 1 ? "" : "s"} missing cost` : "",
    quoteMarginSummary.material.sellBelowCostCount > 0 ? `${quoteMarginSummary.material.sellBelowCostCount} material item${quoteMarginSummary.material.sellBelowCostCount === 1 ? "" : "s"} selling below cost` : "",
  ].filter(Boolean);
  const pricingRowsByImport = quoteLevelImports.map((record) => {
    const rows = pricingReviewRows.filter((row) => row.import_id === record.id);
    const visibleRows = groupRowsWithChildren(
      rows.filter((row) => String(row.review_state || row.status || "") !== "deleted"),
      {
        sortState: pricingReviewSortState,
        columnDefinitions: QUOTE_IMPORT_REVIEW_SORT_COLUMNS,
        getId: (row) => String(row.id || ""),
        getParentId: (row) => String(row.parent_pricing_quote_item_id || ""),
      },
    );
    const costingRows = visibleRows.filter((row) => String(row.review_state || row.status || "") !== "excluded");
    return {
      importRecord: record,
      rows,
      visibleRows,
      totalBuy: costingRows.reduce((sum, row) => sum + Number(row.total_buy_price || Number(row.buy_price || 0) * Number(row.quantity || 1)), 0),
      totalSell: costingRows.reduce((sum, row) => sum + Number(row.total_sell_price || 0), 0),
      warningCount: visibleRows.reduce((sum, row) => sum + (Array.isArray(row.warnings) ? row.warnings.length : 0), 0),
    };
  });
  const handleCoreWorkflowAction = (target) => {
    if (target === "leads") {
      navigate("/leads");
      return;
    }
    if (target === "document") {
      void openDocumentGenerator("contract");
      return;
    }
    if (target === "send") {
      void markQuoteSent();
      return;
    }
    if (target === "schedule") {
      navigate("/schedule");
      return;
    }
    if (target === "archive") {
      void archiveQuote();
      return;
    }
    if (target === "restore") {
      void restoreQuote();
      return;
    }
    setActiveQuoteTab(target || "overview");
  };
  const lifecycleCurrentIndex = (() => {
    if (displayStatus === "archived") return 7;
    if (workflowSummary.linkedJob) return 6;
    if (["awaiting_confirmation", "quote_complete", "won"].includes(displayStatus)) return 5;
    if (attachments.some((attachment) => String(attachment.source || "") === "generated-document")) return 4;
    if (activeQuoteTab === "quote-list") return 3;
    if (activeQuoteTab === "pricing" || quoteLevelImports.length > 0 || items.length > 0) return 2;
    return 1;
  })();

  return (
    <div className="jf-reference-page">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/quotes" className="hover:text-foreground">Quotes</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{quote.quote_number}</span>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="font-heading text-3xl font-semibold">{quote.title}</h1>
            <StatusBadge label={sc.label} color={sc.color} />
            <StatusBadge label={workflowSummary.readiness.label} color={workflowSummary.readiness.color} />
          </div>
          <p className="text-sm text-muted-foreground">
            {quote.quote_number} · Rev {quote.revision || 1}
            {quote.contact_name ? ` · ${quote.contact_name}` : ""}
            {quote.company_name ? ` · ${quote.company_name}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap xl:justify-end">
          <Button size="sm" className="jf-reference-action" onClick={() => void openDocumentGenerator("contract")} disabled={generatingDocument}>
            <FileText className="w-3.5 h-3.5 mr-1" />
            Generate Quote/Contract
          </Button>
          <Button variant="outline" size="sm" className="min-h-9 rounded-md" onClick={openQuoteEditDialog}><Edit2 className="w-3.5 h-3.5 mr-1" />Edit</Button>
          {workflowSummary.linkedJob ? (
            <Button variant="outline" size="sm" className="min-h-9 rounded-md" onClick={() => navigate(`/jobs/${workflowSummary.linkedJob.id}`)}>
              <Briefcase className="w-3.5 h-3.5 mr-1" />
              Open Job
            </Button>
          ) : null}
          {displayStatus === "won" && !workflowSummary.linkedJob ? (
            <Button size="sm" className="min-h-9 rounded-md" onClick={() => void handleOpenConvert()}>
              <Briefcase className="w-3.5 h-3.5 mr-1" />
              Convert to Job
            </Button>
          ) : null}
          <div className="flex min-h-9 items-center gap-1 rounded-md border border-border bg-white/70 px-1 shadow-sm" aria-label="More Options">
            <span className="px-2 text-xs font-semibold text-muted-foreground">More</span>
            {displayStatus === "archived" ? (
              <Button variant="ghost" size="sm" className="h-7 rounded px-2 text-xs" onClick={() => void restoreQuote()}>
                Restore Quote
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 rounded px-2 text-xs" onClick={() => void archiveQuote()}>
                Archive Quote
              </Button>
            )}
          </div>
          <Select value={displayStatus} onValueChange={(value) => void handleStatusChange(value)}>
            <SelectTrigger className="w-48 h-9 rounded-md bg-white/70">
              <Briefcase className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUOTE_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {(quoteApprovalLocked || quote.has_unapproved_changes) ? (
        <Card className={`border px-4 py-3 ${quote.has_unapproved_changes ? "border-[#dfc38e] bg-[#f2e2c6]/55" : "border-[#c9d7be] bg-[#e6ece0]/55"}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={quote.has_unapproved_changes ? "Revision in progress" : "Approved quote locked"}
                  color={quote.has_unapproved_changes ? "amber" : "emerald"}
                />
                {latestApprovalSnapshot ? (
                  <span className="text-xs text-muted-foreground">
                    Approved {latestApprovalSnapshot.approval_date} by {latestApprovalSnapshot.approved_by}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {quote.has_unapproved_changes
                  ? "This quote has changed after approval. Check the revision before sending or scheduling."
                  : "Approved totals, line items, and document version are protected from accidental changes."}
              </p>
            </div>
            {quoteApprovalLocked && !quoteEditUnlocked ? (
              <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => void ensureQuoteEditAllowed()}>
                <Unlock className="h-4 w-4 mr-1" />
                Unlock for Revision
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <AiDraftPanel quoteId={id} jobId={workflowSummary.linkedJob?.id || ""} />

      <div className={`grid gap-0 overflow-hidden rounded-lg border border-border/60 bg-white/75 shadow-sm sm:grid-cols-2 ${clientMode ? "xl:grid-cols-5" : "xl:grid-cols-7"}`}>
        <div className="border-b border-r border-border/45 p-4 xl:border-b-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{clientMode ? "Quote Total Incl GST" : "Total"}</p>
          <p className="mt-2 font-heading text-2xl font-semibold text-primary">{formatCurrency(quote.total)}</p>
          {clientMode ? (
            <p className="mt-2 text-xs text-muted-foreground">Customer-facing total</p>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>Ex GST: {formatQuoteListCurrency(quote.subtotal || 0)}</p>
              <p>Inc GST: {formatQuoteListCurrency(quote.total || 0)}</p>
            </div>
          )}
        </div>
        <div className="border-b border-r border-border/45 p-4 xl:border-b-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Line Items</p>
          <p className="mt-2 font-heading text-2xl font-semibold">{items.length}</p>
        </div>
        <div className="border-b border-r border-border/45 p-4 xl:border-b-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Approval</p>
          <p className="mt-2 font-heading text-xl font-semibold">{workflowSummary.approval.label}</p>
        </div>
        <div className="border-b border-r border-border/45 p-4 xl:border-b-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Signoff</p>
          <p className="mt-2 font-heading text-2xl font-semibold">{workflowSummary.signoffCompleteCount}/{workflowSummary.signoffTotalCount}</p>
        </div>
        <div className="border-b border-r border-border/45 p-4 xl:border-b-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Variations</p>
          <p className="mt-2 font-heading text-2xl font-semibold">{workflowSummary.changeOrderCount}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatCurrency(workflowSummary.approvedChangeValue)} approved</p>
        </div>
        {clientMode ? null : (
          <div className={`border-b border-r border-border/45 p-4 xl:border-b-0 ${grossMarginTone.cardClass}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Gross Margin</p>
                <p className={`mt-2 font-heading text-2xl font-semibold ${grossMarginTone.valueClass}`}>{quoteMarginSummary.gross.marginPercent.toFixed(1)}%</p>
              </div>
              <StatusBadge
                label={quoteMarginSummary.gross.marginPercent < 35 ? "Below target" : quoteMarginSummary.gross.marginPercent > 45 ? "Premium" : "On target"}
                color={grossMarginTone.badgeColor}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatQuoteListCurrency(quoteMarginSummary.gross.profit)} profit
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatQuoteListCurrency(quoteMarginSummary.gross.sell)} / {formatQuoteListCurrency(quoteMarginSummary.gross.cost)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Labour excluded: {formatQuoteListCurrency(quoteMarginSummary.breakdown.labourCostExcluded)} cost
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="95"
                  step="0.1"
                  value={grossMarginTarget}
                  onChange={(event) => setGrossMarginTarget(event.target.value)}
                  className="h-8 rounded-md bg-white/70"
                  aria-label="Target gross margin"
                />
                <Button size="sm" className="h-8 rounded-md px-3" onClick={() => openMarginAdjustmentDialog("gross")}>
                  Apply
                </Button>
              </div>
            </div>
            {grossWarnings.length ? (
              <p className="mt-2 text-[11px] text-red-700">{grossWarnings[0]}</p>
            ) : null}
          </div>
        )}
        {clientMode ? null : (
          <div className={`p-4 ${materialMarginTone.cardClass}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Material Margin</p>
                <p className={`mt-2 font-heading text-2xl font-semibold ${materialMarginTone.valueClass}`}>{quoteMarginSummary.material.marginPercent.toFixed(1)}%</p>
              </div>
              <StatusBadge
                label={quoteMarginSummary.material.marginPercent < 20 ? "Review" : quoteMarginSummary.material.marginPercent > 45 ? "High" : "Healthy"}
                color={quoteMarginSummary.material.marginPercent < 20 ? "amber" : materialMarginTone.badgeColor}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatQuoteListCurrency(quoteMarginSummary.material.profit)} profit
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatQuoteListCurrency(quoteMarginSummary.material.sell)} / {formatQuoteListCurrency(quoteMarginSummary.material.cost)}
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="95"
                  step="0.1"
                  value={materialMarginTarget}
                  onChange={(event) => setMaterialMarginTarget(event.target.value)}
                  className="h-8 rounded-md bg-white/70"
                  aria-label="Target material margin"
                />
                <Button size="sm" className="h-8 rounded-md px-3" onClick={() => openMarginAdjustmentDialog("material")}>
                  Apply
                </Button>
              </div>
            </div>
            {materialWarnings.length ? (
              <p className="mt-2 text-[11px] text-amber-700">{materialWarnings[0]}</p>
            ) : null}
          </div>
        )}
      </div>

      <QuoteLifecycleRail steps={QUOTE_LIFECYCLE_STEPS} currentIndex={lifecycleCurrentIndex} onStep={handleCoreWorkflowAction} />

      <Tabs value={activeQuoteTab} onValueChange={setActiveQuoteTab}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Quote Details</TabsTrigger>
            <TabsTrigger value="site-measure">Site Measure</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="quote-list">Review Quote List ({items.length})</TabsTrigger>
            <TabsTrigger value="files">Documents & Files ({attachments.length})</TabsTrigger>
            {advancedQuoteMode ? (
              <>
                <TabsTrigger value="workflow">Workflow ({workflowTasks.length})</TabsTrigger>
                {!clientMode ? <TabsTrigger value="scenarios">Scenarios</TabsTrigger> : null}
                <TabsTrigger value="history">History</TabsTrigger>
              </>
            ) : null}
          </TabsList>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit min-h-[40px]"
            onClick={() => setQuoteAdvancedMode(!advancedQuoteMode)}
          >
            {advancedQuoteMode ? "Hide Advanced" : "Show Advanced"}
          </Button>
        </div>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Commercial Readiness</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Clear the approval, signoff, and handoff items that control whether this quote is safe to issue or convert.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <StatusBadge label={workflowSummary.readiness.label} color={workflowSummary.readiness.color} />
                  <StatusBadge label={handoffMeta.label} color={handoffMeta.color} />
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next Step</p>
                  <p className="mt-2 text-sm text-foreground">{workflowSummary.nextStep}</p>
                </div>
                <div className="rounded-xl border bg-muted/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quote To Job</p>
                  {workflowSummary.linkedJob ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-foreground">Linked to {workflowSummary.linkedJob.job_number}.</p>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${workflowSummary.linkedJob.id}`)}>
                        Open linked job
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm text-foreground">{displayStatus === "won" ? "Won and ready for conversion." : "No job has been created from this quote yet."}</p>
                      {displayStatus === "won" ? <Button size="sm" onClick={() => void handleOpenConvert()}>Convert to Job</Button> : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Decision Due Date</Label>
                  <Input
                    type="date"
                    value={quote.decision_due_date || ""}
                    onChange={(event) => void saveQuoteNotes({ decision_due_date: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Production Handoff Status</Label>
                  <Select value={quote.production_handoff_status || "not_ready"} onValueChange={(value) => void saveQuoteNotes({ production_handoff_status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HANDOFF_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Internal Commercial Notes</Label>
                  <Textarea
                    value={quote.quote_internal_notes || ""}
                    onChange={(event) => setQuote((current) => ({ ...current, quote_internal_notes: event.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job Conversion / Handoff Notes</Label>
                  <Textarea
                    value={quote.job_conversion_notes || ""}
                    onChange={(event) => setQuote((current) => ({ ...current, job_conversion_notes: event.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveQuoteNotes({
                      quote_internal_notes: quote.quote_internal_notes || "",
                      job_conversion_notes: quote.job_conversion_notes || "",
                    })}
                  >
                    Save Notes
                  </Button>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current Blockers</p>
                {workflowSummary.blockers.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                    No major blockers. This quote is ready for the next commercial step.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {workflowSummary.blockers.map((blocker) => (
                      <div key={blocker} className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{blocker}</div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Approval Snapshot</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Save the approved quote, pricing, and document version before the job moves ahead.
                    </p>
                  </div>
                  <StatusBadge
                    label={quoteApprovalLocked ? "Locked" : quote.has_unapproved_changes ? "Revision" : "Not locked"}
                    color={quoteApprovalLocked ? "emerald" : quote.has_unapproved_changes ? "amber" : "slate"}
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground">Approved total</p>
                    <p className="text-base font-semibold">{formatQuoteListCurrency(quote.approved_totals?.total ?? latestApprovalSnapshot?.approved_totals?.total ?? 0)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground">Snapshots</p>
                    <p className="text-base font-semibold">{approvalSnapshots.length}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground">Approved document</p>
                    <p className="truncate text-base font-semibold">{quote.client_approval_attachment_name || latestApprovalSnapshot?.approved_document_version?.name || "Not recorded"}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="min-h-[40px]" onClick={() => void createApprovalSnapshot()}>
                    Create Approval Snapshot
                  </Button>
                  {quote.has_unapproved_changes ? (
                    <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => void createApprovalSnapshot()}>
                      Approve This Revision
                    </Button>
                  ) : null}
                </div>

                <div className="mt-5 rounded-lg border bg-muted/10 p-3">
                  <h3 className="text-sm font-semibold">Client Approval</h3>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Approval date</Label>
                        <Input
                          type="date"
                          value={clientApprovalForm.approval_date}
                          onChange={(event) => setClientApprovalForm((current) => ({ ...current, approval_date: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Approved document or email</Label>
                        <Select
                          value={clientApprovalForm.attachment_id || "__none"}
                          onValueChange={(value) => setClientApprovalForm((current) => ({ ...current, attachment_id: value === "__none" ? "" : value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose file" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">No file selected</SelectItem>
                            {attachments.map((attachment) => (
                              <SelectItem key={attachment.id} value={attachment.id}>
                                {attachment.name || "Attached file"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Approval notes</Label>
                      <Textarea
                        value={clientApprovalForm.notes}
                        onChange={(event) => setClientApprovalForm((current) => ({ ...current, notes: event.target.value }))}
                        rows={2}
                        placeholder="Example: Client approved revised kitchen quote by email."
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => void recordClientApproval()}>
                        Record Client Approval
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <ApprovalPanel
                title="Approvals"
                description="Track internal pricing approval and keep a clear history of decisions."
                status={quote.approval_status || "draft"}
                owner={quote.approval_owner || ""}
                requestedDate={quote.approval_requested_date || ""}
                completedDate={quote.approval_completed_date || ""}
                history={Array.isArray(quote.approval_history) ? quote.approval_history : []}
                onPatch={(patch) => void patchApprovalFields(patch)}
                onQuickAction={(status, note) => logApprovalAction(status, note)}
              />

              {quoteInsights ? (
                <Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Historical comparison for labour, install, and margin risk.</p>
                    </div>
                    {quoteRiskAnalysis ? (
                      <StatusBadge
                        label={`Risk ${String(quoteRiskAnalysis.overall_risk || "low").replace(/^\w/, (value) => value.toUpperCase())}`}
                        color={quoteRiskAnalysis.overall_risk === "high" ? "red" : quoteRiskAnalysis.overall_risk === "medium" ? "amber" : "emerald"}
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Labour range</p>
                      <p className="mt-1 text-sm font-semibold">{quoteInsights.likely_labour_hours.min}h - {quoteInsights.likely_labour_hours.max}h</p>
                      <p className="text-xs text-muted-foreground">Suggested: {quoteInsights.likely_labour_hours.recommended}h</p>
                    </div>
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Install range</p>
                      <p className="mt-1 text-sm font-semibold">{quoteInsights.likely_install_days.min} - {quoteInsights.likely_install_days.max} days</p>
                      <p className="text-xs text-muted-foreground">Suggested: {quoteInsights.likely_install_days.recommended} days</p>
                    </div>
                    <div className="rounded-lg border px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Margin comparison</p>
                      <p className="mt-1 text-sm font-semibold">{quoteInsights.margin.current_percent}%</p>
                      <p className="text-xs text-muted-foreground">
                        Historical median {quoteInsights.margin.historical_median_percent}% ({quoteInsights.margin.delta_percent >= 0 ? "+" : ""}{quoteInsights.margin.delta_percent}%)
                      </p>
                    </div>
                  </div>

                  {Array.isArray(quoteInsights.risk_indicators) && quoteInsights.risk_indicators.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {quoteInsights.risk_indicators.slice(0, 4).map((risk) => (
                        <div key={risk.key} className="rounded-lg border px-3 py-2">
                          <p className="text-xs font-semibold text-foreground">{risk.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {(quoteInsights.missing_inclusions?.length || quoteInsights.underquoted_operations?.length) ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Missing inclusions</p>
                        {quoteInsights.missing_inclusions?.length ? (
                          <ul className="mt-2 space-y-1 text-xs text-foreground">
                            {quoteInsights.missing_inclusions.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        ) : <p className="mt-2 text-xs text-muted-foreground">No recurring inclusion gaps detected.</p>}
                      </div>
                      <div className="rounded-lg border px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Underquoted operations</p>
                        {quoteInsights.underquoted_operations?.length ? (
                          <ul className="mt-2 space-y-1 text-xs text-foreground">
                            {quoteInsights.underquoted_operations.slice(0, 4).map((operation) => (
                              <li key={operation.operation}>
                                {operation.operation}: {operation.source_hours}h vs {operation.historical_median_hours}h historical
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-2 text-xs text-muted-foreground">No operation underquote flags detected.</p>}
                      </div>
                    </div>
                  ) : null}

                  {Array.isArray(quoteInsights.recommendations) && quoteInsights.recommendations.length > 0 ? (
                    <div className="mt-4 rounded-lg border px-3 py-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Recommended actions</p>
                      <ul className="mt-2 space-y-1 text-xs text-foreground">
                        {quoteInsights.recommendations.slice(0, 5).map((recommendation) => (
                          <li key={recommendation}>{recommendation}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {similarHistoricalJobs.length > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-foreground">Similar Jobs</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Historical jobs with comparable scope and commercial profile.</p>
                  <div className="mt-3 space-y-2">
                    {similarHistoricalJobs.map((result) => (
                      <Link key={`${result.job_id}-${result.quote_id}`} to={result.href || `/jobs/${result.job_id}`} className="block rounded-lg border px-3 py-2 hover:bg-muted/45">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Margin {Math.round(Number(result.metrics?.margin_percent || 0))}% · Labour {Math.round(Number(result.metrics?.labour_hours || 0))}h · Install {Math.round(Number(result.metrics?.install_days || 0))}d
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground">{Math.round(Number(result.score || 0) * 100)}%</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              ) : null}

              {quoteKnowledgeResults.length > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-foreground">Knowledge Matches</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Indexed notes, documents, and records relevant to this quote scope.</p>
                  <div className="mt-3 space-y-2">
                    {quoteKnowledgeResults.slice(0, 5).map((result) => (
                      <div key={result.chunk_id || `${result.file_id}:${result.line_start || 0}`} className="rounded-lg border px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-xs font-medium text-muted-foreground">{result.source_reference || result.relative_path}</p>
                          <span className="text-xs font-semibold text-muted-foreground">{Math.round(Number(result.score || 0) * 100)}%</span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-foreground">{result.snippet || result.chunk_text}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}

              {similarQuotes.length > 0 ? (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-foreground">Similar Quotes</h3>
                  <div className="mt-3 space-y-2">
                    {similarQuotes.map((result) => (
                      <Link key={result.record_id} to={result.href || `/quotes/${result.record_id}`} className="block rounded-lg border px-3 py-2 hover:bg-muted/45">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{result.snippet}</p>
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground">{Math.round(Number(result.score || 0) * 100)}%</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              ) : null}

              <ChecklistPanel
                title="Commercial Signoff"
                description="These checks make sure the quote is commercially safe before it goes to the client or turns into a job."
                items={workflowSummary.signoffItems}
                badgeLabel={`${workflowSummary.signoffCompleteCount}/${workflowSummary.signoffTotalCount} complete`}
                badgeColor={getChecklistBadgeColor(workflowSummary)}
                onToggle={(field, checked) => void toggleQuoteChecklist(field, checked)}
              />
            </div>
          </div>

          <ChangeOrderPanel
            title="Change Orders"
            description="Track commercial variations, their value, and whether they have been approved."
            changeOrders={workflowSummary.changeOrders}
            onAdd={(values) => addQuoteChangeOrder(values)}
            onUpdateStatus={(changeOrderId, status) => updateQuoteChangeOrderStatus(changeOrderId, status)}
          />
        </TabsContent>

        <TabsContent value="site-measure">
          <SiteMeasureWorkflow
            quote={quote}
            measures={siteMeasures}
            attachments={siteMeasureAttachments}
            staffRecords={staffRecords}
            linkedJobs={linkedJobs}
            onSave={saveSiteMeasure}
            onUpload={uploadSiteMeasureFile}
          />
        </TabsContent>

        <TabsContent value="workflow">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-sm">Quote Workflow Tasks</h2>
                <p className="text-sm text-muted-foreground mt-1">System-created commercial tasks are scheduled from quote creation through follow-up so the pipeline stays actionable.</p>
              </div>
              <StatusBadge label={`${workflowTasks.length} tasks`} color="blue" />
            </div>

            {workflowTasks.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                No quote workflow tasks have been created yet.
              </div>
            ) : (
              <div className="space-y-2">
                {workflowTasks.map((task) => {
                  const phase = getStageConfig(WORKFLOW_PHASES, task.workflow_phase);
                  const taskIsComplete = isWorkflowTaskComplete(task);
                  const taskStatus = String(task.status || "").replace(/_/g, " ");
                  const assignedStaffId = Array.isArray(task.assigned_staff_ids) ? String(task.assigned_staff_ids[0] || "") : "";
                  return (
                    <div key={task.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge label={phase.label} color={phase.color} />
                          {task.is_system_generated ? <StatusBadge label="Auto" color="slate" /> : null}
                          {assigningTaskId === task.id ? (
                            <Select
                              value={assignedStaffId || "__unassigned"}
                              onValueChange={(value) => void assignWorkflowTask(task, value === "__unassigned" ? "" : value)}
                            >
                              <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Assign staff" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned">Unassigned</SelectItem>
                                {staffRecords.map((staff) => (
                                  <SelectItem key={staff.id} value={staff.id}>{staff.name || staff.full_name || staff.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : task.is_unassigned_placeholder ? (
                            <button type="button" onClick={() => setAssigningTaskId(task.id)}>
                              <StatusBadge label="Unassigned" color="amber" />
                            </button>
                          ) : task.assigned_to ? (
                            <button type="button" onClick={() => setAssigningTaskId(task.id)} className="cursor-pointer">
                              <StatusBadge label={task.assigned_to} color="emerald" />
                            </button>
                          ) : (
                            <button type="button" onClick={() => setAssigningTaskId(task.id)}>
                              <StatusBadge label="Unassigned" color="amber" />
                            </button>
                          )}
                          <StatusBadge label={taskStatus || "pending"} color={taskIsComplete ? "emerald" : task.status === "ready" ? "blue" : "slate"} />
                          <span className={`text-sm font-medium ${taskIsComplete ? "line-through text-muted-foreground" : ""}`}>{task.task_name || "Workflow task"}</span>
                        </div>
                        <Button
                          type="button"
                          variant={taskIsComplete ? "outline" : "default"}
                          size="sm"
                          onClick={() => void toggleWorkflowTaskDone(task)}
                        >
                          {taskIsComplete ? "Reopen" : "Mark done"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {[task.start_date ? `Planned ${task.start_date}` : "", task.end_date && task.end_date !== task.start_date ? `to ${task.end_date}` : "", task.estimated_hours ? `${task.estimated_hours}h est` : "", task.actual_completion_date ? `Done ${task.actual_completion_date}` : "", task.generation_stage ? `from ${String(task.generation_stage).replace(/_/g, " ")}` : ""].filter(Boolean).join(" · ")}
                      </p>
                      {task.notes ? <p className="text-xs text-muted-foreground mt-2">{task.notes}</p> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <div className="mb-5">
            <ActualLabourPanel
              quoteId={id}
              jobIds={linkedJobs.map((job) => job.id)}
              jobs={linkedJobs}
              entries={timeEntries}
              operations={workflowTasks}
              quoteItems={items}
              labourSellAllowance={quoteMarginSummary.breakdown.labour}
              onUpdateTimeEntry={updateQuoteTimeEntry}
            />
          </div>
          <Card className="jf-document-panel p-5 mb-5">
            <ImportWizard
              title="Quote pricing import"
              description="Upload the supplier quote, Mozaik file, PDF, CSV, or XLSX. Review what was found, then add only the rows you want on this quote."
              fileInfo={pricingImportFile}
              status={pricingImportStatus}
              rows={pricingReviewRows}
              warnings={pricingReviewRows.flatMap((row) => row.warnings || []).slice(0, 3)}
              errors={pricingImportError ? [pricingImportError] : []}
              onFile={readPricingImportFile}
              onCancel={() => { setPricingImportFile(null); setPricingImportStatus("Waiting for file"); }}
              onParse={importQuotePricingFile}
              parseLabel="Review Import"
              helpText="Quote imports stay on this quote until you deliberately save defaults for future jobs."
            />
            {pricingImportError ? <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{pricingImportError}</div> : null}
            {pricingImportNotice ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{pricingImportNotice}</div> : null}

            {quoteLevelImports.length === 0 && !latestPricingImport ? (
              <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No quote pricing files have been added yet.
              </div>
            ) : null}

            <div className="mt-4 space-y-4">
              {pricingRowsByImport.map(({ importRecord, rows, visibleRows, totalBuy, totalSell, warningCount }) => (
                <div key={importRecord.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-semibold">{importRecord.file_name || "Quote import"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          formatPricingDocumentType(importRecord.metadata?.document_type),
                          importRecord.metadata?.supplier_name || "",
                          importRecord.metadata?.document_number || importRecord.metadata?.quote_reference ? `Doc ${importRecord.metadata?.document_number || importRecord.metadata?.quote_reference}` : "",
                          (importRecord.file_type || "file").toUpperCase(),
                          importRecord.created_date?.slice(0, 10) || "Today",
                          `${visibleRows.length} items`,
                          `Buy ${formatCurrency(totalBuy)}`,
                          `Sell ${formatCurrency(totalSell)}`,
                          importRecord.metadata?.total_inc_gst || importRecord.metadata?.gst_inclusive_total ? `Inc GST ${formatCurrency(importRecord.metadata?.total_inc_gst || importRecord.metadata.gst_inclusive_total)}` : "",
                          importRecord.metadata?.gst_treatment ? `GST ${importRecord.metadata.gst_treatment}` : "",
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={importRecord.import_status === "committed" ? "Added to quote" : "Ready to review"} color={importRecord.import_status === "committed" ? "emerald" : "blue"} />
                      {warningCount ? <StatusBadge label={`${warningCount} warnings`} color="amber" /> : null}
                      {importRecord.import_status === "committed" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!pricingImportHasUnsyncedRows(importRecord.id, rows)}
                          onClick={() => void updateImportedLineItems(importRecord.id)}
                        >
                          Update line items
                        </Button>
                      ) : null}
                      {importRecord.import_status !== "committed" ? (
                        <>
                          {advancedQuoteMode ? <Button variant="outline" size="sm" onClick={() => void mergePricingImportDuplicates(rows)}>Merge Duplicate Rows</Button> : null}
                          <Button size="sm" onClick={() => void commitPricingImport(importRecord.id, { replaceExisting: false })}>Confirm Import</Button>
                          {advancedQuoteMode ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const confirmed = window.confirm("Replace existing imported rows for this quote? This can overwrite manually managed imported lines.");
                                if (!confirmed) return;
                                void commitPricingImport(importRecord.id, { replaceExisting: true, forceDestructiveReplace: true });
                              }}
                            >
                              Replace Existing Imported Rows
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => void deletePricingImport(importRecord.id)}>Remove Import</Button>
                        </>
                      ) : null}
                      {importRecord.import_status === "committed" ? (
                        <Button variant="outline" size="sm" onClick={() => void deletePricingImport(importRecord.id)}>Remove Import</Button>
                      ) : null}
                    </div>
                  </div>
                  {importRecord.file_type === "pdf" ? (
                    <div className="grid gap-3 border-b bg-background p-3 text-sm md:grid-cols-4">
                      <div>
                        <Label className="text-xs">Document Type</Label>
                        <Select
                          value={importRecord.metadata?.document_type || "generic_pricing_document"}
                          onValueChange={(value) => void updatePricingImportMetadata(importRecord, { document_type: value })}
                          disabled={importRecord.import_status === "committed"}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="supplier_quote">Supplier quote</SelectItem>
                            <SelectItem value="supplier_invoice">Supplier invoice</SelectItem>
                            <SelectItem value="supplier_estimate">Supplier estimate</SelectItem>
                            <SelectItem value="generic_pricing_document">Pricing document</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Document Number</Label>
                        <Input
                          defaultValue={importRecord.metadata?.document_number || importRecord.metadata?.quote_reference || ""}
                          disabled={importRecord.import_status === "committed"}
                          onBlur={(event) => void updatePricingImportMetadata(importRecord, { document_number: event.target.value, quote_reference: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Total Inc GST</Label>
                        <Input
                          type="number"
                          defaultValue={importRecord.metadata?.total_inc_gst || importRecord.metadata?.gst_inclusive_total || ""}
                          disabled={importRecord.import_status === "committed"}
                          onBlur={(event) => void updatePricingImportMetadata(importRecord, { total_inc_gst: Number(event.target.value || 0), gst_inclusive_total: Number(event.target.value || 0) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">GST Treatment</Label>
                        <Select
                          value={importRecord.metadata?.gst_treatment || "unknown"}
                          onValueChange={(value) => void updatePricingImportMetadata(importRecord, { gst_treatment: value })}
                          disabled={importRecord.import_status === "committed"}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ex_gst">Ex GST</SelectItem>
                            <SelectItem value="inc_gst">Inc GST</SelectItem>
                            <SelectItem value="unknown">Needs review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Ex GST Subtotal</Label>
                        <Input
                          type="number"
                          defaultValue={importRecord.metadata?.subtotal_ex_gst || importRecord.metadata?.gst_exclusive_total || ""}
                          disabled={importRecord.import_status === "committed"}
                          onBlur={(event) => void updatePricingImportMetadata(importRecord, { subtotal_ex_gst: Number(event.target.value || 0), gst_exclusive_total: Number(event.target.value || 0) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">GST Amount</Label>
                        <Input
                          type="number"
                          defaultValue={importRecord.metadata?.gst_amount || ""}
                          disabled={importRecord.import_status === "committed"}
                          onBlur={(event) => void updatePricingImportMetadata(importRecord, { gst_amount: Number(event.target.value || 0) })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Document Date</Label>
                        <Input
                          defaultValue={importRecord.metadata?.document_date || importRecord.metadata?.quote_date || ""}
                          disabled={importRecord.import_status === "committed"}
                          onBlur={(event) => void updatePricingImportMetadata(importRecord, { document_date: event.target.value, quote_date: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Due / Valid Until</Label>
                        <Input
                          defaultValue={importRecord.metadata?.due_date || importRecord.metadata?.valid_until || ""}
                          disabled={importRecord.import_status === "committed"}
                          onBlur={(event) => void updatePricingImportMetadata(importRecord, { due_date: event.target.value, valid_until: event.target.value })}
                        />
                      </div>
                      {Array.isArray(importRecord.import_warnings) && importRecord.import_warnings.length ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 md:col-span-4">
                          {importRecord.import_warnings.join(" ")}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {visibleRows.length ? (
                    <div className="divide-y">
                      <div className={`grid gap-2 bg-muted/20 p-3 ${clientMode ? "lg:grid-cols-[1.35fr_145px_80px_80px_170px]" : "lg:grid-cols-[1.35fr_145px_80px_80px_95px_95px_230px]"}`}>
                        <SortableButton columnKey="description" sortState={pricingReviewSortState} onSort={requestPricingReviewSort}>Description</SortableButton>
                        <SortableButton columnKey="category" sortState={pricingReviewSortState} onSort={requestPricingReviewSort}>Category</SortableButton>
                        <SortableButton columnKey="qty" sortState={pricingReviewSortState} onSort={requestPricingReviewSort}>Qty</SortableButton>
                        <SortableButton columnKey="unit" sortState={pricingReviewSortState} onSort={requestPricingReviewSort}>Unit</SortableButton>
                        {!clientMode ? <SortableButton columnKey="cost" sortState={pricingReviewSortState} onSort={requestPricingReviewSort}>Cost</SortableButton> : null}
                        {!clientMode ? <SortableButton columnKey="markup" sortState={pricingReviewSortState} onSort={requestPricingReviewSort}>Markup</SortableButton> : null}
                        <SortableButton columnKey="sell" sortState={pricingReviewSortState} onSort={requestPricingReviewSort} align="right">{clientMode ? "Total incl GST" : "Sell / actions"}</SortableButton>
                      </div>
                      {visibleRows.map((row) => (
                        <div key={row.id} className={`grid gap-2 p-3 text-sm ${clientMode ? "lg:grid-cols-[1.35fr_145px_80px_80px_170px]" : "lg:grid-cols-[1.35fr_145px_80px_80px_95px_95px_230px]"} ${row.review_state === "excluded" ? "opacity-55" : ""} ${row.source === "triggered_auto_inclusion" && row.review_status === "auto_added_needs_review" ? "bg-amber-50/70" : ""}`}>
                          <div className={row.source === "triggered_auto_inclusion" ? "pl-4 border-l-2 border-amber-300" : ""}>
                            {row.source === "triggered_auto_inclusion" ? (
                              <p className="mb-1 text-[11px] font-medium text-amber-800">
                                Auto-included from {row.parent_source_description || "parent item"}
                              </p>
                            ) : null}
                            <Input value={row.description || row.name || ""} onChange={(event) => void updatePricingReviewRow(row, { description: event.target.value, name: event.target.value })} />
                          </div>
                          <Select value={row.category || "materials"} onValueChange={(value) => void updatePricingReviewRow(row, { category: value })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CATS.map((category) => <SelectItem key={category} value={category}>{category.replace(/_/g, " ")}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input type="number" value={row.quantity || 1} onChange={(event) => void updatePricingReviewRow(row, { quantity: Number(event.target.value) })} />
                          <Input value={row.unit || "ea"} onChange={(event) => void updatePricingReviewRow(row, { unit: event.target.value })} />
                          {!clientMode ? <Input type="number" value={row.buy_price || 0} onChange={(event) => void updatePricingReviewRow(row, { buy_price: Number(event.target.value) })} /> : null}
                          {!clientMode ? <Input type="number" value={row.markup_percent || 30} onChange={(event) => void updatePricingReviewRow(row, { markup_percent: Number(event.target.value) })} /> : null}
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="text-xs font-semibold">{clientMode ? formatQuoteListIncGst(row.total_sell_price || 0) : formatCurrency(row.total_sell_price || 0)}</span>
                            {row.source === "triggered_auto_inclusion" ? <StatusBadge label="Auto-added" color="amber" /> : null}
                            {Array.isArray(row.warnings) && row.warnings.length ? <StatusBadge label="Warning" color="amber" /> : null}
                            {!clientMode ? <Button variant="ghost" size="sm" onClick={() => void splitPricingReviewRow(row)}>Split</Button> : null}
                            {!clientMode ? <Button variant="ghost" size="sm" onClick={() => void savePricingRowAsDefault(row)}>Save default</Button> : null}
                            <Button variant="ghost" size="sm" onClick={() => void updatePricingReviewRow(row, { review_state: row.review_state === "excluded" ? "active" : "excluded", status: row.review_state === "excluded" ? "review" : "excluded" })}>
                              {row.review_state === "excluded" ? "Include" : "Exclude"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void updatePricingReviewRow(row, { review_state: "deleted", status: "deleted" })}>Delete</Button>
                          </div>
                          <p className={`text-xs text-muted-foreground ${clientMode ? "lg:col-span-5" : "lg:col-span-6"} ${row.source === "triggered_auto_inclusion" ? "pl-4" : ""}`}>
                            {[
                              row.parent_source_description ? `Auto-included from ${row.parent_source_description}` : "",
                              row.calculated_quantity ? `Calculated qty ${row.calculated_quantity}` : "",
                              row.quantity_multiplier ? `x${row.quantity_multiplier}` : "",
                              row.gst_treatment ? `GST ${row.gst_treatment}` : "",
                              !clientMode && row.source_rule_name ? `Rule ${row.source_rule_name}` : "",
                              !clientMode && row.supplier ? row.supplier : "",
                              !clientMode && (row.original_sku || row.product_number) ? row.original_sku || row.product_number : "",
                              !clientMode && row.source_page ? `page ${row.source_page}` : !clientMode && row.source_row ? `row ${row.source_row}` : "",
                              !clientMode && row.confidence_score ? `confidence ${Math.round(Number(row.confidence_score) * 100)}%` : "",
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

        </TabsContent>

        <TabsContent value="quote-list">
          <Card className="p-5 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">Quote List</h2>
                {autoAddedNeedsReviewCount ? <p className="mt-1 text-xs text-amber-700">{autoAddedNeedsReviewCount} auto-added item{autoAddedNeedsReviewCount === 1 ? "" : "s"} need review.</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void printQuoteList()}>
                  <Printer className="w-3.5 h-3.5 mr-1" />Print Quote List
                </Button>
                <Button variant="outline" size="sm" onClick={exportQuoteListToExcel}>
                  <Download className="w-3.5 h-3.5 mr-1" />Export to Excel
                </Button>
                {items.some((item) => item.source === "global_auto_inclusion" && item.review_status === "auto_added_needs_review") ? <Button variant="outline" size="sm" onClick={() => void confirmAllGlobalInclusions()}>Confirm all global auto-added</Button> : null}
                <Button size="sm" onClick={() => setShowItem(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
              </div>
            </div>
            {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No items yet. Add items to build your quote.</p>}
            {items.length ? (
              <div className={`mb-2 grid items-center gap-2 rounded-[8px] border border-border/45 bg-white/55 px-3 py-2 ${clientMode ? "md:grid-cols-[minmax(0,1fr)_80px_130px_150px]" : "md:grid-cols-[minmax(0,1fr)_80px_110px_100px_110px_170px]"}`}>
                <SortableButton columnKey="description" sortState={quoteListSortState} onSort={requestQuoteListSort}>Description</SortableButton>
                <SortableButton columnKey="qty" sortState={quoteListSortState} onSort={requestQuoteListSort} align="right">Qty</SortableButton>
                {!clientMode ? <SortableButton columnKey="cost" sortState={quoteListSortState} onSort={requestQuoteListSort} align="right">Cost</SortableButton> : null}
                {!clientMode ? <SortableButton columnKey="markup" sortState={quoteListSortState} onSort={requestQuoteListSort} align="right">Markup</SortableButton> : null}
                <SortableButton columnKey="total" sortState={quoteListSortState} onSort={requestQuoteListSort} align="right">{clientMode ? "Total incl GST" : "Total"}</SortableButton>
                <SortableButton columnKey="status" sortState={quoteListSortState} onSort={requestQuoteListSort} align="right">Actions</SortableButton>
              </div>
            ) : null}
            {sortedQuoteSections.map((section) => {
              const sectionItems = sortedQuoteItems.filter((item) => (item.section || "General") === section.label);
              return (
                <div key={section.key} className="mb-4">
                  <div className="flex justify-between rounded-t-[8px] border border-border/45 bg-[#eee7db]/70 px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</span>
                    <span className="text-xs font-semibold">
                      {clientMode
                        ? formatQuoteListIncGst(sectionItems.reduce((sum, item) => sum + (item.total || 0), 0))
                        : formatQuoteListCurrency(sectionItems.reduce((sum, item) => sum + (item.total || 0), 0))}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-b-[8px] border border-t-0 border-border/45 bg-white/55">
                    {sectionItems.map((item) => {
                      const reviewState = getQuoteItemReviewState(item);
                      return (
                      <div
                        key={item.id}
                        className={`grid gap-2 border-b border-border/35 px-3 py-3 text-sm last:border-b-0 hover:bg-muted/20 ${clientMode ? "md:grid-cols-[minmax(0,1fr)_80px_130px_150px]" : "md:grid-cols-[minmax(0,1fr)_80px_110px_100px_110px_170px]"} md:items-center ${getReviewStateRowClass(reviewState)}`}
                      >
                        <div className={`min-w-0 ${item.source === "triggered_auto_inclusion" ? "pl-4 border-l-2 border-amber-300" : ""}`}>
                          {item.source === "triggered_auto_inclusion" ? (
                            <p className="mb-1 text-[11px] font-medium text-amber-800">
                              Auto-included from {item.parent_source_description || "parent item"}
                            </p>
                          ) : null}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{item.description}</span>
                            <ReviewStateBadge state={reviewState} />
                            {item.is_optional && <StatusBadge label="Optional" color="slate" />}
                            {(item.source === "global_auto_inclusion" || item.source === "triggered_auto_inclusion") && item.review_status === "confirmed" ? <StatusBadge label="Confirmed" color="emerald" /> : null}
                            {item.source === "triggered_auto_inclusion" && item.is_manual_override ? <StatusBadge label="Manually edited" color="blue" /> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {[
                              `${item.quantity} ${item.unit}`,
                              clientMode ? "" : `${formatQuoteListCurrency(item.unit_cost)} + ${item.markup_percent}%`,
                              !clientMode && item.is_price_locked === true ? "Price locked" : "",
                              item.parent_source_description ? `Auto-included from ${item.parent_source_description}` : "",
                              !clientMode && item.source === "triggered_auto_inclusion" && item.source_rule_id ? "Triggered rule" : "",
                              item.gst_treatment ? `GST ${String(item.gst_treatment).replace(/_/g, " ")}` : "",
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className="text-right font-medium">{Number(item.quantity || 0)}</span>
                        {!clientMode ? <span className="text-right font-medium">{formatQuoteListCurrency(item.unit_cost)}</span> : null}
                        {!clientMode ? <span className="text-right font-medium">{Number(item.markup_percent || 0).toFixed(1)}%</span> : null}
                        <span className="text-right font-semibold">{clientMode ? formatQuoteListIncGst(item.total, getQuoteItemGstRate(item)) : formatQuoteListCurrency(item.total)}</span>
                        <div className="flex items-center justify-end gap-3">
                          {item.source === "global_auto_inclusion" && item.review_status === "auto_added_needs_review" ? (
                            <Button variant="ghost" size="sm" onClick={() => void confirmGlobalInclusion(item.id)}>Confirm</Button>
                          ) : null}
                          {item.source === "triggered_auto_inclusion" && item.review_status === "auto_added_needs_review" ? (
                            <Button variant="ghost" size="sm" onClick={() => void confirmTriggeredInclusion(item.id)}>Confirm</Button>
                          ) : null}
                          {!clientMode ? (
                            <button
                              onClick={() => void toggleItemPriceLock(item)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              aria-label={item.is_price_locked === true ? "Unlock line item pricing" : "Lock line item pricing"}
                            >
                              {item.is_price_locked === true ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                          ) : null}
                          {!clientMode ? (
                            <button
                              type="button"
                              aria-label="Save line item defaults"
                              onClick={() => openSaveDefaultsDialog(item)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                            >
                              <Briefcase className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                          <button aria-label="Edit line item" onClick={() => openEditItem(item)} className="text-muted-foreground hover:text-primary transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button aria-label="Delete line item" onClick={() => void deleteItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Card>
        </TabsContent>

        <TabsContent value="scenarios">
          <Card className="p-5 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-sm">Quote Gross Margin Scenarios</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  These scenarios are built from the current quote list. Labour stays excluded from gross margin, and locked line items are left unchanged.
                </p>
              </div>
              <StatusBadge label={`${quoteGrossMarginScenarios.length} scenarios`} color="blue" />
            </div>

            {quoteGrossMarginScenarios.length === 0 ? (
              <div className="rounded-lg border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                Add active quote line items to see quote-specific gross margin scenarios here.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                {quoteGrossMarginScenarios.map((scenario) => {
                  const tone = getMarginTone(scenario.targetMarginPercent);
                  const isCurrentScenario = Math.abs(Number(quoteMarginSummary.gross.marginPercent || 0) - Number(scenario.targetMarginPercent || 0)) < 0.05;
                  return (
                    <Card key={scenario.name} className={`p-4 ${tone.cardClass}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Scenario</p>
                          <p className={`text-lg font-bold ${tone.valueClass}`}>{scenario.targetMarginPercent.toFixed(0)}%</p>
                        </div>
                        <StatusBadge
                          label={isCurrentScenario ? "Current" : scenario.deltaExGst >= 0 ? "Increase" : "Reduce"}
                          color={isCurrentScenario ? "blue" : tone.badgeColor}
                        />
                      </div>
                      <p className="mt-1 text-sm font-medium">{scenario.name}</p>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>Ex GST {formatQuoteListCurrency(scenario.subtotalExGst)}</p>
                        <p>Inc GST {formatQuoteListCurrency(scenario.totalIncGst)}</p>
                        <p>Gross profit {formatQuoteListCurrency(scenario.totalProfit)}</p>
                        <p>Change {scenario.deltaExGst >= 0 ? "+" : ""}{formatQuoteListCurrency(scenario.deltaExGst)}</p>
                        <p>{scenario.affectedLineItemCount} line items adjusted</p>
                        {scenario.lockedLineItemCount > 0 ? <p>{scenario.lockedLineItemCount} locked item{scenario.lockedLineItemCount === 1 ? "" : "s"} left unchanged</p> : null}
                        <p>Labour excluded {formatQuoteListCurrency(scenario.labourCostExcluded)} cost</p>
                      </div>
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setGrossMarginTarget(String(scenario.targetMarginPercent));
                            openMarginAdjustmentDialog("gross");
                          }}
                        >
                          Apply scenario
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="files" className="jf-document-workspace">
          <Card className="jf-document-panel p-5 mb-5">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">Quote Files</h2>
                <p className="mt-1 text-sm text-muted-foreground">Plans, generated PDFs, supplier quotes, revision notes, and production references for this quote.</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => void uploadFiles(event.target.files)}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  void uploadFiles(event.dataTransfer.files);
                }}
                className={`jf-document-dropzone p-8 text-center ${dragActive ? "jf-document-dropzone-active" : ""}`}
              >
                <UploadCloud className="w-8 h-8 mx-auto mb-3 text-primary" />
                <p className="text-base font-semibold">{uploading ? "Uploading files..." : "Drop files here to upload"}</p>
                <p className="text-sm text-muted-foreground mt-1">{ATTACHMENT_HELP_TEXT}</p>
                <div className="mt-4">
                  <span className="inline-flex items-center rounded-md bg-[#4f5148] px-3 py-2 text-sm font-medium text-white">
                    Choose Files
                  </span>
                </div>
              </button>

              {uploadError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {uploadError}
                </div>
              )}

              {visibleAttachments.length === 0 ? (
                <div className="rounded-[10px] border border-dashed bg-white/50 px-4 py-10 text-center text-sm text-muted-foreground">
                  No files uploaded for this quote yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {hasOlderAttachmentVersions || hasHiddenBackupAttachments ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {hasHiddenBackupAttachments ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-9 rounded-md"
                        onClick={() => setShowBackupAttachments((current) => !current)}
                        >
                          {showBackupAttachments ? "Hide backup files" : "Show backup files"}
                        </Button>
                      ) : null}
                      {hasOlderAttachmentVersions ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-9 rounded-md"
                        onClick={() => setShowOlderAttachmentVersions((current) => !current)}
                      >
                        {showOlderAttachmentVersions ? "Hide older versions" : "Show older versions"}
                      </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleAttachments.map((attachment) => {
                    const kind = getAttachmentKind(attachment);
                    const currentVersionNumber = Math.max(1, Number(attachment.current_version || attachment.version_count || 1));
                    const versionHistory = attachmentVersionsByAttachmentId[String(attachment.id || "")];
                    const olderVersions = Array.isArray(versionHistory?.rows)
                      ? versionHistory.rows.filter((version) => (
                        Number(version.version_number || 0) < currentVersionNumber
                        && (showBackupAttachments || !isBackupAttachmentFile(version))
                      ))
                      : [];
                    const versionLoadState = attachmentVersionLoadStateById[String(attachment.id || "")] || "idle";
                    return (
                      <div key={attachment.id} className="jf-document-card">
                        <div className="jf-document-card-preview flex aspect-[4/3] items-center justify-center overflow-hidden">
                          {kind === "image" ? (
                            <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
                          ) : kind === "pdf" ? (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <FileText className="w-10 h-10" />
                              <span className="text-xs font-medium uppercase tracking-wide">PDF Document</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <FileImage className="w-10 h-10" />
                              <span className="text-xs font-medium uppercase tracking-wide">File</span>
                            </div>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-muted-foreground">
                              {kind === "image" ? <FileImage className="w-4 h-4" /> : kind === "pdf" ? <FileText className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold">{attachment.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {[formatFileSize(attachment.size), formatDate(attachment.updated_date || attachment.created_date)].filter(Boolean).join(" · ")}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <StatusBadge label={getAttachmentSourceLabel(attachment)} color={attachment.source === "pricing-import" ? "blue" : "slate"} />
                                {attachment.supplier_name ? <StatusBadge label={attachment.supplier_name} color="emerald" /> : null}
                                {Number(attachment.version_count || 1) > 1 ? <StatusBadge label="Current version" color="emerald" /> : null}
                              </div>
                            </div>
                          </div>
                          {attachment.document_information ? (
                            <p className="mt-3 line-clamp-3 rounded-md border border-border/35 bg-[#f8f4ed]/70 px-3 py-2 text-xs text-muted-foreground">
                              {attachment.document_information}
                            </p>
                          ) : null}
                          <div className="mt-3 space-y-1">
                            <Label className="text-xs">Document Information</Label>
                            <Textarea
                              rows={3}
                              value={attachment.document_information || ""}
                              onChange={(event) => setAttachments((current) => current.map((row) => row.id === attachment.id ? { ...row, document_information: event.target.value } : row))}
                              onBlur={(event) => void updateAttachmentDocumentInformation(attachment, event.target.value)}
                              placeholder="Supplier quote details, revision notes, assumptions, exclusions..."
                            />
                          </div>
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" className="min-h-9 rounded-md" onClick={() => setVersionAttachment(attachment)}>
                              Versions
                            </Button>
                            <Button size="sm" className="min-h-9 rounded-md bg-[#4f5148] text-white hover:bg-[#3f4239]" asChild>
                              <a href={attachment.url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            </Button>
                          </div>
                          {showOlderAttachmentVersions && Number(attachment.version_count || 1) > 1 ? (
                            <div className="mt-4 border-t border-border/45 pt-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Older versions</p>
                                <span className="text-xs text-muted-foreground">{olderVersions.length} shown</span>
                              </div>
                              {versionLoadState === "loading" ? (
                                <p className="text-xs text-muted-foreground">Loading older versions...</p>
                              ) : versionHistory?.error ? (
                                <p className="text-xs text-destructive">{versionHistory.error}</p>
                              ) : olderVersions.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No older versions recorded for this file.</p>
                              ) : (
                                <div className="space-y-2">
                                  {olderVersions.map((version) => (
                                    <div key={version.id} className="rounded-[8px] border border-border/45 bg-[#f8f4ed]/70 px-3 py-2 text-xs text-muted-foreground">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-foreground">Version {version.version_number}</span>
                                            <span>{formatDate(version.created_date)}</span>
                                          </div>
                                          <p className="truncate">{version.name || version.stored_name}</p>
                                          <p>{version.actor_name || version.actor_email || "System upload"}</p>
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                          <Button type="button" variant="ghost" size="sm" asChild>
                                            <a href={version.url} target="_blank" rel="noreferrer">Open</a>
                                          </Button>
                                          <Button type="button" variant="ghost" size="sm" asChild>
                                            <a href={version.url} download={version.name || version.stored_name}>Download</a>
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Approval and Revision History</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Approved versions stay preserved so pricing and scope changes are easy to check later.
                </p>
              </div>
              <StatusBadge label={`${revisionHistory.length} revision${revisionHistory.length === 1 ? "" : "s"}`} color={revisionHistory.length ? "amber" : "slate"} />
            </div>
            <div className="mt-4 space-y-3">
              {approvalSnapshots.length === 0 && revisionHistory.length === 0 ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No approval snapshots or revisions have been recorded yet.
                </div>
              ) : null}
              {approvalSnapshots.map((snapshot) => (
                <div key={snapshot.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{String(snapshot.type || "quote").replace(/_/g, " ")} approval</p>
                      <p className="text-xs text-muted-foreground">
                        {snapshot.approval_date} by {snapshot.approved_by || "JoinerFlow"}
                      </p>
                    </div>
                    <StatusBadge label={formatQuoteListCurrency(snapshot.approved_totals?.total || 0)} color="emerald" />
                  </div>
                  {snapshot.approval_notes ? <p className="mt-2 text-sm text-muted-foreground">{snapshot.approval_notes}</p> : null}
                </div>
              ))}
              {revisionHistory.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Revision {entry.revision}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString("en-NZ") : "Date not recorded"} by {entry.changed_by || "JoinerFlow"}
                      </p>
                    </div>
                    <StatusBadge label={String(entry.change_type || "quote edit").replace(/_/g, " ")} color="amber" />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{entry.summary || "Approved quote changed."}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Previous approved total preserved: {formatQuoteListCurrency(entry.approved_totals_preserved?.total || 0)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
          <RecordAuditPanel entityName="Quote" recordId={id} title="Quote Change History" limit={20} />
        </TabsContent>
      </Tabs>

      <Dialog open={showItem} onOpenChange={setShowItem}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
            <DialogDescription>Add a priced row to the quote list and assign its category and section.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Description *</Label><Input value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={itemForm.category} onValueChange={(value) => handleItemCategoryChange(value, "add")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    <SelectItem value={ADD_PRICING_CATEGORY_VALUE}>+ Add new category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Section</Label>
                <Select value={itemForm.section_key || "general"} onValueChange={(value) => applySectionSelection(value, "add")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activeQuoteSectionOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    <SelectItem value={ADD_PRICING_SECTION_VALUE}>+ Add new section</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div><Label>Qty</Label><Input type="number" value={itemForm.quantity} onChange={(event) => setItemForm({ ...itemForm, quantity: parseFloat(event.target.value) || 1 })} /></div>
              <div><Label>Unit</Label><Input value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} /></div>
              <div><Label>Cost</Label><Input type="number" value={itemForm.unit_cost} onChange={(event) => setItemForm({ ...itemForm, unit_cost: parseFloat(event.target.value) || 0 })} /></div>
              <div><Label>Markup%</Label><Input type="number" value={itemForm.markup_percent} onChange={(event) => setItemForm({ ...itemForm, markup_percent: parseFloat(event.target.value) || 0 })} /></div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg flex justify-between text-sm">
              <span className="text-muted-foreground">Line Total</span>
              <span className="font-bold">{formatCurrency(sellTotal)}</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={itemForm.is_price_locked === true}
                onChange={(event) => setItemForm({ ...itemForm, is_price_locked: event.target.checked })}
              />
              Lock markup and sell price for future margin adjustments
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowItem(false)}>Cancel</Button>
              <Button onClick={() => void addItem()} disabled={!itemForm.description}>Add Item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Line Item</DialogTitle>
            <DialogDescription>Update this quote row, including its section, cost, markup, and locked price settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Description *</Label><Input value={editItemForm.description} onChange={(event) => setEditItemForm({ ...editItemForm, description: event.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={editItemForm.category} onValueChange={(value) => handleItemCategoryChange(value, "edit")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {pricingCategoryOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    <SelectItem value={ADD_PRICING_CATEGORY_VALUE}>+ Add new category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Section</Label>
                <Select value={editItemForm.section_key || buildPricingSectionRecord(editItemForm.section || "General").key} onValueChange={(value) => applySectionSelection(value, "edit")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {quoteScopedSectionOptions.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    {!quoteScopedSectionOptions.some((option) => option.value === (editItemForm.section_key || buildPricingSectionRecord(editItemForm.section || "General").key))
                      ? <SelectItem value={editItemForm.section_key || buildPricingSectionRecord(editItemForm.section || "General").key}>{editItemForm.section || "General"}</SelectItem>
                      : null}
                    <SelectItem value={ADD_PRICING_SECTION_VALUE}>+ Add new section</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div><Label>Qty</Label><Input type="number" value={editItemForm.quantity} onChange={(event) => setEditItemForm({ ...editItemForm, quantity: parseFloat(event.target.value) || 1 })} /></div>
              <div><Label>Unit</Label><Input value={editItemForm.unit} onChange={(event) => setEditItemForm({ ...editItemForm, unit: event.target.value })} /></div>
              <div><Label>Cost</Label><Input type="number" value={editItemForm.unit_cost} onChange={(event) => setEditItemForm({ ...editItemForm, unit_cost: parseFloat(event.target.value) || 0 })} /></div>
              <div><Label>Markup%</Label><Input type="number" value={editItemForm.markup_percent} onChange={(event) => setEditItemForm({ ...editItemForm, markup_percent: parseFloat(event.target.value) || 0 })} /></div>
            </div>
            <div className="bg-muted/50 p-3 rounded-lg flex justify-between text-sm">
              <span className="text-muted-foreground">Line Total</span>
              <span className="font-bold">{formatCurrency(editSellTotal)}</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={editItemForm.is_price_locked === true}
                onChange={(event) => setEditItemForm({ ...editItemForm, is_price_locked: event.target.checked })}
              />
              Lock markup and sell price for future margin adjustments
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={editItemSaveAsDefault}
                onChange={(event) => setEditItemSaveAsDefault(event.target.checked)}
              />
              Save cost, category, and section as the default for future imports
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button onClick={() => void updateItem()} disabled={!editItemForm.description}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(saveDefaultsItem)} onOpenChange={(open) => !open && closeSaveDefaultsDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save line item defaults</DialogTitle>
            <DialogDescription>
              Choose which parts of this quote line item should become the default for future imports of the same item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <p className="font-medium">{saveDefaultsItem?.description || "Quote line item"}</p>
              <p className="mt-1 text-muted-foreground">
                {[
                  saveDefaultsItem?.category || "",
                  saveDefaultsItem?.section || "",
                  `${formatQuoteListCurrency(saveDefaultsItem?.unit_cost || 0)} cost`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={saveDefaultsFields.price}
                  onChange={(event) => setSaveDefaultsFields((current) => ({ ...current, price: event.target.checked }))}
                />
                <span>
                  <span className="block font-medium">Price</span>
                  <span className="text-muted-foreground">Save the current cost, markup, and unit for future imports.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={saveDefaultsFields.category}
                  onChange={(event) => setSaveDefaultsFields((current) => ({ ...current, category: event.target.checked }))}
                />
                <span>
                  <span className="block font-medium">Category</span>
                  <span className="text-muted-foreground">Save the current category assignment for future imports.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={saveDefaultsFields.section}
                  onChange={(event) => setSaveDefaultsFields((current) => ({ ...current, section: event.target.checked }))}
                />
                <span>
                  <span className="block font-medium">Section</span>
                  <span className="text-muted-foreground">Save the current quote section so future imports group this item automatically.</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeSaveDefaultsDialog} disabled={savingDefaults}>Cancel</Button>
              <Button onClick={() => void saveQuoteListItemAsDefault()} disabled={savingDefaults}>
                {savingDefaults ? "Saving..." : "Save defaults"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewCategoryDialog} onOpenChange={setShowNewCategoryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
            <DialogDescription>Create a reusable pricing category for quote line items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category name</Label>
              <Input
                value={newCategoryName}
                onChange={(event) => {
                  setNewCategoryName(event.target.value);
                  if (newCategoryError) setNewCategoryError("");
                }}
                placeholder="Enter a new category"
              />
              {newCategoryError ? <p className="mt-2 text-sm text-destructive">{newCategoryError}</p> : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewCategoryDialog(false)}>Cancel</Button>
              <Button onClick={() => void saveNewQuoteItemCategory()}>Save category</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showNewSectionDialog} onOpenChange={setShowNewSectionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new pricing section</DialogTitle>
            <DialogDescription>Create a quote-list section for grouping line items and generated documents.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Section name</Label>
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
                    void saveNewQuoteItemSection();
                  }
                }}
                placeholder="e.g. Stone, Appliances, Delivery"
              />
            </div>
            {newSectionError ? <p className="text-sm text-destructive">{newSectionError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewSectionDialog(false)}>Cancel</Button>
              <Button onClick={() => void saveNewQuoteItemSection()}>Save section</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showGlobalInclusionSectionDialog}
        onOpenChange={(open) => {
          setShowGlobalInclusionSectionDialog(open);
          if (!open) {
            setGlobalInclusionSectionError("");
            setPendingGlobalInclusionConfirm({ mode: "single", itemId: "" });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pendingGlobalInclusionConfirm.mode === "all" ? "Confirm Every Job Inclusions" : "Confirm Every Job Inclusion"}</DialogTitle>
            <DialogDescription>
              Choose which quote section the confirmed Every Job Inclusion items should be allocated to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which quote section {pendingGlobalInclusionConfirm.mode === "all" ? "these inclusions should" : "this inclusion should"} be allocated to.
            </p>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={globalInclusionSectionValue} onValueChange={(value) => applySectionSelection(value, "global-confirm")}>
                <SelectTrigger><SelectValue placeholder="Select a section" /></SelectTrigger>
                <SelectContent>
                  {activeQuoteSectionOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                  <SelectItem value={ADD_PRICING_SECTION_VALUE}>+ Add new section</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {globalInclusionSectionError ? <p className="text-sm text-destructive">{globalInclusionSectionError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowGlobalInclusionSectionDialog(false);
                  setGlobalInclusionSectionError("");
                  setPendingGlobalInclusionConfirm({ mode: "single", itemId: "" });
                }}
              >
                Cancel
              </Button>
              <Button onClick={() => void submitGlobalInclusionSectionConfirmation()}>Confirm</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingMarginAdjustment)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingMarginAdjustment(null);
            setIncludeLockedMarginItems(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pendingMarginAdjustment?.mode === "material" ? "Apply target material margin" : "Apply target gross margin"}
            </DialogTitle>
            <DialogDescription>
              We’ll update the eligible quote line items and recalculate the quote totals for this quote only.
            </DialogDescription>
          </DialogHeader>
          {marginAdjustmentPreview ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Current margin</p>
                  <p className="mt-1 text-lg font-semibold">{marginAdjustmentPreview.currentMarginPercent.toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Target margin</p>
                  <p className="mt-1 text-lg font-semibold">{Number(pendingMarginAdjustment.targetMarginPercent || 0).toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Affected line items</p>
                  <p className="mt-1 text-lg font-semibold">{marginAdjustmentPreview.eligibleItems.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Locked / excluded</p>
                  <p className="mt-1 text-lg font-semibold">
                    {marginAdjustmentPreview.lockedItems.length} / {marginAdjustmentPreview.excludedItems.length}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Current sell</p>
                  <p className="mt-1 font-semibold">{formatQuoteListCurrency(marginAdjustmentPreview.currentSellTotal)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">New sell</p>
                  <p className="mt-1 font-semibold">{formatQuoteListCurrency(marginAdjustmentPreview.targetSellTotal)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Estimated change</p>
                  <p className="mt-1 font-semibold">{formatQuoteListCurrency(marginAdjustmentPreview.delta)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Line items to update</p>
                    <p className="text-xs text-muted-foreground">
                      Review the quote lines that will be repriced before you confirm this scenario.
                    </p>
                  </div>
                  <StatusBadge label={`${marginAdjustmentPreview.updates.length} item${marginAdjustmentPreview.updates.length === 1 ? "" : "s"}`} color="blue" />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  <div className="divide-y">
                    {marginAdjustmentPreview.updates.map((entry) => (
                      <div
                        key={entry.item.id || entry.item.description || `${entry.item.category}-${entry.quantity}`}
                        className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
                      >
                        <div className="min-w-0">
                          <p className="font-medium break-words">{entry.item.description || "Quote line item"}</p>
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {[entry.item.category || "", entry.item.section || "", entry.item.unit || ""].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/20 p-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qty</p>
                            <p className="mt-1 text-right font-medium">{Number(entry.quantity || 0)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cost</p>
                            <p className="mt-1 text-right font-medium">{formatQuoteListCurrency(entry.costTotal)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current total</p>
                            <p className="mt-1 text-right font-medium">{formatQuoteListCurrency(entry.currentTotal)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New total</p>
                            <p className="mt-1 text-right font-semibold">{formatQuoteListCurrency(entry.nextTotal)}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">New markup</p>
                            <p className="mt-1 text-right font-medium">{Number(entry.nextMarkupPercent || 0).toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {marginAdjustmentPreview.lockedItems.length > 0 ? (
                <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    checked={includeLockedMarginItems}
                    onChange={(event) => setIncludeLockedMarginItems(event.target.checked)}
                  />
                  Include locked line items in this adjustment
                </label>
              ) : null}

              {!includeLockedMarginItems && marginAdjustmentPreview.lockedItems.length > 0 ? (
                <p className="text-sm text-amber-700">Some line items are locked and will not be adjusted.</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingMarginAdjustment(null);
                    setIncludeLockedMarginItems(false);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={() => void applyMarginAdjustment()} disabled={applyingMarginAdjustment || !marginAdjustmentPreview.eligibleItems.length}>
                  {applyingMarginAdjustment ? "Applying..." : "Apply changes"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingQuote} onOpenChange={setEditingQuote}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Quote</DialogTitle>
            <DialogDescription>Update the quote details, linked customer, site address, notes, and validity date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={qForm.title || ""} onChange={(event) => setQForm({ ...qForm, title: event.target.value })} /></div>
            <div>
              <Label>Existing Contact</Label>
              <Select
                value={qForm.contact_id || "__none"}
                onValueChange={(value) => {
                  if (value === "__none") {
                    setQForm({ ...qForm, contact_id: "", contact_name: "", company_id: "", company_name: "" });
                    return;
                  }

                  const selectedContact = contacts.find((contact) => contact.id === value);
                  setQForm({
                    ...qForm,
                    contact_id: value,
                    contact_name: selectedContact ? getContactDisplayName(selectedContact) : qForm.contact_name,
                    company_id: selectedContact?.company_id || "",
                    company_name: selectedContact?.company_name || "",
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No existing contact</SelectItem>
                  {sortedContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {`${getContactDisplayName(contact)}${contact.company_name ? ` · ${contact.company_name}` : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!qForm.contact_id && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Client Name</Label><Input value={qForm.contact_name || ""} onChange={(event) => setQForm({ ...qForm, contact_name: event.target.value })} /></div>
                <div><Label>Company Name</Label><Input value={qForm.company_name || ""} onChange={(event) => setQForm({ ...qForm, company_name: event.target.value })} /></div>
              </div>
            )}
            <div>
              <Label>Site Address</Label>
              <AddressAutocompleteInput
                value={qForm.site_address || ""}
                onChange={(nextValue) => setQForm({ ...qForm, site_address: nextValue })}
              />
            </div>
            <div><Label>Notes</Label><Textarea value={qForm.notes || ""} onChange={(event) => setQForm({ ...qForm, notes: event.target.value })} rows={3} /></div>
            <div><Label>Exclusions</Label><Textarea value={qForm.exclusions || ""} onChange={(event) => setQForm({ ...qForm, exclusions: event.target.value })} rows={2} /></div>
            <div><Label>Valid Until</Label><Input type="date" value={qForm.valid_until || ""} onChange={(event) => setQForm({ ...qForm, valid_until: event.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingQuote(false)}>Cancel</Button>
              <Button onClick={() => void saveQuote()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocumentGenerator} onOpenChange={setShowDocumentGenerator}>
        <DialogContent className="jf-document-workspace max-h-[92vh] max-w-6xl overflow-hidden p-0">
          <div className="flex max-h-[92vh] flex-col">
            <DialogHeader className="border-b border-border/45 bg-[#fbfaf7] px-6 py-4">
              <DialogTitle>Generate Quote/Contract</DialogTitle>
              <DialogDescription>Architectural document workspace for client-ready quotes, contracts, and generated PDFs.</DialogDescription>
            </DialogHeader>
            {quoteDocument ? (
              <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="min-h-0 overflow-y-auto border-r border-border/45 bg-[#f8f4ed]/45 px-6 py-4">
                  <div className="space-y-5">
                    <DocumentEditorSection
                      title="Document Setup"
                      isOpen={documentEditorSections.documentSetup !== false}
                      onToggle={() => toggleDocumentEditorSection("documentSetup")}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Document Type</Label>
                          <Select value={quoteDocument.documentType || "contract"} onValueChange={(value) => void changeQuoteDocumentType(value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="quote">Quote</SelectItem>
                              <SelectItem value="contract">Contract</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Template</Label>
                          <Select value={selectedDocumentTemplateId || "default"} onValueChange={(value) => setSelectedDocumentTemplateId(value === "default" ? "" : value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Default template</SelectItem>
                              {documentTemplates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Issue Date</Label>
                          <Input type="date" value={quoteDocument.issueDate || ""} onChange={(event) => updateQuoteDocument({ issueDate: event.target.value })} />
                        </div>
                      </div>
                    </DocumentEditorSection>

                    <DocumentEditorSection
                      title="Client Details"
                      isOpen={documentEditorSections.clientDetails !== false}
                      onToggle={() => toggleDocumentEditorSection("clientDetails")}
                    >
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-2 sm:col-span-3">
                          <Label>Customer Name *</Label>
                          <Input value={quoteDocument.customerName || ""} onChange={(event) => updateQuoteDocument({ customerName: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={quoteDocument.customerPhone || ""} onChange={(event) => updateQuoteDocument({ customerPhone: event.target.value })} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label>Email</Label>
                          <Input type="email" value={quoteDocument.customerEmail || ""} onChange={(event) => updateQuoteDocument({ customerEmail: event.target.value })} />
                        </div>
                      </div>
                    </DocumentEditorSection>

                    <DocumentEditorSection
                      title="Scope"
                      isOpen={documentEditorSections.jobDetails !== false}
                      onToggle={() => toggleDocumentEditorSection("jobDetails")}
                    >
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label>Job Name *</Label>
                          <Input value={quoteDocument.jobName || ""} onChange={(event) => updateQuoteDocument({ jobName: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Job Address</Label>
                          <AddressAutocompleteInput
                            value={quoteDocument.jobAddress || ""}
                            onChange={(nextValue) => updateQuoteDocument({ jobAddress: nextValue })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Job Notes</Label>
                          <Textarea rows={3} value={quoteDocument.jobNotes || ""} onChange={(event) => updateQuoteDocument({ jobNotes: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Scope Notes</Label>
                          <Textarea rows={3} value={quoteDocument.scopeNotes || ""} onChange={(event) => updateQuoteDocument({ scopeNotes: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Specifications / Materials / Hardware</Label>
                          <Textarea rows={5} value={quoteDocument.specificationNotes || ""} onChange={(event) => updateQuoteDocument({ specificationNotes: event.target.value })} />
                        </div>
                      </div>
                    </DocumentEditorSection>

                    <DocumentEditorSection
                      title="Quote Line Items"
                      isOpen={documentEditorSections.lineItems !== false}
                      onToggle={() => toggleDocumentEditorSection("lineItems")}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">Quote Line Items</p>
                          <StatusBadge label={`${quoteDocument.lineItems?.length || 0} lines`} color="blue" />
                        </div>
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {(quoteDocument.lineItems || []).map((line, index) => (
                            <div key={`${line.description}-${index}`} className="grid gap-2 rounded-[8px] border border-border/45 bg-white/65 p-2 sm:grid-cols-[1fr_70px_70px_105px]">
                              <Input value={line.description || ""} onChange={(event) => {
                                const nextLines = [...(quoteDocument.lineItems || [])];
                                nextLines[index] = { ...line, description: event.target.value };
                                updateQuoteDocument({ lineItems: nextLines });
                              }} />
                              <Input type="number" value={line.quantity || 0} onChange={(event) => {
                                const nextLines = [...(quoteDocument.lineItems || [])];
                                nextLines[index] = { ...line, quantity: Number(event.target.value || 0) };
                                updateQuoteDocument({ lineItems: nextLines });
                              }} />
                              <Input value={line.unit || "ea"} onChange={(event) => {
                                const nextLines = [...(quoteDocument.lineItems || [])];
                                nextLines[index] = { ...line, unit: event.target.value };
                                updateQuoteDocument({ lineItems: nextLines });
                              }} />
                              <Input type="number" value={line.total || 0} onChange={(event) => {
                                const nextLines = [...(quoteDocument.lineItems || [])];
                                nextLines[index] = { ...line, total: Number(event.target.value || 0) };
                                updateQuoteDocument({ lineItems: nextLines });
                              }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </DocumentEditorSection>

                    <DocumentEditorSection
                      title="Pricing"
                      isOpen={documentEditorSections.pricing !== false}
                      onToggle={() => toggleDocumentEditorSection("pricing")}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Sub-Total Ex GST</Label>
                          <Input type="number" value={quoteDocument.subtotalExGst || 0} onChange={(event) => updateQuoteDocument({ subtotalExGst: Number(event.target.value || 0) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>GST Amount</Label>
                          <Input type="number" value={quoteDocument.gstAmount || 0} onChange={(event) => updateQuoteDocument({ gstAmount: Number(event.target.value || 0) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Total Inc GST *</Label>
                          <Input type="number" value={quoteDocument.totalIncGst || 0} onChange={(event) => updateQuoteDocument({ totalIncGst: Number(event.target.value || 0) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Deposit</Label>
                          <Input type="number" value={quoteDocument.depositAmount || 0} onChange={(event) => updateQuoteDocument({ depositAmount: Number(event.target.value || 0) })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Balance Due</Label>
                          <Input type="number" value={quoteDocument.balanceDue || 0} onChange={(event) => updateQuoteDocument({ balanceDue: Number(event.target.value || 0) })} />
                        </div>
                      </div>
                    </DocumentEditorSection>

                    {quoteDocument.documentType === "contract" ? (
                      <div className="space-y-5">
                        <DocumentEditorSection
                          title="Payment Terms"
                          isOpen={documentEditorSections.paymentTerms !== false}
                          onToggle={() => toggleDocumentEditorSection("paymentTerms")}
                        >
                          <div className="space-y-2">
                            <Label>Payment Terms</Label>
                            <Textarea rows={3} value={quoteDocument.paymentTerms || ""} onChange={(event) => updateQuoteDocument({ paymentTerms: event.target.value })} />
                          </div>
                        </DocumentEditorSection>
                        <DocumentEditorSection
                          title="Disclaimer"
                          isOpen={documentEditorSections.disclaimer !== false}
                          onToggle={() => toggleDocumentEditorSection("disclaimer")}
                        >
                          <div className="space-y-2">
                            <Label>Disclaimer</Label>
                            <Textarea rows={5} value={quoteDocument.disclaimer || ""} onChange={(event) => updateQuoteDocument({ disclaimer: event.target.value })} />
                          </div>
                        </DocumentEditorSection>
                      </div>
                    ) : null}
                    <DocumentEditorSection
                      title="Terms and Conditions"
                      isOpen={documentEditorSections.termsAndConditions !== false}
                      onToggle={() => toggleDocumentEditorSection("termsAndConditions")}
                    >
                      <div className="space-y-2">
                        <Label>Terms and Conditions</Label>
                        {(quoteDocument.termsSections || []).map((section, index) => (
                          <div key={`${section.title}-${index}`} className="space-y-2 rounded-[8px] border border-border/45 bg-white/65 p-2">
                            <Input value={section.title || ""} onChange={(event) => {
                              const nextSections = [...(quoteDocument.termsSections || [])];
                              nextSections[index] = { ...section, title: event.target.value };
                              updateQuoteDocument({ termsSections: nextSections });
                            }} />
                            <Textarea rows={3} value={section.body || ""} onChange={(event) => {
                              const nextSections = [...(quoteDocument.termsSections || [])];
                              nextSections[index] = { ...section, body: event.target.value };
                              updateQuoteDocument({ termsSections: nextSections });
                            }} />
                          </div>
                        ))}
                      </div>
                    </DocumentEditorSection>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col bg-[#2f2c28]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#fbfaf7] px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {quoteDocumentErrors.map((error) => <StatusBadge key={error} label={error} color="red" />)}
                      {quoteDocumentWarnings.map((warning) => <StatusBadge key={warning} label={warning} color="amber" />)}
                      {generatedDocumentAttachment ? <StatusBadge label="PDF generated" color="emerald" /> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="min-h-9 rounded-md" onClick={() => void previewQuoteDocument()} disabled={generatingDocument}>Preview</Button>
                      <Button variant="outline" size="sm" className="min-h-9 rounded-md" onClick={() => void printQuoteDocument()} disabled={generatingDocument}>
                        <Printer className="mr-2 h-4 w-4" />
                        Print
                      </Button>
                      <Button size="sm" className="min-h-9 rounded-md bg-[#4f5148] text-white hover:bg-[#3f4239]" onClick={() => void generateQuoteDocument()} disabled={generatingDocument || quoteDocumentErrors.length > 0}>Generate PDF</Button>
                      {generatedDocumentAttachment ? (
                        <Button size="sm" variant="outline" className="min-h-9 rounded-md" asChild>
                          <a href={generatedDocumentAttachment.url} target="_blank" rel="noreferrer">Download PDF</a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <iframe
                    title="Quote document preview"
                    className="m-4 min-h-[680px] flex-1 rounded-[8px] bg-white shadow-2xl"
                    srcDoc={quoteDocumentPreviewHtml ? enhancePrintableDocumentHtml(quoteDocumentPreviewHtml) : "<p style='font-family: sans-serif; padding: 24px;'>Preview will appear here.</p>"}
                  />
                </div>
              </div>
            ) : (
              <div className="p-8 text-sm text-muted-foreground">Preparing document...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWinDialog} onOpenChange={setShowWinDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert Quote To Job</DialogTitle>
            <DialogDescription>Choose the job number that will be created from this won quote.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Job Number</Label>
              <Input
                value={jobNumber}
                onChange={(event) => setJobNumber(event.target.value)}
                placeholder="e.g. JOB-0042"
              />
            </div>
            {jobNumberError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {jobNumberError}
              </div>
            )}
            <div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              Quote approvals, variations, and handoff notes will move with the new job so workshop planning starts with the full commercial context.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWinDialog(false)}>Cancel</Button>
              <Button onClick={() => void handleConfirmWon()} disabled={!jobNumber.trim()}>
                Convert Quote
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewAttachment)} onOpenChange={(open) => !open && setPreviewAttachment(null)}>
        <DialogContent className="jf-document-workspace max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewAttachment?.name || "File Preview"}</DialogTitle>
            <DialogDescription>Review the selected quote file and update its document information.</DialogDescription>
          </DialogHeader>
          {previewAttachment ? (
            <div className="space-y-2">
              <Label>Document Information</Label>
              <Textarea
                rows={3}
                value={previewAttachment.document_information || ""}
                onChange={(event) => setPreviewAttachment((current) => current ? { ...current, document_information: event.target.value } : current)}
                onBlur={(event) => void updateAttachmentDocumentInformation(previewAttachment, event.target.value)}
              />
            </div>
          ) : null}
          {previewAttachment && getAttachmentKind(previewAttachment) === "image" && (
            <div className="jf-document-preview-shell max-h-[75vh] overflow-auto rounded-[10px] border border-border/45 p-4">
              <img src={previewAttachment.url} alt={previewAttachment.name} className="jf-document-preview-page h-auto w-full" />
            </div>
          )}
          {previewAttachment && getAttachmentKind(previewAttachment) === "pdf" && (
            <div className="jf-document-preview-shell rounded-[10px] border border-border/45 p-3">
              <iframe
                src={previewAttachment.url}
                title={previewAttachment.name}
                className="jf-document-preview-page h-[75vh] w-full"
              />
            </div>
          )}
          {previewAttachment && getAttachmentKind(previewAttachment) === "file" && (
            <div className="rounded-[10px] border border-border/45 bg-[#f8f4ed]/70 p-6 text-sm">
              <p className="font-medium">This file type cannot be previewed inside JoinerFlow.</p>
              <p className="mt-1 text-muted-foreground">Open it in the right program to check the document.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <a href={previewAttachment.url} target="_blank" rel="noreferrer">Open File</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={previewAttachment.url} download={previewAttachment.name}>Download</a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AttachmentVersionDialog
        attachment={versionAttachment}
        open={Boolean(versionAttachment)}
        onOpenChange={(open) => !open && setVersionAttachment(null)}
      />
    </div>
  );
}
