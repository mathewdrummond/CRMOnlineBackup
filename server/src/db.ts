import BetterSqlite3 from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_INSTALL_ESTIMATOR_SETTINGS } from "./installEstimatorDefaults";
import { readDatabaseDriver } from "./infrastructure/databaseMode";
import {
  closePostgresStore,
  deleteEntityRecordFromPostgres,
  initializePostgresStore,
  postgresModeSummary,
  queryPostgresParitySnapshot,
  writeAuditLogToPostgres,
  writeEntityRecordToPostgres,
} from "./infrastructure/postgresStore";
import { DEFAULT_PRICING_CATEGORIES } from "./pricingCategories";
import { DEFAULT_LABOUR_PROFILE, DEFAULT_PRICING_RULES } from "./pricingModel";
import { DEFAULT_PRICING_SECTIONS } from "./pricingSections";
import { LOCAL_USER } from "./systemUser";
import { buildAssignedStaffDisplay, resolveAssignedStaffIds, resolveLaneStaffRecord } from "./staffIdentity";
import {
  AttachmentVersionRecord,
  AuditLogRecord,
  EntityData,
  EntityRecord,
  ListEntityOptions,
  LocalUser,
  MutationActor,
  MutationContext,
} from "./types";

const DEFAULT_DATABASE_PATH = path.resolve(__dirname, "..", "data", "joinerflow.sqlite");
const CURRENT_SCHEMA_VERSION = 4;

type SchemaMigration = {
  version: number;
  name: string;
  apply: (db: BetterSqlite3.Database) => void;
};

