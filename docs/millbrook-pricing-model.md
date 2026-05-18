# Millbrook Pricing Model

The pricing model is a deterministic rule engine for converting Mozaik material CSV exports into internal quote calculations. It is built on JoinerFlow's local entity store, so every pricing record is editable and auditable through the same record and audit patterns used by the rest of the app.

## Data Model

The module registers these entity-backed tables:

- `PricingItem`
- `PricingItemLearningAudit`
- `PricingItemActionAudit`
- `PricingItemAutoInclusion`
- `AutoInclusionAuditLog`
- `PricingRule`
- `QuoteImport`
- `PricingQuoteItem`
- `QuoteAutoInclusion`
- `QuoteCalculation`
- `QuoteScenario`
- `QuoteOverride`
- `LabourProfile`
- `HistoricalJob`
- `SupplierPriceList`
- `PriceListImport`
- `PriceListImportRow`
- `SupplierColumnMapping`
- `SupplierImportProfile`
- `PricingItemPriceHistory`
- `ImportRollbackLog`

Migration `pricing_model_entities` adds indexes for quote, import, category, active/default flags, job type, and supplier lookups.

## Defaults

Startup seeds a default `LabourProfile` and default `PricingRule` records when they do not already exist. Edit those records to change:

- Labour sell rate, selectable rates, internal labour cost
- Material markup and GST
- Complexity multipliers
- Margin targets
- Labour assumptions
- Auto-inclusion rules and buy prices

The calculation service receives these records as inputs. Pricing defaults are not hidden inside UI-only code.

## CSV Mapping

The Mozaik importer accepts a configurable `column_mapping` object. Each field maps to a list of accepted CSV headers. Supported normalized fields are:

- `name`
- `description`
- `material_type`
- `quantity`
- `unit`
- `product_number`
- `length_mm`
- `width_mm`
- `thickness_mm`
- `cabinet_reference`
- `edging`
- `hardware_tags`

The importer also detects Mozaik heading rows such as Materials, Banding, Hinges, Pulls, Shelf Pins, and Fasteners. Heading rows are not imported as priced lines; the heading is assigned as the category context for the following items until the next heading.

The raw CSV or original uploaded file is stored on `QuoteImport`; parsed rows are stored on `QuoteImport.structured_items`. When the import is launched from a quote, the same endpoint also stages linked `PricingQuoteItem` rows for that quote.

## Rule Format

Rules are stored as `PricingRule` records:

```json
{
  "name": "Drawer system fixings",
  "is_active": true,
  "condition": { "category": "drawer_systems_runners" },
  "triggered_items": [
    {
      "name": "Euro screws",
      "category": "misc_fixings",
      "unit": "ea",
      "buy_price": 0.08,
      "markup_percent": 30,
      "quantity_formula": "per_unit_quantity",
      "quantity": 4
    }
  ],
  "reason": "Drawer systems require euro screws and runner fixing screws.",
  "sort_order": 10
}
```

Supported condition fields:

- `category`
- `tag`
- `name_contains`
- `material_type_contains`

Supported quantity formulas:

- `fixed`
- `per_item`
- `per_unit_quantity`
- `per_cabinet`

Every triggered inclusion includes the rule ID, rule name, source item IDs, and reason.

## API

- `POST /api/pricing/imports/mozaik`
  Imports raw CSV or uploaded CSV/XLSX files, stores `QuoteImport`, and returns structured items plus warnings. Passing `quote_id` links the import to the selected quote and creates quote pricing review rows.

- `POST /api/pricing/calculate`
  Calculates totals, warnings, scenarios, and historical comparison. Pass `persist: true` to store a `QuoteCalculation` and `QuoteScenario` records.

Both routes require the `pricing` module to be enabled.

## Supplier Price List Imports

Use the `Price lists` tab inside `/pricing` to stage supplier price lists before updating live pricing.

Workflow:

1. Enter the supplier name.
2. Upload a `.csv`, `.xlsx`, or `.pdf` file.
3. Optionally provide a JSON column mapping, for example:

```json
{
  "product_number": "SKU",
  "description": "Description",
  "unit_cost_ex_gst": "Net Price",
  "unit": "UOM",
  "pack_quantity": "Pack Qty"
}
```

4. Stage the import and review matched, unchanged, new, warning, and error rows.
5. Commit matched rows only, or commit and create valid new items.
6. Roll back a committed import from the recent imports list if needed.

The importer matches rows in this order:

- Supplier + normalized SKU
- Supplier + product number / SKU
- Supplier + supplier item code
- Barcode
- Exact description and dimensions match within the same supplier
- Manual review / new item

SKUs are normalized before matching. For example `770 C 600` becomes `770C600`, and `LEGRABOX-500MM` becomes `LEGRABOX500`. Both the original and normalized SKU are preserved on pricing items and price history records.

PDF price lists are parsed through the same staging workflow. Text-based PDFs are table-extracted directly; scanned/OCR-derived rows carry source page and confidence metadata and are always staged for review before commit. GST-inclusive prices are converted to ex GST at 15% and flagged as calculated.

Supplier import profiles store column mappings, preferred price fields, category/unit rules, SKU patterns, GST handling, and price priority logic. Saved profiles are reused for future imports from the same supplier and can be overridden by mapping JSON during staging.

The staging step stores the uploaded file, supplier, file name, importer, mapping, row previews, warnings, and errors. Live `PricingItem` records are not changed until commit.

During commit the server runs updates in a transaction. It updates supplier pricing fields and buy cost, writes `PricingItemPriceHistory` for price changes, and preserves Millbrook-managed fields such as markup, active status, rule links, and internal category overrides.

Rollback restores previous prices and mapped supplier fields from the staged row snapshots, keeps the price history, creates an `ImportRollbackLog`, and marks the import as `rolled_back`.

Warnings include missing SKU, duplicate uploaded SKU, duplicate database SKU, missing unit, missing cost, GST-inclusive conversion, pack quantity changes, supplier mismatch, inactive matches, and price movements over the configured threshold. The default movement threshold is 15%.

## Quotes Integration

The Pricing tab on a quote supports quote-level imports for supplier quotes, supplier invoices, estimates, generic pricing PDFs, CSV files, XLSX/Excel files, and Mozaik material exports. These imports are deliberately separate from supplier price list imports:

- Supplier price list imports update master `PricingItem` records and price history after commit.
- Quote-level imports create line items for the current quote only after review and confirmation.
- PDF quote/invoice imports bypass column mapping and go straight through automatic extraction into the review screen.
- CSV and XLSX imports remain table imports and use the Mozaik/header mapping path.

Quote-level imports use `POST /api/pricing/quote-imports/stage` followed by `POST /api/pricing/quote-imports/:id/commit`. Staging stores the original uploaded file on `QuoteImport`, extracts review rows into `PricingQuoteItem`, and does not create live `QuoteItem` rows. Commit creates `QuoteItem` records with source file name/type, source row/page, original imported values, parsed normalized values, confidence score, import ID, and creator metadata.

CSV and XLSX quote imports use the Mozaik heading exclusion, category carry-forward, SKU normalization, and master price matching where available. Missing prices stay visible in review and can be edited before commit.

PDF quote imports attempt to detect the document type as a supplier quote, supplier invoice, supplier estimate, or generic pricing document. They extract supplier name, supplier GST number, email/phone, document number, quote/invoice/estimate date, due date or valid-until date, account/project references, salesperson/rep, designer/contact, product rows, quantities, discounts, rates, totals, GST exclusive subtotal, GST amount, GST inclusive total, GST treatment, notes, source page, and confidence.

