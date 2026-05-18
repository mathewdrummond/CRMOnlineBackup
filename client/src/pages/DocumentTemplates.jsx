import React, { useEffect, useMemo, useRef, useState } from "react";
import { crmApi } from "@/api/localApiClient";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Eye,
  FilePlus2,
  FileText,
  Grip,
  Heading1,
  Image,
  ListPlus,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Save,
  Table2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const PAGE_SIZE = { width: 794, height: 1123 };
const GRID = 8;

const BLOCK_LIBRARY = [
  { type: "text", label: "Heading", icon: Heading1, text: "Heading", width: 280, height: 48, styleJson: { fontSize: 28, fontWeight: "bold" } },
  { type: "text", label: "Paragraph", icon: Type, text: "Paragraph text", width: 320, height: 92, styleJson: { fontSize: 12, lineHeight: 1.45 } },
  { type: "richText", label: "Rich text", icon: PenLine, text: "<strong>Rich text block</strong>", width: 340, height: 100, styleJson: { fontSize: 12, lineHeight: 1.45 } },
  { type: "text", label: "Customer details", icon: FileText, text: "Submitted to:\n{{customer.name}}\n{{customer.phone}}\n{{customer.email}}", width: 300, height: 118, styleJson: { fontSize: 12, borderColor: "#d7dece", padding: 10 } },
  { type: "text", label: "Job details", icon: FileText, text: "Job Name: {{job.name}}\nAddress: {{job.address}}\nIssue Date: {{quote.issueDate}}", width: 330, height: 118, styleJson: { fontSize: 12, borderColor: "#d7dece", padding: 10 } },
  { type: "text", label: "Price summary", icon: FileText, text: "Sub-Total: {{quote.subtotalExGst}}\nTax: {{quote.gstAmount}}\nTotal: {{quote.totalIncGst}}", width: 300, height: 106, styleJson: { fontSize: 13, fontWeight: "bold", borderColor: "#d7dece", padding: 10 } },
  { type: "text", label: "Payment schedule", icon: FileText, text: "Deposit: {{quote.depositAmount}}\nBalance Due: {{quote.balanceDue}}", width: 300, height: 82, styleJson: { fontSize: 12, borderColor: "#d7dece", padding: 10 } },
  { type: "table", label: "Line item table", icon: Table2, text: "", width: 650, height: 190, styleJson: { fontSize: 11 } },
  { type: "signature", label: "Signature block", icon: PenLine, text: "", width: 650, height: 120, styleJson: { fontSize: 11 } },
  { type: "terms", label: "Terms block", icon: ListPlus, text: "", width: 650, height: 520, styleJson: { fontSize: 10 } },
  { type: "image", label: "Image/logo", icon: Image, text: "{{company.logo}}", width: 180, height: 80, styleJson: {} },
  { type: "line", label: "Divider line", icon: Minus, text: "", width: 650, height: 1, styleJson: { borderBottomColor: "#6f7f61" } },
];

const SAMPLE_FIELDS = [
  ["Customer", ["customer.name", "customer.phone", "customer.email", "customer.address"]],
  ["Job", ["job.name", "job.number", "job.address", "job.notes", "job.scope", "job.specifications"]],
  ["Quote", ["quote.subtotalExGst", "quote.gstAmount", "quote.totalIncGst", "quote.depositAmount", "quote.balanceDue", "quote.issueDate", "quote.expiryDate"]],
  ["Quote", ["quote.quoteNumber", "quote.preparedBy", "quote.generatedAt"]],
  ["Company", ["company.name", "company.gstNumber", "company.phone", "company.email", "company.address", "company.logo"]],
  ["Line items", ["lineItems.description", "lineItems.quantity", "lineItems.unitPrice", "lineItems.notes", "lineItems.gstTreatment", "lineItems.total"]],
  ["Page", ["page.number", "page.count"]],
  ["Terms", ["terms.paymentTerms", "terms.disclaimer", "terms.termsAndConditions"]],
];

function newId() {
  return `block_${Math.random().toString(36).slice(2, 10)}`;
}

function snap(value) {
  return Math.round(Number(value || 0) / GRID) * GRID;
}

function defaultTemplate() {
  return {
    name: "Untitled Template",
    type: "contract",
    status: "draft",
    pageSize: "a4",
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    defaultFont: "Arial",
    sourceType: "native",
    version: 1,
    blocks: [],
  };
}