const ENTITY_DEFAULTS: Record<string, EntityData> = {
  AppModuleConfig: { modules: {} },
  AppAlert: { type: "info", category: "general", is_read: false, is_resolved: false },
  AppUser: { role: "member", status: "invited", session_revoked_before: "" },
  Attachment: {
    related_type: "job",
    current_version: 1,
    version_count: 1,
    checksum: "",
    source: "ui-upload",
    document_information: "",
    linked_pricing_import_id: "",
    quote_file_id: "",
    file_source: "Manual Upload",
    import_type: "",
    document_type: "",
    document_number: "",
    extracted_inc_gst_total: 0,
    extracted_ex_gst_subtotal: 0,
    extracted_gst_amount: 0,
    supplier_name: "",
    supplier_quote_number: "",
    uploaded_by: "",
    uploaded_at: "",
    production_visibility: "production",
    visible_to_production: true,
    management_only: false,
    internal_only: false,
  },
  Company: { type: "client", status: "active", tags: [] },
  Contact: {
    type: "client",
    status: "active",
    relationship_status: "active",
    priority: "medium",
    tags: [],
    is_primary: false,
    owner: "",
    preferred_channel: "email",
    last_contacted_date: "",
    next_follow_up_date: "",
  },
  ContactInteraction: { type: "note", direction: "outbound", visibility: "internal" },
  ContactTask: { status: "pending", priority: "medium", type: "follow_up" },
  ClockIn: { total_hours: 0 },
  ExportHistory: {},
  Invoice: {
    type: "final",
    status: "draft",
    subtotal: 0,
    gst: 0,
    total: 0,
    amount_paid: 0,
  },
  Job: {
    status: "planning",
    budget_hours: 0,
    quoted_value: 0,
    install_end_date: "",
    priority: "medium",
    tags: [],
    job_type: "cabinetry_standard",
    workflow_template_key: "cabinetry_standard",
    approval_status: "pending_internal",
    approval_owner: "",
    approval_requested_date: "",
    approval_completed_date: "",
    approval_history: [],
    change_orders: [],
    procurement_status: "not_started",
    procurement_takeoff_complete: false,
    procurement_supplier_confirmed: false,
    procurement_pos_raised: false,
    procurement_critical_items_received: false,
    procurement_notes: "",
    handoff_status: "not_ready",
    handoff_site_measure_complete: false,
    handoff_drawings_ready: false,
    handoff_materials_confirmed: false,
    handoff_production_brief_complete: false,
    handoff_install_plan_confirmed: false,
    handoff_notes: "",
    internal_operational_notes: "",
  },
  JobOperation: {
    status: "pending",
    title: "",
    description: "",
    install_type: "install",
    duration_hours: 0,
    estimated_duration_hours_original: 0,
    estimated_duration_days: 0,
    estimated_duration_confidence: "low",
    estimator_assumptions: {},
    duration_manually_overridden: false,
    assigned_crew_id: "",
    assigned_crew_name: "",
    suggested_crew_size: 1,
    required_crew_size: 1,
    required_skills: [],
    preferred_crew_id: "",
    crew_assignment_locked: false,
    install_group_id: "",
    priority: "medium",
    deadline: "",
    earliest_start: "",
    latest_finish: "",
    dependencies: [],
    location: "",
    manually_locked: false,
    scheduled_start_at: "",
    scheduled_end_at: "",
    scheduled_day_allocations: [],
    schedule_warnings: [],
    estimated_hours: 0,
    actual_hours: 0,
    actual_start_date: "",
    actual_completion_date: "",
    sort_order: 0,
    is_locked: false,
    assigned_staff_ids: [],
    record_scope: "job",
    quote_id: "",
    quote_number: "",
    quote_title: "",
    workflow_template_id: "",
    workflow_template_key: "",
    dependency_template_keys: [],
    dependency_task_ids: [],
    is_workflow_task: false,
    is_system_generated: false,
    is_unassigned_placeholder: false,
    schedule_category: "",
    generation_stage: "",
    allow_friday_overtime: false,
    allow_saturday_overtime: false,
    schedule_manual_override: false,
  },
  Crew: {
    name: "",
    is_active: true,
    assigned_staff_ids: [],
    assigned_staff_names: [],
    default_daily_capacity: 10.5,
    skills: [],
    notes: "",
    color: "emerald",
  },
  InstallEstimatorSetting: DEFAULT_INSTALL_ESTIMATOR_SETTINGS,
  LeadCategory: { name: "", key: "", color: "slate", sort_order: 0, is_default: false, is_active: true },
  Lead: { stage: "new_enquiry", priority: "medium", value: 0, probability: 0, tags: [] },
  LeadTask: { status: "pending", priority: "medium", type: "follow_up" },
  Note: { type: "note", author_name: LOCAL_USER.full_name },
  Quote: {
    status: "draft",
    revision: 1,
    subtotal: 0,
    gst: 0,
    total: 0,
    markup_percent: 30,
    waste_percent: 10,
    approval_status: "draft",
    approval_owner: "",
    approval_requested_date: "",
    approval_completed_date: "",
    approval_history: [],
    change_orders: [],
    quote_scope_signed_off: false,
    quote_drawings_signed_off: false,
    quote_pricing_signed_off: false,
    quote_client_brief_signed_off: false,
    production_handoff_status: "not_ready",
    decision_due_date: "",
    quote_internal_notes: "",
    job_conversion_notes: "",
  },
  QuoteItem: {
    section: "General",
    section_id: "",
    section_key: "general",
    section_display_order: 999,
    category: "materials",
    quantity: 1,
    unit: "ea",
    unit_cost: 0,
    markup_percent: 30,
    sell_price: 0,
    total: 0,
    is_optional: false,
    sort_order: 0,
    import_id: "",
    import_type: "",
    pricing_quote_item_id: "",
    source: "manual",
    source_file_name: "",
    source_file_type: "",
    source_page: 0,
    source_row: 0,
    source_item_code: "",
    original_extracted_description: "",
    supplier_quote_number: "",
    supplier_gst_number: "",
    original_imported_value: {},
    parsed_normalized_value: {},
    confidence_score: null,
    created_by_user_id: "",
    created_by_user_name: "",
    source_rule_id: "",
    parent_line_item_id: "",
    parent_pricing_quote_item_id: "",
    parent_source_description: "",
    is_manual_override: false,
    is_price_locked: false,
    auto_added: false,
    review_status: "confirmed",
    confirmed_at: "",
    confirmed_by: "",
    excluded_at: "",
    excluded_by: "",
  },
  PricingItem: {
    name: "",
    description: "",
    section: "",
    section_id: "",
    section_key: "general",
    section_display_order: 999,
    category: "misc_fixings",
    unit: "ea",
    buy_price: 0,
    gst_inclusive_price: 0,
    markup_percent: 30,
    default_markup: 30,
    supplier_id: "",
    supplier: "",
    supplier_name: "",
    product_number: "",
    original_sku: "",
    normalized_sku: "",
    supplier_sku: "",
    supplier_item_code: "",
    supplier_reference: "",
    supplier_category: "",
    supplier_unit: "",
    supplier_pack_quantity: 1,
    dimensions: "",
    pack_quantity: 1,
    minimum_order_quantity: 0,
    barcode: "",
    last_imported_price: 0,
    last_price_update_at: "",
    price_list_import_id: "",
    is_active: true,
    is_user_created: false,
    waste_factor: 0,
    labour_defaults: {},
    default_inclusion_behaviour: "standard",
  },
  PricingItemLearningAudit: {
    pricing_item_id: "",
    field: "",
    old_value: null,
    new_value: null,
    source_quote_id: "",
    source_import_id: "",
    user_id: "",
    user_name: "",
    action_type: "save_default",
  },
  PricingItemActionAudit: {
    pricing_item_id: "",
    action_type: "",
    source_quote_id: "",
    source_import_id: "",
    user_id: "",
    user_name: "",
    details: {},
  },
  PurchaseOrder: {
    status: "draft",
    subtotal: 0,
    gst: 0,
    total: 0,
  },
  POItem: {
    quantity: 1,
    unit: "ea",
    unit_price: 0,
    total: 0,
    received_qty: 0,
    sort_order: 0,
  },
  QuoteLineItemUpdateAudit: {
    quote_id: "",
    import_id: "",
    line_item_id: "",
    pricing_quote_item_id: "",
    field: "",
    old_value: null,
    new_value: null,
    user_id: "",
    user_name: "",
  },
  QuoteMarginAdjustmentAudit: {
    quote_id: "",
    action_type: "gross_margin_adjustment",
    previous_margin_percent: 0,
    target_margin_percent: 0,
    affected_line_item_ids: [],
    locked_line_item_ids: [],
    excluded_line_item_ids: [],
    current_sell_total: 0,
    new_sell_total: 0,
    old_sell_totals: {},
    new_sell_totals: {},
    user_id: "",
    user_name: "",
    details: {},
  },
  QuoteDocument: {
    quoteId: "",
    quote_id: "",
    jobId: "",
    job_id: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    jobName: "",
    jobAddress: "",
    jobNotes: "",
    scopeNotes: "",
    specificationNotes: "",
    subtotalExGst: 0,
    gstAmount: 0,
    totalIncGst: 0,
    depositAmount: 0,
    balanceDue: 0,
    issueDate: "",
    documentType: "contract",
    status: "draft",
    generatedPdfUrl: "",
    generated_document_id: "",
    attachment_id: "",
    paymentTerms: "",
    disclaimer: "",
    termsSections: [],
    lineItems: [],
    warnings: [],
    errors: [],
  },
  DocumentTemplate: {
    name: "",
    template_key: "",
    type: "contract",
    document_type: "contract",
    status: "draft",
    pageSize: "a4",
    page_size: "a4",
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    defaultFont: "Arial",
    default_font: "Arial",
    sourceType: "native",
    source_type: "native",
    blocks: [],
    template_json: {},
    version: 1,
    is_default: false,
    sections: [],
    html_template: "",
    style_config: {},
  },
  DocumentTemplateVersion: {
    template_id: "",
    version: 1,
    status: "draft",
    snapshot: {},
    published_by_user_id: "",
    published_by_user_name: "",
    published_at: "",
    change_summary: "",
  },
  TemplateBlock: {
    template_id: "",
    pageIndex: 0,
    page_index: 0,
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    styleJson: {},
    style_json: {},
    contentJson: {},
    content_json: {},
    bindingKey: "",
    binding_key: "",
    repeatSource: "",
    repeat_source: "",
    sortOrder: 0,
    sort_order: 0,
  },
  TemplateFieldBinding: {
    template_id: "",
    block_id: "",
    binding_key: "",
    field_group: "",
    is_client_safe: true,
  },
  TemplateImportSource: {
    template_id: "",
    file_name: "",
    source_type: "mozaik_prcrpt",
    import_status: "reference_only",
    extracted_text_blocks: [],
    original_excerpt: "",
    imported_by_user_id: "",
    imported_by_user_name: "",
  },
  GeneratedDocument: {
    quote_id: "",
    quote_document_id: "",
    job_id: "",
    document_type: "contract",
    file_name: "",
    attachment_id: "",
    url: "",
    generated_by_user_id: "",
    generated_by_user_name: "",
    metadata: {},
  },
  ContractTerms: {
    name: "",
    is_default: false,
    sections: [],
    payment_terms: "",
    disclaimer: "",
  },
  PaymentSchedule: {
    quote_id: "",
    quote_document_id: "",
    deposit_amount: 0,
    balance_due: 0,
    total_inc_gst: 0,
    notes: "",
  },
  SiteMeasure: {
    quote_id: "",
    job_id: "",
    install_id: "",
    site_address: "",
    measure_date: "",
    measured_by: "",
    appliance_details: "",
    notes: "",
    client_requests: "",
    access_notes: "",
    checklist: {
      appliance_confirmed: false,
      services_checked: false,
      floor_level_checked: false,
      wall_condition_checked: false,
      ceiling_checked: false,
      access_checked: false,
    },
    include_in_handover_pack: true,
    status: "draft",
  },
  PricingItemAutoInclusion: {
    parent_pricing_item_id: "",
    parent_sku: "",
    inclusion_pricing_item_id: "",
    inclusion_sku: "",
    inclusion_description: "",
    inclusion_category: "misc_fixings",
    quantity_logic: "per_imported_item",
    quantity_value: 1,
    custom_formula: "",
    unit_cost: 0,
    markup_percent: 30,
    is_active: true,
  },
  TriggeredAutoInclusionRule: {
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
  },
  AutoInclusionAuditLog: {
    parent_pricing_item_id: "",
    inclusion_item_id: "",
    old_inclusion_rule: null,
    new_inclusion_rule: null,
    source_quote_id: "",
    source_import_id: "",
    user_id: "",
    user_name: "",
  },
  TriggeredAutoInclusionAudit: {
    quote_id: "",
    import_id: "",
    parent_pricing_quote_item_id: "",
    parent_quote_item_id: "",
    rule_id: "",
    inclusion_quote_item_id: "",
    action_type: "",
    calculated_quantity: 0,
    quantity_multiplier: 0,
    original_rule_values: {},
    edited_quote_values: {},
    user_id: "",
    user_name: "",
  },
  GlobalAutoInclusion: {
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
  },
  GlobalAutoInclusionAudit: {
    quote_id: "",
    rule_id: "",
    quote_item_id: "",
    action_type: "",
    original_default_values: {},
    edited_quote_values: {},
    user_id: "",
    user_name: "",
  },
  PricingCategory: {
    name: "",
    label: "",
    key: "",
    value: "",
    is_active: true,
    merged_into_category_id: "",
    merged_into_category_key: "",
    merged_into_category_name: "",
  },
  PricingSection: {
    name: "",
    label: "",
    key: "",
    value: "",
    description: "",
    display_order: 999,
    is_active: true,
    merged_into_section_id: "",
    merged_into_section_key: "",
    merged_into_section_name: "",
  },
  PricingRule: {
    name: "",
    is_active: true,
    condition: {},
    triggered_items: [],
    category: "misc_fixings",
    reason: "",
    sort_order: 0,
  },
  QuoteImport: {
    quote_id: "",
    job_name: "",
    source: "mozaik_csv",
    import_type: "",
    import_status: "staged",
    raw_csv: "",
    file_name: "",
    file_type: "",
    file_size: 0,
    original_file_base64: "",
    column_mapping: {},
    structured_items: [],
    import_warnings: [],
    metadata: {},
    summary: {},
    imported_by_user_id: "",
    imported_by_user_name: "",
    committed_at: "",
  },
  PricingQuoteItem: {
    quote_id: "",
    import_id: "",
    source: "manual",
    name: "",
    section: "",
    section_id: "",
    section_key: "",
    section_display_order: 999,
    category: "misc_fixings",
    quantity: 1,
    unit: "ea",
    buy_price: 0,
    markup_percent: 30,
    cabinet_reference: "",
    dimensions: {},
    tags: [],
    is_auto_inclusion: false,
    auto_inclusion_id: "",
    notes: "",
    source_file_name: "",
    source_file_type: "",
    source_page: 0,
    source_row: 0,
    source_item_code: "",
    original_description: "",
    supplier_gst_number: "",
    quote_reference: "",
    original_imported_value: {},
    parsed_normalized_value: {},
    confidence_score: null,
    gst_treatment: "unknown",
    sell_price: 0,
    total_buy_price: 0,
    total_sell_price: 0,
    parent_pricing_quote_item_id: "",
    parent_source_description: "",
    source_rule_name: "",
    quantity_multiplier: 0,
    calculated_quantity: 0,
    is_manual_override: false,
    review_status: "pending",
    review_state: "active",
    status: "review",
    warnings: [],
    errors: [],
  },
  QuoteAutoInclusion: {
    quote_id: "",
    rule_id: "",
    rule_name: "",
    item_name: "",
    category: "misc_fixings",
    quantity: 1,
    unit: "ea",
    buy_price: 0,
    markup_percent: 30,
    reason: "",
    source_item_ids: [],
    is_enabled: true,
    is_edited: false,
  },
  QuoteCalculation: {
    quote_id: "",
    job_name: "",
    assumptions: {},
    totals: {},
    warnings: [],
    line_items: [],
    auto_inclusions: [],
  },
  QuoteScenario: {
    quote_id: "",
    name: "",
    subtotal_ex_gst: 0,
    gst: 0,
    total_inc_gst: 0,
    gross_margin_percent: 0,
    labour_hours: 0,
    labour_rate: 110,
    material_markup_percent: 30,
  },
  QuoteOverride: {
    quote_id: "",
    target_entity: "",
    target_id: "",
    field: "",
    original_value: null,
    new_value: null,
    reason: "",
    user_id: "",
    user_name: "",
  },
  LabourProfile: {
    name: "Standard",
    is_default: false,
    labour_sell_rate: 110,
    selectable_labour_rates: [100, 110, 120],
    internal_labour_cost: 36,
    assumptions: {},
    complexity_multipliers: {},
    margin_targets: {},
    gst_percent: 15,
    material_markup_percent: 30,
  },
  HistoricalJob: {
    job_name: "",
    job_type: "cabinetry_standard",
    material_cost: 0,
    labour_hours: 0,
    total_value: 0,
    margin_percent: 0,
    return_per_labour_hour: 0,
    completed_date: "",
  },
  SupplierPriceList: {
    supplier_id: "",
    supplier_name: "",
    effective_date: "",
    items: [],
    is_active: true,
  },
  PriceListImport: {
    supplier: "",
    supplier_id: "",
    file_name: "",
    file_type: "csv",
    file_size: 0,
    original_file_base64: "",
    imported_by_user_id: "",
    imported_by_user_name: "",
    import_status: "staged",
    column_mapping: {},
    summary: {},
    warnings: [],
    committed_at: "",
    rolled_back_at: "",
    rolled_back_by_user_id: "",
    rolled_back_by_user_name: "",
  },
  PriceListImportRow: {
    import_id: "",
    row_number: 0,
    raw: {},
    mapped: {},
    status: "unmatched",
    match_type: "",
    pricing_item_id: "",
    warnings: [],
    errors: [],
    old_values: {},
    new_values: {},
    price_change_percent: 0,
  },
  SupplierColumnMapping: {
    supplier: "",
    supplier_id: "",
    mapping: {},
    last_used_at: "",
  },
  PricingItemPriceHistory: {
    pricing_item_id: "",
    supplier: "",
    product_number: "",
    original_sku: "",
    normalized_sku: "",
    old_cost: 0,
    new_cost: 0,
    percentage_change: 0,
    effective_date: "",
    import_id: "",
    changed_by_user_id: "",
    changed_by_user_name: "",
  },
  SupplierImportProfile: {
    supplier: "",
    supplier_id: "",
    column_mapping: {},
    preferred_price_field: "unit_cost_ex_gst",
    category_mapping_rules: {},
    sku_patterns: [],
    gst_handling: "auto",
    unit_normalisation_rules: {},
    price_priority_logic: [],
    last_used_at: "",
  },
  ImportRollbackLog: {
    import_id: "",
    rolled_back_by_user_id: "",
    rolled_back_by_user_name: "",
    restored_items: [],
    note: "",
  },
  ReportView: {
    name: "",
    user_id: "",
    user_name: "",
    pack_key: "management",
    report_key: "revenue_summary",
    is_default: false,
    filters: {},
    grouping: "none",
    sort: {},
    visible_columns: [],
  },
  ScheduleLane: {
    label: "",
    color: "slate",
    sort_order: 0,
    staff_id: "",
    staff_name: "",
    lane_type: "staff",
    crew_size: 1,
    capacity_hours_per_day: 10.5,
    workstation_name: "",
    is_active: true,
  },
  Staff: { status: "active", hourly_rate: 0 },
  Supplier: { payment_terms: "30_days", category: "general", status: "active" },
  TimeEntry: {
    hours: 0,
    hourly_rate: 0,
    total_cost: 0,
    status: "active",
    is_break: false,
    exported: false,
    entry_kind: "work",
    location_type: "workshop",
    break_minutes: 0,
    manual_override: false,
    manual_reason: "",
    session_group_id: "",
    job_operation_id: "",
    job_operation_label: "",
    workflow_phase: "",
    resume_context: null,
    labour_category: "",
    is_chargeable: false,
    review_flags: [],
    review_required: false,
    review_status: "clear",
    voided: false,
    void_reason: "",
    excluded_from_costing: false,
    excluded_from_payroll: false,
  },
  WorkflowRoleMapping: { label: "", description: "", color: "slate", default_staff_names: [], sort_order: 0, is_active: true },
  JobTaskTemplate: {
    phase: "enquiry",
    role_key: "management",
    operation_type: "other",
    estimated_hours: 0,
    estimated_hours_ratio: 0,
    dependencies: [],
    job_types: ["default"],
    sort_order: 0,
    is_active: true,
    record_scope: "job",
    trigger_event: "job_created",
    schedule_category: "planning",
    planned_anchor: "job_created_date",
    anchor_offset_days: 0,
    explicit_duration_days: 0,
  },
};

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