The PDF importer treats `total_inc_gst` as the primary validation total. It recognizes labels such as GST Inclusive, GST Inclusive Total, Total Including GST, Total Inc GST, Inc GST Total, Total Inclusive GST, Amount Due, Balance Due, Invoice Total, Quote Total, Grand Total, Total Price, Total NZD, and Total. If only an ex-GST subtotal is found, the importer calculates the inc-GST total using 15% GST and flags calculated values in metadata. If only an inc-GST total is found, quote line buy cost is converted back to ex GST for costing.

If line-level rows are clear, each row becomes a staged quote item and the extracted document totals are retained for reconciliation. If line rows are unclear but a final inc-GST total is clear, the importer stages one quote line using the document summary and calculated ex-GST cost. OCR-derived values are staged only and require user confirmation before quote items are created.

Woodsmiths-style supplier quotes such as `Q-1898` are handled as line-oriented PDFs. Item codes like `TT-SQL`, `IPP`, and `FREIGHT` are extracted with their descriptions, quantities, ex-GST rates, and line totals. The statement “These prices are all Excluding GST” sets the import GST treatment to ex GST. Trimtek aluminium doors map to `doors_fronts`; protection packaging maps to `packaging_freight`; freight maps to `freight_delivery`.

Quote-level supplier imports warn when no inc-GST total is found, GST treatment is unclear, a total label is ambiguous, multiple possible totals are detected, line totals do not reconcile to the GST exclusive subtotal, GST does not reconcile to the inclusive total, the supplier cannot be identified, the quote appears expired, quantities/rates/codes are missing, OCR confidence is low, or duplicate imported lines are detected.

The quote Pricing tab groups imports by source file and shows document type, supplier name, document number, file type, import date, item count, total buy price, total sell price, extracted inc-GST total, GST status, warnings, and commit actions. For PDF imports, users can edit document type, document number, extracted inc-GST total, ex-GST subtotal, GST amount, GST treatment, document date, and due/valid-until date before commit. Review rows can be edited, split, merged, excluded, saved as future defaults, or staged as deleted before adding them to the quote. Users can add rows as a new version or replace existing quote-level imported line items.

After an import has been committed, editing the review rows marks the import as needing a line-item update. The `Update line items` action reapplies the current review values to the linked `QuoteItem` records, recalculates line buy/sell totals, refreshes quote subtotal/GST/total, updates import warnings, and writes `QuoteLineItemUpdateAudit` records for changed fields. Master pricing defaults are not changed by this action.

Every quote-level pricing import is also attached to the quote's Files section. The uploaded file is stored once, linked to both the `QuoteImport` and the quote file attachment record, and reused when the same import file is staged again. Pricing-import attachments carry source metadata such as import type, document type, supplier name, document number, imported-by user, item count, extracted inc-GST total, extracted ex-GST subtotal, extracted GST amount, and extracted value where available.

Quote files include an editable `document_information` field for free-form document context. Pricing imports pre-populate it with a concise import summary, for example a supplier quote PDF summary with supplier, quote number, item count, ex-GST total, and inc-GST total, or a Mozaik CSV/XLSX summary with extracted quote line item count. Users can edit this field later from the Quote Files list or file details view.

Quote workflow tasks marked `Unassigned` can be assigned in place from the Quotes workflow tab. The UI updates immediately, persists the selected staff member to the `JobOperation`, and rolls the local state back if the save fails.

## Item Learning And Review Controls

The pricing review tables support safe local review states:

- `active`: included in pricing/import commit.
- `excluded`: kept visible but ignored in calculations or commits.
- `deleted`: staged for removal from the current quote/import only.

Bulk exclude/delete actions are local until the user saves or commits, and undo is available before commit. These actions do not hard-delete pricing records.

Master defaults are updated only through the explicit `Save edited defaults` action. The user is asked whether changes should apply to future quotes; cancelling keeps them on the current quote/import only. Eligible saved fields include category, buy price, markup, unit, supplier, product number/SKU, waste factor, labour defaults, default inclusion behaviour, and optionally notes.