function normalizeTemplate(record) {
  return record?.template_json || record || defaultTemplate();
}

function blockLabel(block) {
  if (!block) return "No block selected";
  if (block.type === "table") return "Line item table";
  if (block.type === "signature") return "Signature block";
  if (block.type === "terms") return "Terms block";
  return block.contentJson?.text?.split("\n")?.[0] || block.type;
}

function renderBlockPreview(block) {
  if (block.type === "line") return <div className="h-px w-full bg-[#6f7f61]" />;
  if (block.type === "table") {
    return (
      <table className="w-full border-collapse text-[10px]">
        <thead><tr className="text-left text-muted-foreground"><th>Description</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>
          <tr><td className="border-t py-1">Line item description</td><td className="border-t py-1">1</td><td className="border-t py-1">$0.00</td></tr>
          <tr><td className="border-t py-1">Another line</td><td className="border-t py-1">2</td><td className="border-t py-1">$0.00</td></tr>
        </tbody>
      </table>
    );
  }
  if (block.type === "signature") {
    return (
      <div className="grid grid-cols-2 gap-6 text-[10px]">
        <div><div className="mb-1 h-7 border-b border-slate-800" />Client Name<div className="mb-1 mt-3 h-7 border-b border-slate-800" />Signature</div>
        <div><div className="mb-1 h-7 border-b border-slate-800" />Client Name<div className="mb-1 mt-3 h-7 border-b border-slate-800" />Signature</div>
      </div>
    );
  }
  if (block.type === "terms") return <div className="text-[10px]"><strong>Terms and Conditions</strong><br />Variations, pricing, payment, delivery, warranty...</div>;
  if (block.type === "image") return <div className="flex h-full items-center justify-center border border-dashed text-[10px] text-muted-foreground">Image/logo</div>;
  const text = block.contentJson?.text || block.contentJson?.html || `{{${block.bindingKey || ""}}}`;
  return <div className="whitespace-pre-wrap">{String(text).replace(/<[^>]+>/g, "")}</div>;
}

function blockStyle(block, selected, zoom) {
  const style = block.styleJson || {};
  return {
    position: "absolute",
    left: block.x,
    top: block.y,
    width: block.width,
    height: block.height,
    fontFamily: style.fontFamily || "Arial",
    fontSize: Number(style.fontSize || 12),
    fontWeight: style.fontWeight || "normal",
    color: style.color || "#1f2933",
    textAlign: style.textAlign || "left",
    padding: Number(style.padding || 0),
    lineHeight: style.lineHeight || 1.35,
    backgroundColor: style.backgroundColor || "transparent",
    border: selected ? `${Math.max(1, 2 / zoom)}px solid #2563eb` : style.borderColor ? `1px solid ${style.borderColor}` : "1px solid transparent",
    borderBottom: block.type === "line" ? `2px solid ${style.borderBottomColor || "#6f7f61"}` : undefined,
    boxSizing: "border-box",
    overflow: "hidden",
    cursor: selected ? "move" : "pointer",
  };
}