type RawEntityRow = {
  id: string;
  entity: string;
  data: string;
  created_date: string;
  updated_date: string;
  row_version: number;
};

type RawAuditRow = {
  id: string;
  entity: string;
  record_id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  request_source: string;
  summary_json: string;
  previous_data: string | null;
  next_data: string | null;
  created_date: string;
};

type RawAttachmentVersionRow = {
  id: string;
  attachment_id: string;
  version_number: number;
  related_id: string;
  related_type: string;
  name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  relative_path: string;
  url: string;
  checksum: string;
  source: string;
  actor_id: string;
  actor_email: string;
  actor_name: string;
  created_date: string;
};

type EntityListQueryPlanRow = {
  id: number;
  parent: number;
  notused: number;
  detail: string;
};

type CompiledEntityListQuery = {
  sql: string;
  params: unknown[];
  filtersAppliedInSql: boolean;
  sortAppliedInSql: boolean;
  limitAppliedInSql: boolean;
};

export class EntityConflictError extends Error {
  status = 409;
  code = "row_version_conflict";
  current_record: EntityRecord | null;

  constructor(message: string, currentRecord: EntityRecord | null) {
    super(message);
    this.current_record = currentRecord;
  }
}

let database: BetterSqlite3.Database | null = null;

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    name: "baseline_local_entity_store",
    apply(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS entity_records (
          id TEXT PRIMARY KEY,
          entity TEXT NOT NULL,
          data TEXT NOT NULL,
          created_date TEXT NOT NULL,
          updated_date TEXT NOT NULL,
          row_version INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS entity_records_entity_idx ON entity_records(entity);
        CREATE INDEX IF NOT EXISTS entity_records_entity_updated_idx ON entity_records(entity, updated_date DESC);
        CREATE INDEX IF NOT EXISTS entity_records_entity_created_idx ON entity_records(entity, created_date DESC);
        CREATE INDEX IF NOT EXISTS entity_records_related_idx ON entity_records(entity, json_extract(data, '$.related_id'));
        CREATE INDEX IF NOT EXISTS entity_records_related_type_idx ON entity_records(entity, json_extract(data, '$.related_type'));
        CREATE INDEX IF NOT EXISTS entity_records_job_idx ON entity_records(entity, json_extract(data, '$.job_id'));
        CREATE INDEX IF NOT EXISTS entity_records_quote_idx ON entity_records(entity, json_extract(data, '$.quote_id'));
        CREATE INDEX IF NOT EXISTS entity_records_lead_idx ON entity_records(entity, json_extract(data, '$.lead_id'));
        CREATE INDEX IF NOT EXISTS entity_records_contact_idx ON entity_records(entity, json_extract(data, '$.contact_id'));
        CREATE INDEX IF NOT EXISTS entity_records_company_idx ON entity_records(entity, json_extract(data, '$.company_id'));
        CREATE INDEX IF NOT EXISTS entity_records_staff_idx ON entity_records(entity, json_extract(data, '$.staff_id'));
        CREATE INDEX IF NOT EXISTS entity_records_status_idx ON entity_records(entity, json_extract(data, '$.status'));
        CREATE INDEX IF NOT EXISTS entity_records_start_date_idx ON entity_records(entity, json_extract(data, '$.start_date'));
        CREATE INDEX IF NOT EXISTS entity_records_due_date_idx ON entity_records(entity, json_extract(data, '$.due_date'));
        CREATE INDEX IF NOT EXISTS entity_records_assigned_to_idx ON entity_records(entity, json_extract(data, '$.assigned_to'));

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          entity TEXT NOT NULL,
          record_id TEXT NOT NULL,
          action TEXT NOT NULL,
          actor_id TEXT NOT NULL DEFAULT '',
          actor_email TEXT NOT NULL DEFAULT '',
          actor_name TEXT NOT NULL DEFAULT '',
          actor_role TEXT NOT NULL DEFAULT '',
          request_source TEXT NOT NULL DEFAULT '',
          summary_json TEXT NOT NULL,
          previous_data TEXT,
          next_data TEXT,
          created_date TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS audit_log_entity_record_idx ON audit_log(entity, record_id, created_date DESC);
        CREATE INDEX IF NOT EXISTS audit_log_created_date_idx ON audit_log(created_date DESC);

        CREATE TABLE IF NOT EXISTS attachment_versions (
          id TEXT PRIMARY KEY,
          attachment_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          related_id TEXT NOT NULL,
          related_type TEXT NOT NULL,
          name TEXT NOT NULL,
          stored_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          relative_path TEXT NOT NULL,
          url TEXT NOT NULL,
          checksum TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT '',
          actor_id TEXT NOT NULL DEFAULT '',
          actor_email TEXT NOT NULL DEFAULT '',
          actor_name TEXT NOT NULL DEFAULT '',
          created_date TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS attachment_versions_attachment_version_idx ON attachment_versions(attachment_id, version_number);
        CREATE INDEX IF NOT EXISTS attachment_versions_attachment_idx ON attachment_versions(attachment_id, created_date DESC);
      `);

      const columns = db.prepare("PRAGMA table_info(entity_records)").all() as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "row_version")) {
        db.exec("ALTER TABLE entity_records ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1");
      }
    },
  },
  {
    version: 2,
    name: "entity_query_indexes_and_plans",
    apply(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS entity_records_job_operation_idx ON entity_records(entity, json_extract(data, '$.job_operation_id'));
        CREATE INDEX IF NOT EXISTS entity_records_category_id_idx ON entity_records(entity, json_extract(data, '$.category_id'));
        CREATE INDEX IF NOT EXISTS entity_records_date_idx ON entity_records(entity, json_extract(data, '$.date') DESC);
        CREATE INDEX IF NOT EXISTS entity_records_exported_at_idx ON entity_records(entity, json_extract(data, '$.exported_at') DESC);
        CREATE INDEX IF NOT EXISTS entity_records_sort_order_idx ON entity_records(entity, json_extract(data, '$.sort_order'));
        CREATE INDEX IF NOT EXISTS entity_records_name_idx ON entity_records(entity, json_extract(data, '$.name'));
        CREATE INDEX IF NOT EXISTS entity_records_last_name_idx ON entity_records(entity, json_extract(data, '$.last_name'));
        CREATE INDEX IF NOT EXISTS entity_records_email_idx ON entity_records(entity, json_extract(data, '$.email'));
        CREATE INDEX IF NOT EXISTS entity_records_job_number_idx ON entity_records(entity, json_extract(data, '$.job_number'));
        CREATE INDEX IF NOT EXISTS entity_records_quote_number_idx ON entity_records(entity, json_extract(data, '$.quote_number'));

        CREATE INDEX IF NOT EXISTS entity_records_staff_date_idx ON entity_records(
          entity,
          json_extract(data, '$.staff_id'),
          json_extract(data, '$.date') DESC
        );
        CREATE INDEX IF NOT EXISTS entity_records_job_operation_date_idx ON entity_records(
          entity,
          json_extract(data, '$.job_operation_id'),
          json_extract(data, '$.date') DESC
        );
        CREATE INDEX IF NOT EXISTS entity_records_job_sort_order_idx ON entity_records(
          entity,
          json_extract(data, '$.job_id'),
          json_extract(data, '$.sort_order')
        );
        CREATE INDEX IF NOT EXISTS entity_records_quote_sort_order_idx ON entity_records(
          entity,
          json_extract(data, '$.quote_id'),
          json_extract(data, '$.sort_order')
        );
      `);
    },
  },
  {
    version: 3,
    name: "pricing_model_entities",
    apply(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS entity_records_pricing_quote_idx ON entity_records(entity, json_extract(data, '$.quote_id'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_import_idx ON entity_records(entity, json_extract(data, '$.import_id'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_category_idx ON entity_records(entity, json_extract(data, '$.category'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_active_idx ON entity_records(entity, json_extract(data, '$.is_active'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_default_idx ON entity_records(entity, json_extract(data, '$.is_default'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_job_type_idx ON entity_records(entity, json_extract(data, '$.job_type'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_supplier_idx ON entity_records(entity, json_extract(data, '$.supplier_id'));
      `);
    },
  },
  {
    version: 4,
    name: "supplier_linked_pricing_items",
    apply(db) {
      db.exec(`
        DROP INDEX IF EXISTS entity_records_stock_item_idx;
        DROP INDEX IF EXISTS entity_records_po_id_idx;
        DROP INDEX IF EXISTS entity_records_po_number_idx;
        DROP INDEX IF EXISTS entity_records_po_sort_order_idx;

        CREATE INDEX IF NOT EXISTS entity_records_pricing_supplier_sku_idx ON entity_records(
          entity,
          json_extract(data, '$.supplier_id'),
          json_extract(data, '$.product_number')
        );
        CREATE INDEX IF NOT EXISTS entity_records_pricing_supplier_item_code_idx ON entity_records(
          entity,
          json_extract(data, '$.supplier_id'),
          json_extract(data, '$.supplier_item_code')
        );
        CREATE INDEX IF NOT EXISTS entity_records_pricing_barcode_idx ON entity_records(entity, json_extract(data, '$.barcode'));
        CREATE INDEX IF NOT EXISTS entity_records_price_list_source_idx ON entity_records(entity, json_extract(data, '$.price_list_import_id'));
      `);
    },
  },
];

export const KNOWN_ENTITY_NAMES = new Set(Object.keys(ENTITY_DEFAULTS));

function getDatabasePath() {
  const configuredPath = path.resolve(process.env.SQLITE_PATH || DEFAULT_DATABASE_PATH);
  const vitestWorkerId = String(process.env.VITEST_WORKER_ID || "").trim();

  if (!vitestWorkerId) {
    return configuredPath;
  }

  const parsedPath = path.parse(configuredPath);
  return path.join(parsedPath.dir, `${parsedPath.name}.worker-${vitestWorkerId}${parsedPath.ext || ".sqlite"}`);
}

export function getActiveDatabasePath() {
  return getDatabasePath();
}

export async function initializeDatabase() {
  if (database) {
    return;
  }

  await initializePostgresStore();

  if (readDatabaseDriver() === "postgres") {
    // Primary Postgres mode is staged. Writes/reads still run through the deterministic SQLite store
    // during the transition release while parity checks are enforced.
    throw new Error("DATABASE_DRIVER=postgres is not enabled for primary runtime yet. Use DATABASE_DRIVER=sqlite with DATABASE_SHADOW_WRITE=true for staged cutover.");
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new BetterSqlite3(databasePath);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = NORMAL");
    database.pragma("foreign_keys = ON");
    runSchemaMigrations();
    ensurePricingModelDefaults();
    ensureScheduleStaffIdentity();
    database.pragma("optimize");
  } catch (error) {
    closeDatabase();
    throw error;
  }
}

export function getLocalUser(): LocalUser {
  return LOCAL_USER;
}

export function isKnownEntityName(entity: string) {
  return KNOWN_ENTITY_NAMES.has(String(entity || ""));
}

export function closeDatabase() {
  if (!database) {
    void closePostgresStore();
    return;
  }

  database.close();
  database = null;
  void closePostgresStore();
}

export async function resetDatabaseForTests() {
  closeDatabase();

  const databasePath = getDatabasePath();
  const relatedPaths = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  relatedPaths.forEach((targetPath) => {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  });

  await initializeDatabase();
}

export function checkpointDatabase(mode: "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE" = "TRUNCATE") {
  requireDatabase().pragma(`wal_checkpoint(${mode})`);
}

export function backupDatabaseSnapshot(targetPath: string) {
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  checkpointDatabase("TRUNCATE");
  fs.copyFileSync(databasePath, targetPath);
  return {
    path: targetPath,
    size_bytes: fs.existsSync(targetPath) ? fs.statSync(targetPath).size : 0,
  };
}

export function verifyDatabaseSnapshot(snapshotPath: string) {
  const probe = new BetterSqlite3(snapshotPath, { readonly: true });
  try {
    const integrityRow = probe.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    return {
      integrity_check: String(integrityRow?.integrity_check || ""),
    };
  } finally {
    probe.close();
  }
}

export async function restoreDatabaseSnapshot(snapshotPath: string) {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error("Database snapshot not found.");
  }

  const integrity = verifyDatabaseSnapshot(snapshotPath);
  if (integrity.integrity_check !== "ok") {
    throw new Error("Database snapshot failed integrity check.");
  }

  closeDatabase();

  const databasePath = getDatabasePath();
  const temporaryPath = `${databasePath}.restore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.tmp`;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(snapshotPath, temporaryPath);

  [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].forEach((targetPath) => {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  });

  fs.renameSync(temporaryPath, databasePath);
  await initializeDatabase();
  checkpointDatabase("TRUNCATE");
  return getDatabaseDiagnostics();
}

export function optimizeDatabase() {
  const db = requireDatabase();
  db.exec("ANALYZE");
  db.pragma("optimize");
  checkpointDatabase("PASSIVE");
  return getDatabaseDiagnostics();
}

export function listEntityRecords(entity: string, options: ListEntityOptions = {}): EntityRecord[] {
  assertKnownEntityName(entity);
  const compiledQuery = buildEntityListQuery(entity, options);
  const rows = (compiledQuery
    ? requireDatabase().prepare(compiledQuery.sql).all(...compiledQuery.params)
    : requireDatabase()
        .prepare("SELECT id, entity, data, created_date, updated_date, row_version FROM entity_records WHERE entity = ?")
        .all(entity)) as RawEntityRow[];

  let records = rows.map(hydrateRow);

  if (options.filters && !compiledQuery?.filtersAppliedInSql) {
    records = records.filter((record) => matchesFilters(record, options.filters as Record<string, unknown>));
  }

  if (options.sort && !compiledQuery?.sortAppliedInSql) {
    records = sortRecords(records, options.sort);
  }

  if (typeof options.limit === "number" && !compiledQuery?.limitAppliedInSql) {
    records = records.slice(0, options.limit);
  }

  return records;
}

export function explainEntityListQuery(entity: string, options: ListEntityOptions = {}): EntityListQueryPlanRow[] {
  assertKnownEntityName(entity);
  const compiledQuery = buildEntityListQuery(entity, options);
  const sql = compiledQuery?.sql
    || "SELECT id, entity, data, created_date, updated_date, row_version FROM entity_records WHERE entity = ?";
  const params = compiledQuery?.params || [entity];

  return requireDatabase()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params) as EntityListQueryPlanRow[];
}

export function runInTransaction<T>(callback: () => T): T {
  const db = requireDatabase();
  const transaction = db.transaction(callback);
  return transaction();
}

export function executeDatabaseStatement(sql: string) {
  requireDatabase().exec(sql);
}

export function queryDatabaseRows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return requireDatabase().prepare(sql).all(...params) as T[];
}

export function queryDatabaseRow<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  return (requireDatabase().prepare(sql).get(...params) as T | undefined) || null;
}

export function runDatabasePreparedStatement(sql: string, params: unknown[] = []) {
  return requireDatabase().prepare(sql).run(...params);
}

export function getEntityRecord(entity: string, id: string): EntityRecord | null {
  assertKnownEntityName(entity);
  const row = requireDatabase()
    .prepare("SELECT id, entity, data, created_date, updated_date, row_version FROM entity_records WHERE entity = ? AND id = ?")
    .get(entity, id) as RawEntityRow | undefined;

  return row ? hydrateRow(row) : null;
}

export function createEntityRecord(entity: string, payload: EntityData, context: MutationContext = {}): EntityRecord {
  assertKnownEntityName(entity);
  const db = requireDatabase();
  const cleanPayload = sanitisePayload(payload);
  const now = new Date().toISOString();
  const id = typeof cleanPayload.id === "string" && cleanPayload.id ? cleanPayload.id : crypto.randomUUID();
  const createdDate = typeof cleanPayload.created_date === "string" ? cleanPayload.created_date : now;
  const updatedDate = typeof cleanPayload.updated_date === "string" ? cleanPayload.updated_date : createdDate;
  const rowVersion = 1;
  const data = stripMetadata({
    ...ENTITY_DEFAULTS[entity],
    ...cleanPayload,
  });

  db.prepare(
    `
      INSERT INTO entity_records (id, entity, data, created_date, updated_date, row_version)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(id, entity, JSON.stringify(data), createdDate, updatedDate, rowVersion);

  const record: EntityRecord = {
    id,
    ...data,
    created_date: createdDate,
    updated_date: updatedDate,
    row_version: rowVersion,
  };

  writeAuditLog({
    entity,
    recordId: id,
    action: "create",
    actor: context.actor,
    requestSource: context.request_source,
    previousRecord: null,
    nextRecord: record,
    skipAudit: context.skip_audit,
  });
  queuePostgresMirror(writeEntityRecordToPostgres(entity, record));

  return record;
}

export function updateEntityRecord(entity: string, id: string, updates: EntityData, context: MutationContext = {}): EntityRecord | null {
  assertKnownEntityName(entity);
  const db = requireDatabase();
  const existing = getEntityRecord(entity, id);

  if (!existing) {
    return null;
  }

  const cleanUpdates = sanitisePayload(updates);
  const expectedRowVersion = readExpectedRowVersion(cleanUpdates, context, existing.row_version);
  if (expectedRowVersion !== existing.row_version) {
    throw new EntityConflictError("This record has changed since it was loaded. Refresh and try again.", existing);
  }

  const updatedDate = typeof cleanUpdates.updated_date === "string" ? cleanUpdates.updated_date : new Date().toISOString();
  const nextRowVersion = existing.row_version + 1;
  const mergedData = stripMetadata({
    ...ENTITY_DEFAULTS[entity],
    ...existing,
    ...cleanUpdates,
  });

  const result = db.prepare(
    `
      UPDATE entity_records
      SET data = ?, updated_date = ?, row_version = ?
      WHERE entity = ? AND id = ? AND row_version = ?
    `
  ).run(JSON.stringify(mergedData), updatedDate, nextRowVersion, entity, id, existing.row_version);

  if (result.changes === 0) {
    throw new EntityConflictError("This record was updated by someone else. Refresh and try again.", getEntityRecord(entity, id));
  }

  const record: EntityRecord = {
    id,
    ...mergedData,
    created_date: existing.created_date,
    updated_date: updatedDate,
    row_version: nextRowVersion,
  };

  writeAuditLog({
    entity,
    recordId: id,
    action: "update",
    actor: context.actor,
    requestSource: context.request_source,
    previousRecord: existing,
    nextRecord: record,
    skipAudit: context.skip_audit,
  });
  queuePostgresMirror(writeEntityRecordToPostgres(entity, record));

  return record;
}

export function deleteEntityRecord(entity: string, id: string, context: MutationContext = {}): boolean {
  assertKnownEntityName(entity);
  const db = requireDatabase();
  const existing = getEntityRecord(entity, id);

  if (!existing) {
    return false;
  }

  const expectedRowVersion =
    typeof context.expected_row_version === "number" && Number.isFinite(context.expected_row_version)
      ? context.expected_row_version
      : existing.row_version;

  if (expectedRowVersion !== existing.row_version) {
    throw new EntityConflictError("This record has changed since it was loaded. Refresh and try again.", existing);
  }

  const result = db.prepare("DELETE FROM entity_records WHERE entity = ? AND id = ? AND row_version = ?")
    .run(entity, id, expectedRowVersion);

  if (result.changes === 0) {
    throw new EntityConflictError("This record was updated by someone else. Refresh and try again.", getEntityRecord(entity, id));
  }

  writeAuditLog({
    entity,
    recordId: id,
    action: "delete",
    actor: context.actor,
    requestSource: context.request_source,
    previousRecord: existing,
    nextRecord: null,
    skipAudit: context.skip_audit,
  });
  queuePostgresMirror(deleteEntityRecordFromPostgres(entity, id));

  return true;
}

export function listAuditLogRecords(options: {
  entity?: string;
  record_id?: string;
  action?: string;
  actor_email?: string;
  request_source?: string;
  query?: string;
  limit?: number;
} = {}): AuditLogRecord[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.entity) {
    clauses.push("entity = ?");
    params.push(options.entity);
  }

  if (options.record_id) {
    clauses.push("record_id = ?");
    params.push(options.record_id);
  }

  if (options.action) {
    clauses.push("action = ?");
    params.push(options.action);
  }

  if (options.actor_email) {
    clauses.push("LOWER(actor_email) = LOWER(?)");
    params.push(options.actor_email);
  }

  if (options.request_source) {
    clauses.push("request_source = ?");
    params.push(options.request_source);
  }

  if (options.query) {
    clauses.push(`
      (
        LOWER(record_id) LIKE LOWER(?)
        OR LOWER(actor_email) LIKE LOWER(?)
        OR LOWER(actor_name) LIKE LOWER(?)
        OR LOWER(summary_json) LIKE LOWER(?)
      )
    `);
    const pattern = `%${options.query}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  let sql = `
    SELECT
      id, entity, record_id, action, actor_id, actor_email, actor_name, actor_role,
      request_source, summary_json, previous_data, next_data, created_date
    FROM audit_log
  `;

  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }

  sql += " ORDER BY created_date DESC";

  if (typeof options.limit === "number" && options.limit > 0) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }

  const rows = requireDatabase().prepare(sql).all(...params) as RawAuditRow[];
  return rows.map(hydrateAuditRow);
}

export function listEntityCounts(): Array<{ entity: string; count: number }> {
  return (requireDatabase()
    .prepare(`
      SELECT entity, COUNT(*) AS count
      FROM entity_records
      GROUP BY entity
      ORDER BY entity ASC
    `)
    .all() as Array<{ entity: string; count: number }>)
    .map((row) => ({
      entity: row.entity,
      count: Number(row.count || 0),
    }));
}

export function getDatabaseDiagnostics() {
  const db = requireDatabase();
  const databasePath = getDatabasePath();
  const journalModeRow = db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
  const pageCountRow = db.prepare("PRAGMA page_count").get() as { page_count?: number } | undefined;
  const pageSizeRow = db.prepare("PRAGMA page_size").get() as { page_size?: number } | undefined;
  const freelistRow = db.prepare("PRAGMA freelist_count").get() as { freelist_count?: number } | undefined;
  const walPath = `${databasePath}-wal`;
  const shmPath = `${databasePath}-shm`;
  const integrityRow = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;

  return {
    driver: "sqlite",
    path: databasePath,
    size_bytes: fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0,
    wal_size_bytes: fs.existsSync(walPath) ? fs.statSync(walPath).size : 0,
    shm_size_bytes: fs.existsSync(shmPath) ? fs.statSync(shmPath).size : 0,
    journal_mode: String(journalModeRow?.journal_mode || ""),
    page_count: Number(pageCountRow?.page_count || 0),
    page_size: Number(pageSizeRow?.page_size || 0),
    freelist_count: Number(freelistRow?.freelist_count || 0),
    schema_version: readSchemaVersion(),
    integrity_check: String(integrityRow?.integrity_check || ""),
    migrations: listSchemaMigrations(),
    postgres: postgresModeSummary(),
  };
}

export async function getPersistenceParitySnapshot(options: { limit?: number; entity?: string } = {}) {
  const sqliteSample = listEntityRecords(options.entity || "Job", { sort: "-updated_date", limit: Math.max(1, Math.min(200, Number(options.limit || 50))) });
  const postgres = await queryPostgresParitySnapshot(options);
  return {
    sqlite: {
      entity: options.entity || "Job",
      total_audit_rows: countAuditLogRecords(),
      sampled: sqliteSample.map((record) => ({
        id: String(record.id || ""),
        row_version: Number(record.row_version || 0),
      })),
    },
    postgres,
  };
}

export function listSchemaMigrations() {
  return (requireDatabase()
    .prepare(`
      SELECT version, name, applied_at
      FROM schema_migrations
      ORDER BY version ASC
    `)
    .all() as Array<{ version: number; name: string; applied_at: string }>)
    .map((row) => ({
      version: Number(row.version || 0),
      name: row.name,
      applied_at: row.applied_at,
    }));
}

export function countAuditLogRecords() {
  const row = requireDatabase()
    .prepare("SELECT COUNT(*) AS count FROM audit_log")
    .get() as { count?: number } | undefined;

  return Number(row?.count || 0);
}

export function listAttachmentVersions(attachmentId: string): AttachmentVersionRecord[] {
  const rows = requireDatabase()
    .prepare(`
      SELECT
        id, attachment_id, version_number, related_id, related_type, name, stored_name,
        mime_type, size, relative_path, url, checksum, source, actor_id, actor_email,
        actor_name, created_date
      FROM attachment_versions
      WHERE attachment_id = ?
      ORDER BY version_number DESC
    `)
    .all(attachmentId) as RawAttachmentVersionRow[];

  return rows.map(hydrateAttachmentVersionRow);
}

export function listAllAttachmentVersions(): AttachmentVersionRecord[] {
  const rows = requireDatabase()
    .prepare(`
      SELECT
        id, attachment_id, version_number, related_id, related_type, name, stored_name,
        mime_type, size, relative_path, url, checksum, source, actor_id, actor_email,
        actor_name, created_date
      FROM attachment_versions
      ORDER BY created_date DESC
    `)
    .all() as RawAttachmentVersionRow[];

  return rows.map(hydrateAttachmentVersionRow);
}

export function createAttachmentVersionRecord(
  payload: Omit<AttachmentVersionRecord, "id"> & { id?: string }
): AttachmentVersionRecord {
  const db = requireDatabase();
  const id = payload.id || crypto.randomUUID();

  db.prepare(`
    INSERT INTO attachment_versions (
      id, attachment_id, version_number, related_id, related_type, name, stored_name,
      mime_type, size, relative_path, url, checksum, source, actor_id, actor_email,
      actor_name, created_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    payload.attachment_id,
    payload.version_number,
    payload.related_id,
    payload.related_type,
    payload.name,
    payload.stored_name,
    payload.mime_type,
    payload.size,
    payload.relative_path,
    payload.url,
    payload.checksum,
    payload.source || "",
    payload.actor_id || "",
    payload.actor_email || "",
    payload.actor_name || "",
    payload.created_date
  );

  return {
    ...payload,
    id,
  } as AttachmentVersionRecord;
}

export function updateAttachmentVersionRecord(versionId: string, updates: Partial<AttachmentVersionRecord>) {
  const existing = requireDatabase()
    .prepare(`
      SELECT
        id, attachment_id, version_number, related_id, related_type, name, stored_name,
        mime_type, size, relative_path, url, checksum, source, actor_id, actor_email,
        actor_name, created_date
      FROM attachment_versions
      WHERE id = ?
    `)
    .get(versionId) as RawAttachmentVersionRow | undefined;

  if (!existing) {
    return null;
  }

  const merged = {
    ...hydrateAttachmentVersionRow(existing),
    ...sanitisePayload(updates),
    id: versionId,
  };

  requireDatabase().prepare(`
    UPDATE attachment_versions
    SET
      attachment_id = ?,
      version_number = ?,
      related_id = ?,
      related_type = ?,
      name = ?,
      stored_name = ?,
      mime_type = ?,
      size = ?,
      relative_path = ?,
      url = ?,
      checksum = ?,
      source = ?,
      actor_id = ?,
      actor_email = ?,
      actor_name = ?,
      created_date = ?
    WHERE id = ?
  `).run(
    merged.attachment_id,
    merged.version_number,
    merged.related_id,
    merged.related_type,
    merged.name,
    merged.stored_name,
    merged.mime_type,
    merged.size,
    merged.relative_path,
    merged.url,
    merged.checksum,
    merged.source || "",
    merged.actor_id || "",
    merged.actor_email || "",
    merged.actor_name || "",
    merged.created_date,
    versionId
  );

  return merged;
}

export function deleteAttachmentVersions(attachmentId: string) {
  requireDatabase()
    .prepare(`
      DELETE FROM attachment_versions
      WHERE attachment_id = ?
    `)
    .run(attachmentId);
}

function ensureScheduleStaffIdentity() {
  const mutationContext = {
    actor: LOCAL_USER,
    request_source: "schedule-staff-identity",
    skip_audit: true,
  } satisfies MutationContext;
  const staffRecords = listEntityRecords("Staff", { limit: 1000 });

  listEntityRecords("ScheduleLane", { limit: 500 })
    .forEach((lane) => {
      const relatedStaff = resolveLaneStaffRecord(lane, staffRecords);
      if (!relatedStaff) {
        return;
      }

      const nextStaffId = String(relatedStaff.id || "").trim();
      const nextStaffName = String(relatedStaff.name || lane.staff_name || "").trim();
      if (String(lane.staff_id || "").trim() === nextStaffId && String(lane.staff_name || "").trim() === nextStaffName) {
        return;
      }

      updateEntityRecord("ScheduleLane", lane.id, {
        staff_id: nextStaffId,
        staff_name: nextStaffName,
      }, mutationContext);
    });

  listEntityRecords("JobOperation", { limit: 5000 })
    .forEach((operation) => {
      const assignedStaffIds = resolveAssignedStaffIds(operation, staffRecords);
      const assignedTo = buildAssignedStaffDisplay(assignedStaffIds, staffRecords, String(operation.assigned_to || ""));
      const currentAssignedIds = Array.isArray(operation.assigned_staff_ids)
        ? operation.assigned_staff_ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [];

      if (currentAssignedIds.join("|") === assignedStaffIds.join("|") && String(operation.assigned_to || "").trim() === assignedTo) {
        return;
      }

      updateEntityRecord("JobOperation", operation.id, {
        assigned_staff_ids: assignedStaffIds,
        assigned_to: assignedTo,
      }, mutationContext);
    });
}

function ensurePricingModelDefaults() {
  const context = {
    actor: LOCAL_USER,
    request_source: "pricing-model-defaults",
    skip_audit: true,
  } satisfies MutationContext;

  if (listEntityRecords("LabourProfile", { filters: { is_default: true }, limit: 1 }).length === 0) {
    createEntityRecord("LabourProfile", {
      id: "millbrook-standard-labour-profile",
      ...DEFAULT_LABOUR_PROFILE,
    }, context);
  }

  const existingRules = new Set(
    listEntityRecords("PricingRule", { limit: 500 }).map((rule) => String(rule.id || ""))
  );
  DEFAULT_PRICING_RULES.forEach((rule) => {
    const id = String(rule.id || "").trim();
    if (!id || existingRules.has(id)) {
      return;
    }

    createEntityRecord("PricingRule", {
      ...rule,
      id,
    }, context);
  });

  const existingCategoriesByKey = new Map(
    listEntityRecords("PricingCategory", { limit: 500 }).map((category) => [String(category.key || category.value || ""), category])
  );

  DEFAULT_PRICING_CATEGORIES.forEach(([key, label]) => {
    if (existingCategoriesByKey.has(key)) {
      return;
    }

    createEntityRecord("PricingCategory", {
      name: label,
      label,
      key,
      value: key,
      is_active: true,
      merged_into_category_id: "",
      merged_into_category_key: "",
      merged_into_category_name: "",
    }, context);
  });

  const existingSectionsByKey = new Map(
    listEntityRecords("PricingSection", { limit: 500 }).map((section) => [String(section.key || section.value || ""), section])
  );

  DEFAULT_PRICING_SECTIONS.forEach(([key, label, displayOrder]) => {
    if (existingSectionsByKey.has(key)) {
      return;
    }

    createEntityRecord("PricingSection", {
      name: label,
      label,
      key,
      value: key,
      description: "",
      display_order: displayOrder,
      is_active: true,
    }, context);
  });
}

function requireDatabase() {
  if (!database) {
    throw new Error("Database failed to initialize");
  }

  return database;
}

function runSchemaMigrations() {
  const db = requireDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const orderedMigrations = [...SCHEMA_MIGRATIONS].sort((left, right) => left.version - right.version);
  const knownMigrations = new Map(orderedMigrations.map((migration) => [migration.version, migration]));
  const appliedMigrationRows = (
    db.prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC").all() as Array<{ version: number; name: string }>
  ).map((row) => ({
    version: Number(row.version || 0),
    name: String(row.name || ""),
  }));

  for (const row of appliedMigrationRows) {
    const migration = knownMigrations.get(row.version);
    if (!migration) {
      throw new Error(`Unsupported schema migration version ${row.version} is recorded in the database. Start with an application version that understands this database or restore a compatible backup.`);
    }

    if (migration.name !== row.name) {
      throw new Error(`Schema migration ${row.version} metadata mismatch. Expected "${migration.name}" but found "${row.name}". Restore a valid backup before continuing.`);
    }
  }

  const appliedVersions = new Set(appliedMigrationRows.map((row) => row.version));
  const highestAppliedVersion = appliedMigrationRows.reduce((highest, row) => Math.max(highest, row.version), 0);
  for (const migration of orderedMigrations) {
    if (migration.version > highestAppliedVersion) {
      break;
    }

    if (!appliedVersions.has(migration.version)) {
      throw new Error(`Schema migration history is incomplete. Version ${migration.version} is missing before applied version ${highestAppliedVersion}. Restore a valid backup before continuing.`);
    }
  }

  let appliedAnyMigration = false;
  const applyMigration = db.transaction((migration: SchemaMigration) => {
    migration.apply(db);
    db.prepare(`
      INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `).run(migration.version, migration.name, new Date().toISOString());
  });

  for (const migration of orderedMigrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    applyMigration(migration);
    appliedVersions.add(migration.version);
    appliedAnyMigration = true;
  }

  const recordedVersionRows = (
    db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all() as Array<{ version: number }>
  ).map((row) => Number(row.version || 0));
  const expectedVersionRows = orderedMigrations.map((migration) => migration.version);
  if (recordedVersionRows.join(",") !== expectedVersionRows.join(",")) {
    throw new Error("Schema migration history does not match the application migration registry.");
  }

  if (appliedAnyMigration) {
    db.exec("ANALYZE");
  }

  db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
}

function readSchemaVersion() {
  const row = requireDatabase().prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  return Number(row?.user_version || 0);
}

function hydrateRow(row: RawEntityRow): EntityRecord {
  const parsed = JSON.parse(row.data) as EntityData;
  return {
    id: row.id,
    ...parsed,
    created_date: row.created_date,
    updated_date: row.updated_date,
    row_version: Number(row.row_version || 1),
  };
}

function hydrateAuditRow(row: RawAuditRow): AuditLogRecord {
  return {
    id: row.id,
    entity: row.entity,
    record_id: row.record_id,
    action: row.action,
    actor_id: row.actor_id,
    actor_email: row.actor_email,
    actor_name: row.actor_name,
    actor_role: row.actor_role,
    request_source: row.request_source,
    summary: safeJsonParse(row.summary_json, {}),
    previous_data: row.previous_data ? safeJsonParse(row.previous_data, null) : null,
    next_data: row.next_data ? safeJsonParse(row.next_data, null) : null,
    created_date: row.created_date,
  };
}

function hydrateAttachmentVersionRow(row: RawAttachmentVersionRow): AttachmentVersionRecord {
  return {
    id: row.id,
    attachment_id: row.attachment_id,
    version_number: Number(row.version_number || 1),
    related_id: row.related_id,
    related_type: row.related_type,
    name: row.name,
    stored_name: row.stored_name,
    mime_type: row.mime_type,
    size: Number(row.size || 0),
    relative_path: row.relative_path,
    url: row.url,
    checksum: row.checksum,
    source: row.source,
    actor_id: row.actor_id,
    actor_email: row.actor_email,
    actor_name: row.actor_name,
    created_date: row.created_date,
  };
}

function sanitisePayload(payload: EntityData): EntityData {
  return sanitizeUnknown(payload, true) as EntityData;
}

function stripMetadata(payload: EntityData): EntityData {
  const { id, created_date, updated_date, row_version, ...rest } = payload;
  void id;
  void created_date;
  void updated_date;
  void row_version;
  return rest;
}

function readExpectedRowVersion(cleanUpdates: EntityData, context: MutationContext, fallback: number) {
  if (typeof context.expected_row_version === "number" && Number.isFinite(context.expected_row_version)) {
    return context.expected_row_version;
  }

  if (typeof cleanUpdates.row_version === "number" && Number.isFinite(cleanUpdates.row_version)) {
    return cleanUpdates.row_version;
  }

  return fallback;
}

function matchesFilters(record: EntityRecord, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, expected]) => {
    const actual = record[key];
    const inFilter = readInFilterValues(expected);

    if (inFilter) {
      return inFilter.some((value) => actual === value);
    }

    if (Array.isArray(expected)) {
      return Array.isArray(actual) && JSON.stringify(actual) === JSON.stringify(expected);
    }

    return actual === expected;
  });
}

const ENTITY_METADATA_FIELDS = new Set(["id", "entity", "created_date", "updated_date", "row_version"]);
const SQL_SORT_NATIVE_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "row_version",
  "sort_order",
  "date",
  "start_date",
  "due_date",
  "exported_at",
]);
const SQL_SORT_TEXT_FIELDS = new Set([
  "email",
  "name",
  "last_name",
  "first_name",
  "job_number",
  "quote_number",
  "po_number",
  "status",
  "label",
  "title",
  "employee_id",
  "assigned_to",
]);

function buildEntityListQuery(entity: string, options: ListEntityOptions): CompiledEntityListQuery | null {
  const params: unknown[] = [entity];
  const clauses = ["entity = ?"];
  let filtersAppliedInSql = false;
  let sortAppliedInSql = false;
  let limitAppliedInSql = false;

  const compiledFilters = options.filters ? compileSqlFilters(options.filters) : null;
  if (compiledFilters && compiledFilters.clauses.length > 0) {
    clauses.push(...compiledFilters.clauses);
    params.push(...compiledFilters.params);
    filtersAppliedInSql = true;
  }

  const compiledSort = typeof options.sort === "string" ? compileSqlSort(options.sort) : null;
  const canApplySqlSort = Boolean(compiledSort) && (!options.filters || filtersAppliedInSql);
  const canApplySqlLimit =
    typeof options.limit === "number"
    && (!options.filters || filtersAppliedInSql)
    && (!options.sort || canApplySqlSort);

  if (!filtersAppliedInSql && !canApplySqlSort && !canApplySqlLimit) {
    return null;
  }

  let sql = `
    SELECT id, entity, data, created_date, updated_date, row_version
    FROM entity_records
    WHERE ${clauses.join(" AND ")}
  `;

  if (canApplySqlSort && compiledSort) {
    sql += ` ORDER BY ${compiledSort}`;
    sortAppliedInSql = true;
  }

  if (canApplySqlLimit) {
    sql += " LIMIT ?";
    params.push(options.limit as number);
    limitAppliedInSql = true;
  }

  return {
    sql,
    params,
    filtersAppliedInSql,
    sortAppliedInSql,
    limitAppliedInSql,
  };
}

function compileSqlFilters(filters: Record<string, unknown>) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, expected] of Object.entries(filters)) {
    const valueExpression = getSqlFieldExpression(key);
    if (!valueExpression) {
      return null;
    }

    const inFilter = readInFilterValues(expected);
    if (inFilter) {
      if (inFilter.length === 0) {
        clauses.push("0 = 1");
        continue;
      }

      const includesNull = inFilter.some((value) => value === null);
      const scalarValues = inFilter.filter((value) => value !== null);
      const inClauses: string[] = [];

      if (scalarValues.length > 0) {
        inClauses.push(`${valueExpression} IN (${scalarValues.map(() => "?").join(", ")})`);
        params.push(...scalarValues.map((value) => normalizeSqlScalar(value)));
      }

      if (includesNull) {
        inClauses.push(`${valueExpression} IS NULL`);
      }

      clauses.push(`(${inClauses.join(" OR ")})`);
      continue;
    }

    if (Array.isArray(expected) || (expected != null && typeof expected === "object")) {
      return null;
    }

    if (expected === null) {
      clauses.push(`${valueExpression} IS NULL`);
      continue;
    }

    clauses.push(`${valueExpression} = ?`);
    params.push(normalizeSqlScalar(expected));
  }

  return { clauses, params };
}

function readInFilterValues(expected: unknown): Array<string | number | boolean | null> | null {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    return null;
  }

  const candidate = Object.prototype.hasOwnProperty.call(expected, "$in")
    ? (expected as { $in?: unknown }).$in
    : null;

  if (!Array.isArray(candidate)) {
    return null;
  }

  const normalizedValues = candidate.filter(
    (value) => value === null || ["string", "number", "boolean"].includes(typeof value)
  );

  return normalizedValues.length === candidate.length
    ? normalizedValues as Array<string | number | boolean | null>
    : null;
}

function compileSqlSort(sortExpression: string) {
  const descending = sortExpression.startsWith("-");
  const key = descending ? sortExpression.slice(1) : sortExpression;
  const valueExpression = getSqlFieldExpression(key);
  if (!valueExpression) {
    return null;
  }

  const nullOrder = descending ? "DESC" : "ASC";
  const direction = descending ? "DESC" : "ASC";

  if (SQL_SORT_NATIVE_FIELDS.has(key)) {
    return `${valueExpression} IS NULL ${nullOrder}, ${valueExpression} ${direction}`;
  }

  if (SQL_SORT_TEXT_FIELDS.has(key)) {
    return `${valueExpression} IS NULL ${nullOrder}, ${valueExpression} COLLATE NOCASE ${direction}`;
  }

  return null;
}

function getSqlFieldExpression(key: string) {
  if (!/^[A-Za-z0-9_]+$/.test(key)) {
    return null;
  }

  if (ENTITY_METADATA_FIELDS.has(key)) {
    return key;
  }

  return `json_extract(data, '$.${key}')`;
}

function normalizeSqlScalar(value: unknown) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
}

function sortRecords(records: EntityRecord[], sortExpression: string) {
  const descending = sortExpression.startsWith("-");
  const key = descending ? sortExpression.slice(1) : sortExpression;

  return [...records].sort((left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    const result = compareValues(leftValue, rightValue);
    return descending ? -result : result;
  });
}

function compareValues(leftValue: unknown, rightValue: unknown) {
  if (leftValue == null && rightValue == null) {
    return 0;
  }

  if (leftValue == null) {
    return 1;
  }

  if (rightValue == null) {
    return -1;
  }

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "boolean" && typeof rightValue === "boolean") {
    return Number(leftValue) - Number(rightValue);
  }

  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function writeAuditLog(input: {
  entity: string;
  recordId: string;
  action: string;
  actor?: MutationActor | null;
  requestSource?: string;
  previousRecord: EntityRecord | null;
  nextRecord: EntityRecord | null;
  skipAudit?: boolean;
}) {
  if (input.skipAudit) {
    return;
  }

  const actor = input.actor || null;
  const summary = buildAuditSummary(input.previousRecord, input.nextRecord);

  const createdDate = new Date().toISOString();
  const id = crypto.randomUUID();
  requireDatabase().prepare(`
    INSERT INTO audit_log (
      id, entity, record_id, action, actor_id, actor_email, actor_name, actor_role,
      request_source, summary_json, previous_data, next_data, created_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.entity,
    input.recordId,
    input.action,
    actor?.id || "",
    actor?.email || "",
    actor?.full_name || "",
    actor?.role || "",
    input.requestSource || "",
    JSON.stringify(summary),
    input.previousRecord ? JSON.stringify(input.previousRecord) : null,
    input.nextRecord ? JSON.stringify(input.nextRecord) : null,
    createdDate
  );

  queuePostgresMirror(writeAuditLogToPostgres({
    id,
    entity: input.entity,
    recordId: input.recordId,
    action: input.action,
    actor,
    requestSource: input.requestSource,
    summary,
    previousRecord: input.previousRecord,
    nextRecord: input.nextRecord,
    createdDate,
  }));
}

function queuePostgresMirror(promise: Promise<unknown>) {
  promise.catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[db] postgres_mirror_failed", message);
  });
}

function buildAuditSummary(previousRecord: EntityRecord | null, nextRecord: EntityRecord | null) {
  if (!previousRecord && nextRecord) {
    return {
      changed_fields: Object.keys(stripMetadata(nextRecord)).sort(),
      row_version: nextRecord.row_version,
    };
  }

  if (previousRecord && !nextRecord) {
    return {
      changed_fields: Object.keys(stripMetadata(previousRecord)).sort(),
      row_version: previousRecord.row_version,
    };
  }

  const changedFields = new Set<string>();
  const keySet = new Set<string>([
    ...Object.keys(stripMetadata(previousRecord || {})),
    ...Object.keys(stripMetadata(nextRecord || {})),
  ]);

  for (const key of keySet) {
    const left = previousRecord?.[key];
    const right = nextRecord?.[key];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changedFields.add(key);
    }
  }

  return {
    changed_fields: [...changedFields].sort(),
    from_row_version: previousRecord?.row_version || 0,
    to_row_version: nextRecord?.row_version || 0,
  };
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function assertKnownEntityName(entity: string) {
  if (!isKnownEntityName(entity)) {
    throw new Error(`Unknown entity: ${entity}`);
  }
}

function sanitizeUnknown(value: unknown, isRoot = false): unknown {
  if (value === undefined) {
    return isRoot ? {} : undefined;
  }

  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeUnknown(item))
      .filter((item) => item !== undefined);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key) || nestedValue === undefined) {
        continue;
      }

      const sanitizedValue = sanitizeUnknown(nestedValue);
      if (sanitizedValue !== undefined) {
        output[key] = sanitizedValue;
      }
    }

    return output;
  }

  return String(value);
}