Each master default change creates `PricingItemLearningAudit` records with the item, field, old value, new value, source quote/import, user, and timestamp. New defaults are marked as user-created.

Master item removal is a soft delete only. `POST /api/pricing/items/:id/deactivate` sets `is_active=false`, only allows user-created items, records a `PricingItemActionAudit`, and preserves historical quote integrity.

## Persistent Auto-Inclusions

Imported item rows have an `Auto-inclusions` action in the item review table. The modal shows the parent item name, SKU, configured inclusion lines, quantity logic, calculated quantity preview, unit cost, markup, and warning indicators for missing inclusion price.

Supported quantity logic:

- `fixed`
- `per_imported_item`
- `per_set`
- `custom_multiplier`
- `custom_formula`

Saved master defaults are stored in `PricingItemAutoInclusion` against the parent pricing item. On future imports, matching master items preload these inclusions by supplier/SKU or item name matching and they are visibly marked as applied. Quote-only inclusions stay on the current imported row and are included in internal costing only for that calculation.

`POST /api/pricing/items/:id/auto-inclusions` stores persistent defaults when `save_as_default` is true and writes `AutoInclusionAuditLog` records containing the old rule set, new rule set, source quote/import, user, and timestamp. Existing default inclusion rules are deactivated rather than hard-deleted.

Configured inclusions are included in internal calculations through the normal auto-inclusion calculation path. They remain visible in quote review and are not shown in the client-facing output unless explicitly promoted there.

### Every Job Inclusions

Pricing -> Auto-inclusions includes an `Every Job Inclusions` tab for global defaults such as Freight, packaging, delivery allowance, installation consumables, and workshop consumables.

Each rule stores description, category, quantity, unit, cost, markup, GST treatment, active state, review-required state, and notes. Active rules are added once to newly created quotes and quote-pricing import updates. They are linked to quote line items with `source=global_auto_inclusion` and `source_rule_id`, included in quote totals, and never overwrite manual quote rows.

Auto-added quote rows appear in the Quote List with an `Auto-added` badge and `auto_added_needs_review` status until confirmed. Users can confirm one row or confirm all auto-added rows. Edits and removals affect only that quote; changing the global rule affects future quotes only. Existing quotes are unchanged unless the user manually applies Every Job Inclusions to the selected quote from Pricing.

Audit is written to `GlobalAutoInclusionAudit` when a global rule is added to a quote, confirmed, edited, excluded, or removed.

## Supplier-Linked Pricing

Stock and Purchasing are no longer separate JoinerFlow modules. Supplier records are retained and linked directly to `PricingItem`, supplier price-list imports, quote costing, price history, and auto-inclusions.

Pricing items carry supplier identifiers such as supplier ID/name, SKU/product number, supplier item code, barcode, supplier category, unit, pack quantity, buy price excluding GST, optional GST-inclusive price, last imported price, last update date, and price-list import source. Historical Stock/Purchasing rows are not hard-deleted by cleanup; they are simply no longer exposed as live modules or generic entity types.

## Drag And Drop Uploads

The material import and supplier price-list import panels accept drag-and-drop or browse/select uploads. Supported files are `.csv` and `.xlsx`, single-file by default, max 25MB. The UI shows file name, size, type, detected CSV row count, and status states such as waiting for file, uploading, ready for mapping, needs review, ready to commit, complete, and failed.

Duplicate file processing asks for confirmation before replacing the current upload. Unsupported types, oversize files, empty files, corrupt workbooks, and parse failures are rejected before commit.

## Testing

Core coverage lives in `server/src/pricingModel.test.ts` and covers:

- CSV parsing
- Rule-based auto-inclusions
- Labour and pricing calculations
- Margin warning logic
- Scenario generation
- Historical anomaly checks
- Supplier CSV and XLSX price-list parsing
- Column mapping and SKU matching
- Staged import preview, commit, price history, and rollback
- Persistent default learning and master soft-delete audit
- Persistent item auto-inclusion audit