export default function DocumentTemplates() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [template, setTemplate] = useState(defaultTemplate());
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(0.72);
  const [mergeFields, setMergeFields] = useState([]);
  const [fieldSearch, setFieldSearch] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedBlock = useMemo(() => template.blocks.find((block) => block.id === selectedBlockId) || null, [selectedBlockId, template.blocks]);
  const pageCount = useMemo(() => Math.max(1, ...template.blocks.map((block) => Number(block.pageIndex || 0) + 1)), [template.blocks]);
  const visibleBlocks = useMemo(() => template.blocks.filter((block) => Number(block.pageIndex || 0) === pageIndex), [pageIndex, template.blocks]);
  const groupedFields = useMemo(() => {
    const fields = mergeFields.length ? mergeFields : SAMPLE_FIELDS.flatMap(([group, keys]) => keys.map((key) => ({ group, key, label: key })));
    const query = fieldSearch.trim().toLowerCase();
    return fields
      .filter((field) => !query || `${field.group} ${field.key} ${field.label}`.toLowerCase().includes(query))
      .reduce((groups, field) => ({ ...groups, [field.group]: [...(groups[field.group] || []), field] }), {});
  }, [fieldSearch, mergeFields]);

  useEffect(() => {
    void loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const [templateRows, fields] = await Promise.all([
        crmApi.documentTemplates.list(),
        crmApi.documentTemplates.mergeFields(),
      ]);
      setTemplates(templateRows);
      setMergeFields(fields.fields || []);
      const first = templateRows[0];
      if (first) {
        setSelectedId(first.id);
        setTemplate(normalizeTemplate(first));
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Templates failed to load", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setLoading(false);
    }
  };

  const selectTemplate = async (id) => {
    setSelectedId(id);
    setSelectedBlockId("");
    const record = await crmApi.documentTemplates.get(id);
    setTemplate(normalizeTemplate(record));
    setPageIndex(0);
  };

  const updateTemplate = (patch) => {
    setTemplate((current) => ({ ...current, ...patch }));
  };

  const updateSelectedBlock = (patch) => {
    if (!selectedBlock) return;
    setTemplate((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === selectedBlock.id ? { ...block, ...patch } : block),
    }));
  };

  const updateSelectedBlockStyle = (patch) => {
    if (!selectedBlock) return;
    updateSelectedBlock({ styleJson: { ...(selectedBlock.styleJson || {}), ...patch } });
  };

  const addBlock = (definition) => {
    const next = {
      id: newId(),
      pageIndex,
      type: definition.type,
      x: snap(template.margins.left + 16),
      y: snap(template.margins.top + 16 + visibleBlocks.length * 18),
      width: definition.width,
      height: definition.height,
      styleJson: definition.styleJson || {},
      contentJson: { text: definition.text || "", html: definition.type === "richText" ? definition.text || "" : "" },
      bindingKey: "",
      repeatSource: definition.type === "table" ? "lineItems" : "",
      sortOrder: Date.now(),
    };
    setTemplate((current) => ({ ...current, blocks: [...current.blocks, next] }));
    setSelectedBlockId(next.id);
  };

  const deleteSelectedBlock = () => {
    if (!selectedBlock) return;
    setTemplate((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== selectedBlock.id) }));
    setSelectedBlockId("");
  };

  const insertField = (key) => {
    if (!selectedBlock) {
      addBlock({ type: "field", text: `{{${key}}}`, width: 220, height: 36, styleJson: { fontSize: 12 } });
      setTimeout(() => {
        setTemplate((current) => {
          const last = current.blocks[current.blocks.length - 1];
          return { ...current, blocks: current.blocks.map((block) => block.id === last.id ? { ...block, bindingKey: key, contentJson: { text: `{{${key}}}` } } : block) };
        });
      }, 0);
      return;
    }
    const currentText = selectedBlock.contentJson?.text || selectedBlock.contentJson?.html || "";
    updateSelectedBlock({ contentJson: { ...(selectedBlock.contentJson || {}), text: `${currentText}${currentText ? " " : ""}{{${key}}}` }, bindingKey: selectedBlock.type === "field" ? key : selectedBlock.bindingKey });
  };

  const saveTemplate = async () => {
    try {
      const payload = { ...template, blocks: template.blocks.map((block, index) => ({ ...block, sortOrder: block.sortOrder || index })) };
      const saved = selectedId
        ? await crmApi.documentTemplates.update(selectedId, payload)
        : await crmApi.documentTemplates.create(payload);
      setSelectedId(saved.id);
      setTemplate(normalizeTemplate(saved));
      await loadTemplates();
      toast({ title: "Template saved" });
    } catch (error) {
      toast({ variant: "destructive", title: "Template save failed", description: error instanceof Error ? error.message : "Check unsupported fields or blocks." });
    }
  };

  const createTemplate = async (type = "contract") => {
    const name = type === "quote"
      ? "New Quote Template"
      : type === "quote_list"
        ? "New Quote List Template"
        : "New Contract Template";
    const created = await crmApi.documentTemplates.create({ name, type });
    setSelectedId(created.id);
    setTemplate(normalizeTemplate(created));
    await loadTemplates();
  };

  const duplicateTemplate = async () => {
    if (!selectedId) return;
    const duplicate = await crmApi.documentTemplates.duplicate(selectedId);
    setSelectedId(duplicate.id);
    setTemplate(normalizeTemplate(duplicate));
    await loadTemplates();
    toast({ title: "Template duplicated" });
  };

  const publishTemplate = async () => {
    if (!selectedId) return;
    try {
      const published = await crmApi.documentTemplates.publish(selectedId);
      setTemplate(normalizeTemplate(published));
      await loadTemplates();
      toast({ title: "Template published" });
    } catch (error) {
      toast({ variant: "destructive", title: "Publish blocked", description: error instanceof Error ? error.message : "Fix validation errors first." });
    }
  };

  const archiveTemplate = async () => {
    if (!selectedId) return;
    const archived = await crmApi.documentTemplates.update(selectedId, { ...template, status: "archived" });
    setTemplate(normalizeTemplate(archived));
    await loadTemplates();
    toast({ title: "Template archived" });
  };

  const previewTemplate = async () => {
    if (!selectedId) {
      await saveTemplate();
      return;
    }
    const result = await crmApi.documentTemplates.preview(selectedId);
    setPreviewHtml(result.html || "");
    setShowPreview(true);
  };

  const importMozaik = async (file) => {
    if (!file) return;
    const text = await file.text();
    const imported = await crmApi.documentTemplates.importMozaik({
      file_name: file.name,
      content: text,
      type: "contract",
    });
    setSelectedId(imported.id);
    setTemplate(normalizeTemplate(imported));
    await loadTemplates();
    toast({ title: "Mozaik template imported", description: imported.import_source?.import_status || "Best-effort template created." });
  };

  const handlePointerDown = (event, block) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedBlockId(block.id);
    dragRef.current = {
      id: block.id,
      mode: event.currentTarget.dataset.resize ? "resize" : "move",
      startX: event.clientX,
      startY: event.clientY,
      start: { x: block.x, y: block.y, width: block.width, height: block.height },
    };
  };

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragRef.current) return;
      const drag = dragRef.current;
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      setTemplate((current) => ({
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== drag.id) return block;
          if (drag.mode === "resize") {
            return { ...block, width: Math.max(24, snap(drag.start.width + dx)), height: Math.max(16, snap(drag.start.height + dy)) };
          }
          return { ...block, x: Math.max(0, snap(drag.start.x + dx)), y: Math.max(0, snap(drag.start.y + dy)) };
        }),
      }));
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [zoom]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Document Templates"
        subtitle="Design reusable Millbrook quote and contract layouts with client-safe merge fields."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Import Mozaik/DevExpress</Button>
            <Button variant="outline" onClick={() => void createTemplate("quote")}><FilePlus2 className="mr-2 h-4 w-4" />New Quote</Button>
            <Button variant="outline" onClick={() => void createTemplate("quote_list")}><FilePlus2 className="mr-2 h-4 w-4" />New Quote List</Button>
            <Button onClick={() => void createTemplate("contract")}><FilePlus2 className="mr-2 h-4 w-4" />New Contract</Button>
          </div>
        }
      />
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept=".prcrpt,.xml,.repx,.txt"
        onChange={(event) => void importMozaik(event.target.files?.[0])}
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="space-y-4">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Templates</h2>
              {loading ? <Badge variant="outline">Loading</Badge> : null}
            </div>
            <div className="space-y-2">
              {templates.map((item) => {
                const normalized = normalizeTemplate(item);
                return (
                  <button
                    key={item.id}
                    className={`w-full rounded-md border p-2 text-left text-sm transition ${selectedId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                    onClick={() => void selectTemplate(item.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{normalized.name}</span>
                      <Badge variant={normalized.status === "published" ? "default" : "outline"}>{normalized.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{normalized.type} · v{normalized.version || 1}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-semibold">Block Library</h2>
            <div className="grid grid-cols-2 gap-2">
              {BLOCK_LIBRARY.map((block) => {
                const Icon = block.icon;
                return (
                  <Button key={block.label} variant="outline" className="h-auto justify-start gap-2 px-2 py-2 text-left text-xs" onClick={() => addBlock(block)}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">{block.label}</span>
                  </Button>
                );
              })}
            </div>
          </Card>

          <Card className="p-3">
            <h2 className="mb-2 text-sm font-semibold">Merge Fields</h2>
            <Input className="mb-2" placeholder="Search fields" value={fieldSearch} onChange={(event) => setFieldSearch(event.target.value)} />
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {Object.entries(groupedFields).map(([group, fields]) => (
                <div key={group}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{group}</p>
                  <div className="space-y-1">
                    {fields.map((field) => (
                      <button key={field.key} className="w-full rounded border px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => insertField(field.key)}>
                        {`{{${field.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>

        <main className="space-y-3 overflow-hidden">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-64" value={template.name} onChange={(event) => updateTemplate({ name: event.target.value })} />
              <Select value={template.type} onValueChange={(value) => updateTemplate({ type: value })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="quote_list">Quote List</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant={template.status === "published" ? "default" : "outline"}>{template.status}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
              <span className="w-14 text-center text-xs">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => void duplicateTemplate()} disabled={!selectedId}><Copy className="mr-2 h-4 w-4" />Duplicate</Button>
              <Button variant="outline" size="sm" onClick={() => void previewTemplate()} disabled={!selectedId}><Eye className="mr-2 h-4 w-4" />Preview</Button>
              <Button variant="outline" size="sm" onClick={() => void archiveTemplate()} disabled={!selectedId}>Archive</Button>
              <Button variant="outline" size="sm" onClick={() => void publishTemplate()} disabled={!selectedId}>Publish</Button>
              <Button size="sm" onClick={() => void saveTemplate()}><Save className="mr-2 h-4 w-4" />Save Draft</Button>
            </div>
          </Card>

          <Card className="overflow-auto bg-stone-100 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {Array.from({ length: pageCount }, (_item, index) => (
                <Button key={index} size="sm" variant={pageIndex === index ? "default" : "outline"} onClick={() => setPageIndex(index)}>Page {index + 1}</Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => setPageIndex(pageCount)}><Plus className="mr-1 h-4 w-4" />Add page</Button>
            </div>
            <div className="min-w-max">
              <div
                className="origin-top-left bg-white shadow-xl"
                style={{
                  width: PAGE_SIZE.width,
                  height: PAGE_SIZE.height,
                  transform: `scale(${zoom})`,
                  marginBottom: PAGE_SIZE.height * (zoom - 1),
                  backgroundImage: "linear-gradient(rgba(37,99,235,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37,99,235,.08) 1px, transparent 1px)",
                  backgroundSize: `${GRID}px ${GRID}px`,
                  position: "relative",
                }}
                onPointerDown={() => setSelectedBlockId("")}
              >
                <div
                  className="pointer-events-none absolute border border-dashed border-amber-500/60"
                  style={{
                    left: template.margins.left,
                    top: template.margins.top,
                    right: template.margins.right,
                    bottom: template.margins.bottom,
                  }}
                />
                {visibleBlocks.map((block) => {
                  const selected = selectedBlockId === block.id;
                  return (
                    <div
                      key={block.id}
                      style={blockStyle(block, selected, zoom)}
                      onPointerDown={(event) => handlePointerDown(event, block)}
                    >
                      {selected ? <Grip className="absolute right-1 top-1 h-3 w-3 text-blue-600" /> : null}
                      {renderBlockPreview(block)}
                      {selected ? (
                        <button
                          type="button"
                          data-resize="true"
                          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize rounded-tl bg-blue-600"
                          onPointerDown={(event) => handlePointerDown(event, block)}
                          aria-label="Resize block"
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card className="p-3">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MousePointer2 className="h-4 w-4" />Selection</h2>
            {selectedBlock ? (
              <div className="space-y-3">
                <div>
                  <Label>Block</Label>
                  <p className="rounded border bg-muted px-2 py-2 text-sm">{blockLabel(selectedBlock)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>X</Label><Input type="number" value={selectedBlock.x} onChange={(event) => updateSelectedBlock({ x: snap(event.target.value) })} /></div>
                  <div><Label>Y</Label><Input type="number" value={selectedBlock.y} onChange={(event) => updateSelectedBlock({ y: snap(event.target.value) })} /></div>
                  <div><Label>Width</Label><Input type="number" value={selectedBlock.width} onChange={(event) => updateSelectedBlock({ width: Math.max(1, snap(event.target.value)) })} /></div>
                  <div><Label>Height</Label><Input type="number" value={selectedBlock.height} onChange={(event) => updateSelectedBlock({ height: Math.max(1, snap(event.target.value)) })} /></div>
                </div>
                {["text", "richText", "field", "image"].includes(selectedBlock.type) ? (
                  <div>
                    <Label>{selectedBlock.type === "richText" ? "HTML / rich text" : "Text / field"}</Label>
                    <Textarea
                      rows={6}
                      value={selectedBlock.contentJson?.text || selectedBlock.contentJson?.html || ""}
                      onChange={(event) => updateSelectedBlock({ contentJson: { ...(selectedBlock.contentJson || {}), text: event.target.value, html: selectedBlock.type === "richText" ? event.target.value : selectedBlock.contentJson?.html || "" } })}
                    />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Font size</Label><Input type="number" value={selectedBlock.styleJson?.fontSize || 12} onChange={(event) => updateSelectedBlockStyle({ fontSize: Number(event.target.value || 12) })} /></div>
                  <div><Label>Padding</Label><Input type="number" value={selectedBlock.styleJson?.padding || 0} onChange={(event) => updateSelectedBlockStyle({ padding: Number(event.target.value || 0) })} /></div>
                  <div><Label>Text colour</Label><Input type="color" value={selectedBlock.styleJson?.color || "#1f2933"} onChange={(event) => updateSelectedBlockStyle({ color: event.target.value })} /></div>
                  <div><Label>Background</Label><Input type="color" value={selectedBlock.styleJson?.backgroundColor || "#ffffff"} onChange={(event) => updateSelectedBlockStyle({ backgroundColor: event.target.value })} /></div>
                </div>
                {selectedBlock.type === "table" ? (
                  <div className="space-y-2 rounded border p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Table settings</p>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Show notes column</span>
                      <input
                        type="checkbox"
                        checked={selectedBlock.contentJson?.showNotes === true}
                        onChange={(event) => updateSelectedBlock({ contentJson: { ...(selectedBlock.contentJson || {}), showNotes: event.target.checked } })}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Show GST treatment</span>
                      <input
                        type="checkbox"
                        checked={selectedBlock.contentJson?.showGstTreatment === true}
                        onChange={(event) => updateSelectedBlock({ contentJson: { ...(selectedBlock.contentJson || {}), showGstTreatment: event.target.checked } })}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Show totals</span>
                      <input
                        type="checkbox"
                        checked={selectedBlock.contentJson?.showTotal !== false}
                        onChange={(event) => updateSelectedBlock({ contentJson: { ...(selectedBlock.contentJson || {}), showTotal: event.target.checked } })}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>Include excluded items</span>
                      <input
                        type="checkbox"
                        checked={selectedBlock.contentJson?.includeExcludedItems === true}
                        onChange={(event) => updateSelectedBlock({ contentJson: { ...(selectedBlock.contentJson || {}), includeExcludedItems: event.target.checked } })}
                      />
                    </label>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button variant={selectedBlock.styleJson?.fontWeight === "bold" ? "default" : "outline"} size="sm" onClick={() => updateSelectedBlockStyle({ fontWeight: selectedBlock.styleJson?.fontWeight === "bold" ? "normal" : "bold" })}>B</Button>
                  <Button variant="outline" size="sm" onClick={() => updateSelectedBlockStyle({ textAlign: "left" })}><AlignLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => updateSelectedBlockStyle({ textAlign: "center" })}><AlignCenter className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => updateSelectedBlockStyle({ textAlign: "right" })}><AlignRight className="h-4 w-4" /></Button>
                  <Button variant="destructive" size="sm" className="ml-auto" onClick={deleteSelectedBlock}>Delete</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a block on the canvas or add one from the library.</p>
            )}
          </Card>

          <Card className="p-3">
            <h2 className="mb-3 text-sm font-semibold">Page Setup</h2>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Top</Label><Input type="number" value={template.margins.top} onChange={(event) => updateTemplate({ margins: { ...template.margins, top: Number(event.target.value || 0) } })} /></div>
              <div><Label>Right</Label><Input type="number" value={template.margins.right} onChange={(event) => updateTemplate({ margins: { ...template.margins, right: Number(event.target.value || 0) } })} /></div>
              <div><Label>Bottom</Label><Input type="number" value={template.margins.bottom} onChange={(event) => updateTemplate({ margins: { ...template.margins, bottom: Number(event.target.value || 0) } })} /></div>
              <div><Label>Left</Label><Input type="number" value={template.margins.left} onChange={(event) => updateTemplate({ margins: { ...template.margins, left: Number(event.target.value || 0) } })} /></div>
            </div>
          </Card>

          <Alert>
            <AlertDescription>
              Client templates only expose approved customer, job, quote, company, line item, and terms fields. Internal margin, markup, labour cost, buy cost, and internal notes are blocked at publish/save time.
            </AlertDescription>
          </Alert>
        </aside>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="jf-document-workspace max-h-[92vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>Preview the customer-facing document output generated from the current template.</DialogDescription>
          </DialogHeader>
          <div className="jf-document-preview-shell rounded-[10px] border border-border/45 p-3">
            <iframe title="Template preview" srcDoc={previewHtml} className="jf-document-preview-page h-[75vh] w-full" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
