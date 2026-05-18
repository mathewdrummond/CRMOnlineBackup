export const HELP_CATEGORIES = [
  "Getting Started",
  "Leads & Contacts",
  "Quotes",
  "Pricing",
  "Imports",
  "Install Planner",
  "Jobs & Workflow",
  "Documents",
  "Files",
  "Suppliers",
  "Reporting",
  "Time Tracking",
  "Administration",
  "Troubleshooting",
  "UX Review",
];

export const HELP_ARTICLE_TYPES = ["overview", "guide", "workflow", "reference", "training", "troubleshooting", "review"];

export const HELP_ARTICLES = [
  {
    id: "getting-started-overview",
    title: "Getting Started with JoinerFlow",
    category: "Getting Started",
    type: "overview",
    audience: "all",
    summary: "Learn the layout, module names, and daily navigation pattern used across JoinerFlow.",
    keywords: ["start", "dashboard", "operations", "navigation", "overview", "new user"],
    updatedAt: "2026-05-07",
    openRoute: "/",
    relatedRoutes: ["/", "/dashboard", "/leads", "/quotes", "/pricing", "/jobs", "/schedule"],
    relatedArticles: ["first-day-setup", "terminology-and-data-model", "quotes-workflow"],
    featured: true,
    sections: [
      {
        heading: "What you see first",
        paragraphs: [
          "JoinerFlow is organised around the real cabinetry workflow: Leads and Contacts feed Quotes, Quotes feed Jobs, Jobs feed the Install Planner, and Pricing supports both quote creation and supplier cost control.",
          "The left navigation is grouped into Command, Sales & CRM, Delivery & Ops, Business, and Admin. The most common daily screens are Operations, Quotes, Pricing, Jobs, Install Planner, Suppliers, and Time Clock.",
        ],
        bullets: [
          "Operations: the command centre for quotes, install runway, and follow-up.",
          "Quotes: customer quote records and client-facing document generation.",
          "Pricing: Millbrook pricing model, imports, price lists, categories, sections, and auto-inclusions.",
          "Jobs: live delivery records after a quote is converted.",
          "Install Planner: install scheduling, crews, and estimator-driven durations.",
        ],
      },
      {
        heading: "How navigation behaves",
        paragraphs: [
          "The top search bar jumps to jobs, enquiries, quotes, contacts, and companies. Most list screens open detail records when you click a row.",
          "Detail screens usually follow the same pattern: overview information first, then tabs for workflow, costing, files, history, or operations.",
        ],
        bullets: [
          "Quotes screen: create a quote, then open the quote record for pricing, quote list items, files, and document generation.",
          "Pricing screen: use tabs for CSV upload, price lists, categories, sections, item review, labour, auto-inclusions, scenarios, history, and summary.",
          "Install Planner: switch between unified, staff, and crew lanes depending on how you want to schedule work.",
        ],
      },
      {
        heading: "Best practice for new users",
        steps: [
          "Open Operations to understand what currently needs attention.",
          "Review Contacts and Leads so you know how customer records are stored.",
          "Create or open a Quote before working with quote-level pricing imports.",
          "Use Pricing for reusable defaults, supplier pricing, sections, categories, and inclusion rules.",
          "Use Jobs and Install Planner only after a quote is commercially ready or won.",
        ],
      },
      {
        heading: "Common mistakes to avoid",
        bullets: [
          "Do not treat Categories and Sections as the same thing. Categories drive costing logic; Sections group the quote list and client documents.",
          "Do not assume imports update master pricing automatically. Quote-level imports stay quote-specific unless you deliberately save defaults.",
          "Do not treat a Job as the same record as a Quote. Jobs are the delivery record created after conversion.",
        ],
      },
    ],
  },
  {
    id: "first-day-setup",
    title: "First Day Setup Guide",
    category: "Getting Started",
    type: "training",
    audience: "all",
    summary: "A practical checklist for preparing staff, access, pricing defaults, and installs before live use.",
    keywords: ["first day", "setup", "staff", "access", "defaults", "pricing", "training"],
    updatedAt: "2026-05-07",
    openRoute: "/access",
    relatedRoutes: ["/access", "/staff", "/pricing", "/suppliers", "/schedule"],
    relatedArticles: ["getting-started-overview", "admin-and-settings", "pricing-overview"],
    featured: true,
    sections: [
      {
        heading: "Admin checklist",
        steps: [
          "Open Access & Modules and confirm only the modules you want live are enabled.",
          "Open Staff and make sure each team member has the right name and MYOB/time clock details where needed.",
          "Open Suppliers and create the key supplier records you import pricing from.",
          "Open Pricing and review labour rates, categories, sections, Every Job Automatic Additions, and Matched Automatic Additions before users start pricing.",
          "Open Install Planner and set up crews plus estimator defaults if you will schedule by crew.",
        ],
        notes: [
          "Show Me How: First login shows where access, staff, pricing, and planner setup live.",
          "Show Me How: Auto-inclusions demonstrates Every Job Automatic Additions and Matched Automatic Additions.",
        ],
      },
      {
        heading: "Commercial checklist",
        bullets: [
          "Confirm quote statuses and approval owners match your current workflow.",
          "Review document templates before issuing client-facing quotes or contracts.",
          "Test one quote import and one supplier price list import before staff use the system live.",
          "Check that company branding and GST wording in generated documents are correct.",
        ],
      },
      {
        heading: "Suggested training order",
        steps: [
          "Leads and Contacts",
          "Quotes and quote detail",
          "Pricing module and imports",
          "Quote document generation",
          "Jobs and Install Planner",
          "Files, reporting, and time tracking",
        ],
      },
    ],
  },
  {
    id: "terminology-and-data-model",
    title: "Terminology and Data Model",
    category: "Getting Started",
    type: "reference",
    audience: "all",
    summary: "Use the same terms the application uses so pricing, quoting, and scheduling stay consistent.",
    keywords: ["terminology", "category", "section", "quote", "job", "pricing item", "line item"],
    updatedAt: "2026-05-07",
    openRoute: "/help",
    relatedRoutes: ["/quotes", "/pricing", "/jobs", "/schedule"],
    relatedArticles: ["getting-started-overview", "pricing-categories-and-sections", "quotes-workflow"],
    sections: [
      {
        heading: "Core terms",
        bullets: [
          "Lead / Enquiry: a sales opportunity before it becomes quoted work.",
          "Contact: a person record. Company records are linked separately where needed.",
          "Quote: the customer quote record used for pricing, client documents, approvals, and conversion to a job.",
          "Job: the delivery record used for operations after a quote is won or direct work is created.",
          "Pricing item: a reusable cost/default record in the Pricing module, often supplier-linked.",
          "Quote line item: a sell line on a specific quote.",
          "Import: an uploaded file. Quote-level imports stay on the quote. Supplier price list imports update master pricing.",
        ],
      },
      {
        heading: "Category versus Section",
        paragraphs: [
          "Category answers “what kind of thing is this for pricing logic?” Examples include labour, hardware, subcontract, hinges, or packaging.",
          "Section answers “where should this appear in the quote list and document grouping?” Examples include Materials, Doors, Hardware, Labour, Freight, and Installation.",
        ],
        bullets: [
          "Categories affect markup, rules, reporting, and auto-inclusion logic.",
          "Sections affect grouping, ordering, and client-facing quote layout.",
        ],
      },
      {
        heading: "Install planner terms",
        bullets: [
          "Install task: a scheduled operation such as install, measure, delivery, service call, or admin/prep.",
          "Lane: the row a task sits in on the planner. Depending on view, a lane can represent unified capacity, a staff member, or a crew.",
          "Locked task: a task the auto-scheduler will not move.",
        ],
      },
    ],
  },
  {
    id: "leads-and-contacts",
    title: "Leads and Contacts Workflow",
    category: "Leads & Contacts",
    type: "workflow",
    audience: "sales",
    summary: "Capture enquiries cleanly, link them to contacts, and jump from Quote in Progress leads into the latest quote.",
    keywords: ["leads", "contacts", "enquiry", "quote in progress", "customer", "new lead"],
    updatedAt: "2026-05-07",
    openRoute: "/leads",
    relatedRoutes: ["/leads", "/leads/:id", "/contacts", "/contacts/:id"],
    relatedArticles: ["getting-started-overview", "quotes-workflow"],
    sections: [
      {
        heading: "Lead register",
        paragraphs: [
          "The Leads page tracks early-stage sales work. You can create a new lead, convert a lead into later-stage work, and sort or filter the register without losing the current list state.",
          "When a lead is at Quote in Progress, the stage badge is clickable and opens the most recent related quote if one exists.",
        ],
        bullets: [
          "If no quote is found, JoinerFlow shows a message instead of opening a broken route.",
          "Use Contacts for the master person record. Leads can create a new contact during enquiry capture when the customer is not already in the list.",
        ],
      },
      {
        heading: "Best practice",
        bullets: [
          "Keep customer names, emails, and company names tidy so lead-to-quote matching works cleanly.",
          "Use the same contact record instead of duplicating people with small spelling changes.",
          "Move to Quotes once pricing work actually begins.",
        ],
      },
    ],
  },
  {
    id: "quotes-workflow",
    title: "Quotes: Create, Price, and Manage",
    category: "Quotes",
    type: "workflow",
    audience: "sales",
    summary: "Create a quote, work through approvals, manage quote list items, and prepare a job conversion.",
    keywords: ["quotes", "quote detail", "workflow", "quote list", "approval", "convert to job"],
    updatedAt: "2026-05-07",
    openRoute: "/quotes",
    relatedRoutes: ["/quotes", "/quotes/:id"],
    relatedArticles: ["quote-pricing-tab-and-imports", "quote-documents-and-generation", "jobs-and-workflow-handoff"],
    featured: true,
    sections: [
      {
        heading: "Create the quote",
        steps: [
          "Open Quotes and select New Quote.",
          "Choose an existing contact where possible so the quote links to the right customer data.",
          "Enter the quote title and site address, then open the new record.",
        ],
        notes: [
          "Show Me How: Create a new quote demonstrates the current Quotes register, New Quote action, contact selection, and quote record opening.",
        ],
      },
      {
        heading: "Quote detail tabs",
        bullets: [
          "Overview: readiness, decision dates, handoff status, internal notes, and conversion to job.",
          "Workflow: staff assignment and task tracking linked to the quote.",
          "Pricing: quote-level imports, Review Imported Items, and Confirm Import / Update line item actions.",
          "Quote List: the customer-facing and internal line items with controlled Category and Section values.",
          "Files: attachments, generated documents, versions, and document information.",
          "History: audit trail for the quote record.",
        ],
      },
      {
        heading: "Quote list editing",
        paragraphs: [
          "Line items are quote-specific. Editing a line item changes the quote, not the master pricing defaults.",
          "Section is selected from a controlled dropdown. Category is also selected from a controlled dropdown and can influence pricing logic and reporting.",
        ],
        bullets: [
          "Use Add Line Item for manual lines.",
          "Use Edit on a line to change description, category, section, quantity, unit, cost, and markup.",
          "Use Save default only when you intentionally want that item to appear in the master price list for future work.",
        ],
      },
      {
        heading: "Commercial controls",
        bullets: [
          "Quote status, approval status, signoff, and handoff fields are on the Overview tab.",
          "Quotes can be converted into Jobs once commercially ready or won.",
          "Change Orders track approved variations on the quote record.",
        ],
      },
    ],
  },
  {
    id: "quote-pricing-tab-and-imports",
    title: "Quote Pricing Tab and Imports",
    category: "Quotes",
    type: "guide",
    audience: "sales",
    summary: "Import Mozaik CSV/XLSX/PDF and supplier quote documents directly into a quote without changing master pricing by default.",
    keywords: ["quote pricing", "imports", "mozaik", "pdf", "xlsx", "csv", "pricing tab", "review imported items"],
    updatedAt: "2026-05-07",
    openRoute: "/quotes",
    relatedRoutes: ["/quotes/:id", "/pricing"],
    relatedArticles: ["imports-reference", "pricing-price-lists", "files-and-document-information"],
    featured: true,
    sections: [
      {
        heading: "What the Pricing tab is for",
        paragraphs: [
          "The Pricing tab inside a quote is for quote-level imports only. It places rows into Review Imported Items first, lets you edit them, and creates quote line items when you Confirm Import or Update line items.",
          "It does not automatically update master pricing items or supplier price lists unless you deliberately use Save default on selected rows.",
        ],
      },
      {
        heading: "Supported quote-level files",
        bullets: [
          "Mozaik CSV and Excel material/job costing files",
          "Supplier quote PDFs",
          "Supplier invoice PDFs",
          "General pricing PDFs where the total and line items can be extracted",
        ],
      },
      {
        heading: "Review Imported Items behaviour",
        bullets: [
          "Imported rows stay in Review Imported Items first. You can edit, delete, exclude, split, merge duplicates, or save defaults before confirming.",
          "Update line items writes the reviewed data back into the quote line items without removing unrelated quote list lines unless you explicitly choose a replacement path.",
          "If a new Mozaik materials list is imported for the same quote, the previous Mozaik import is replaced and quantities on the related quote list items are refreshed.",
        ],
        notes: [
          "Show Me How: Review Imported Items shows the quote Pricing tab, warning rows, missing costs, and Update line items action.",
        ],
      },
      {
        heading: "Warnings to pay attention to",
        bullets: [
          "GST treatment unknown or ambiguous",
          "Document totals do not reconcile",
          "Missing quantity, price, or description",
          "Duplicate line items",
          "Rows excluded or deleted from the reviewed import set",
        ],
      },
    ],
  },
  {
    id: "quote-documents-and-generation",
    title: "Quote and Contract Document Generation",
    category: "Quotes",
    type: "guide",
    audience: "sales",
    summary: "Generate client-facing quotes and contracts from the confirmed quote list while keeping internal pricing out of the output.",
    keywords: ["quote document", "contract", "pdf", "print", "terms", "preview", "templates"],
    updatedAt: "2026-05-07",
    openRoute: "/quotes",
    relatedRoutes: ["/quotes/:id", "/documents/templates"],
    relatedArticles: ["document-templates", "files-and-document-information", "troubleshooting-scheduling-and-printing"],
    featured: true,
    sections: [
      {
        heading: "How generation works",
        paragraphs: [
          "Document generation starts from a quote record. The generator pulls customer, job, scope, pricing totals, and the confirmed quote list into a quote or contract layout.",
          "The preview, print output, and generated PDF all use the same rendered document structure, so they should match closely.",
        ],
      },
      {
        heading: "Editor panel behaviour",
        bullets: [
          "The left-side editor is collapsible by section.",
          "Sections below Payment Terms are collapsed in the editor by default to reduce clutter, but they still render in preview, print, and PDF.",
          "Terms and Conditions remain editable.",
        ],
      },
      {
        heading: "Pagination rules already built into the renderer",
        bullets: [
          "Long quote line item tables continue across pages with repeated headers.",
          "Continuation labels are added when the line item section carries onto the next page.",
          "Totals render only after the final line item page and stay grouped together.",
          "Terms and conditions also paginate across multiple pages without orphaning headings from their first paragraph where possible.",
        ],
      },
      {
        heading: "Best practice before issuing a document",
        steps: [
          "Confirm the Quote List is correct and grouped into the right Sections.",
          "Check Payment Terms, Disclaimer, and Terms and Conditions.",
          "Preview the document before printing or generating the PDF.",
          "Use Print / Save PDF when you want a quick browser-generated output; use Generate PDF to create and attach the formal file to the quote.",
        ],
      },
    ],
  },
  {
    id: "pricing-overview",
    title: "Pricing Module Overview",
    category: "Pricing",
    type: "overview",
    audience: "estimating",
    summary: "Understand the Millbrook Pricing Model tabs, calculations, and where master defaults live.",
    keywords: ["pricing", "millbrook pricing model", "markup", "labour", "scenarios", "summary"],
    updatedAt: "2026-05-07",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing"],
    relatedArticles: ["pricing-price-lists", "pricing-categories-and-sections", "pricing-auto-inclusions"],
    featured: true,
    sections: [
      {
        heading: "What lives in Pricing",
        bullets: [
          "CSV upload: import Mozaik-style material lists into a pricing draft.",
          "Price lists: supplier price list imports, Review Imported Items, Undo Import, and master price list visibility.",
          "Categories and Sections: controlled lists used across pricing and quotes.",
          "Item review: working set of pricing items before calculation.",
          "Labour: labour assumptions and rates.",
          "Auto-inclusions: Every Job Automatic Additions plus Matched Automatic Additions.",
          "Scenarios, History, and Summary: commercial comparisons and stored snapshots.",
        ],
      },
      {
        heading: "What Pricing changes affect",
        paragraphs: [
          "Pricing is the home for reusable defaults, supplier-linked costs, labour assumptions, inclusion rules, and controlled lookup values such as Categories and Sections.",
          "Quote-level pricing edits inside a quote do not automatically flow back here unless a user explicitly saves an item as a future default.",
        ],
      },
      {
        heading: "Calculation behaviour",
        bullets: [
          "Direct purchase cost, labour hours, GST, markup, and margin are all calculated from the current pricing draft or snapshot.",
          "Warnings surface low margin, low labour allowance, and import issues rather than silently hiding them.",
        ],
      },
    ],
  },
  {
    id: "pricing-price-lists",
    title: "Supplier Price Lists and Master Pricing",
    category: "Pricing",
    type: "guide",
    audience: "estimating",
    summary: "Use supplier price list imports to update master pricing items safely with review, history, and Undo Import.",
    keywords: ["price list", "supplier", "master pricing", "undo import", "sku", "matching", "buy price"],
    updatedAt: "2026-05-07",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing", "/suppliers"],
    relatedArticles: ["imports-reference", "pricing-overview", "pricing-auto-inclusions"],
    sections: [
      {
        heading: "Purpose",
        paragraphs: [
          "Price List imports are for master pricing data. They update supplier-linked pricing items used in future quotes and pricing drafts.",
          "They are not the same as quote-level imports inside Quotes → Pricing.",
        ],
      },
      {
        heading: "Workflow",
        steps: [
          "Upload the supplier CSV, XLSX, or PDF price list.",
          "Map columns or allow the saved supplier profile to map them.",
          "Review matches, new items, duplicates, and price changes in Review Imported Items.",
          "Use Confirm Import only after the review looks right.",
          "Use Undo Import if a confirmed import needs to be reversed.",
        ],
      },
      {
        heading: "Matching rules in practice",
        bullets: [
          "Supplier + SKU / product number is the preferred match.",
          "Supplier item code and barcode are also supported.",
          "Exact description matches are used cautiously within the same supplier.",
          "Description-only matching should be treated as review-required, not trusted by default.",
        ],
      },
      {
        heading: "What you will see after saving defaults from a quote",
        paragraphs: [
          "If a user saves a quote pricing row as a future default, that item appears in the master price list view in Pricing. That lets estimators reuse quote-learned defaults without hunting through old quotes.",
        ],
      },
    ],
  },
  {
    id: "pricing-categories-and-sections",
    title: "Categories and Sections",
    category: "Pricing",
    type: "reference",
    audience: "estimating",
    summary: "Manage the controlled dropdown values used throughout pricing and quote line items.",
    keywords: ["categories", "sections", "merge", "deactivate", "delete", "quote list"],
    updatedAt: "2026-05-07",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing", "/quotes/:id"],
    relatedArticles: ["terminology-and-data-model", "quotes-workflow"],
    sections: [
      {
        heading: "Categories",
        paragraphs: [
          "Categories classify what an item is for pricing logic, auto-inclusion rules, and reporting. Examples include labour, hardware, subcontract, hinges, and packaging/freight.",
        ],
        bullets: [
          "Categories can be created from Quote line item editing and from Pricing.",
          "Pricing → Categories supports edit, deactivate, safe merge, and safe delete of unused categories.",
          "Used categories cannot be hard-deleted; they must be merged or deactivated.",
        ],
      },
      {
        heading: "Sections",
        paragraphs: [
          "Sections control grouping and ordering in the Quote List and generated documents. Examples include Materials, Doors, Hardware, Labour, Freight, and Installation.",
        ],
        bullets: [
          "Quote line items now use a controlled Section dropdown rather than free text.",
          "Pricing → Sections supports display order, deactivate, safe merge, and safe delete of unused sections.",
          "Historical quote lines keep their section names even if the section is later inactive or merged.",
        ],
      },
      {
        heading: "Practical rule",
        bullets: [
          "If you are thinking about sell presentation, choose the right Section.",
          "If you are thinking about pricing logic or reusable behaviour, choose the right Category.",
        ],
      },
    ],
  },
  {
    id: "pricing-auto-inclusions",
    title: "Every Job and Matched Automatic Additions",
    category: "Pricing",
    type: "guide",
    audience: "estimating",
    summary: "Use reusable Automatic Addition rules to add standard costs or matched fixings without hiding them from review.",
    keywords: ["automatic additions", "matched additions", "every job", "freight", "fixing screws", "rules"],
    updatedAt: "2026-05-07",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing", "/quotes/:id"],
    relatedArticles: ["pricing-overview", "quote-pricing-tab-and-imports"],
    featured: true,
    sections: [
      {
        heading: "Every Job Automatic Additions",
        paragraphs: [
          "Every Job Automatic Additions add standard quote-level lines such as freight, packaging, delivery allowance, or workshop consumables to new quotes when the rule is active.",
        ],
        bullets: [
          "They are added once per quote.",
          "They appear on the quote list with Auto-added / Needs review state until confirmed.",
          "Editing the quote line changes that quote only; editing the rule changes future quotes only.",
        ],
      },
      {
        heading: "Matched Automatic Additions",
        paragraphs: [
          "Matched Automatic Additions watch imported quote rows and add related items directly under the parent line. A common example is screws added per runner, drawer, or hinge.",
        ],
        bullets: [
          "Matches can use category, description keywords, SKU, supplier, or item type.",
          "The inclusion row stays grouped under its parent line item even when sorted.",
          "If the parent quantity changes, the child inclusion quantity recalculates.",
          "If the parent row is excluded or deleted, the linked inclusion follows unless manually overridden.",
        ],
      },
      {
        heading: "Rule writing tip",
        paragraphs: [
          "Keep the match rule narrow enough that it only fires where you genuinely want the addition. Supplier + SKU or a well-defined description keyword is safer than a broad text fragment.",
        ],
      },
    ],
  },
  {
    id: "imports-reference",
    title: "Imports Reference: CSV, XLSX, PDF, and Mozaik",
    category: "Imports",
    type: "reference",
    audience: "estimating",
    summary: "Reference for how JoinerFlow reviews files, detects headings, applies validation warnings, and separates quote imports from supplier price imports.",
    keywords: ["imports", "csv", "xlsx", "pdf", "mozaik", "warnings", "review imported items", "undo import"],
    updatedAt: "2026-05-07",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing", "/quotes/:id"],
    relatedArticles: ["quote-pricing-tab-and-imports", "pricing-price-lists", "troubleshooting-imports-and-gst"],
    sections: [
      {
        heading: "Two import families",
        bullets: [
          "Quote-level imports: create or update line items for one quote only.",
          "Supplier price list imports: update master pricing items for future work.",
        ],
      },
      {
        heading: "Mozaik handling",
        paragraphs: [
          "Mozaik-style material and job costing files use heading detection. Heading rows are not imported as line items; they become the current heading/section for following rows.",
        ],
        bullets: [
          "Blank rows are ignored.",
          "Summary rows such as Subtotal, Tax, Deposit, Total, and Balance Due are captured as metadata instead of becoming quote lines.",
          "Add-On rows are imported when they carry real description or amount values.",
        ],
      },
      {
        heading: "PDF handling",
        bullets: [
          "Supplier quote and invoice PDFs do not go through column mapping on quote-level imports.",
          "The system extracts totals, GST signals, and line items where possible, then places them into Review Imported Items.",
          "OCR-derived values always require review before Confirm Import.",
        ],
      },
      {
        heading: "Validation warnings",
        bullets: [
          "GST treatment unclear",
          "Missing required column or field",
          "Subtotal, GST, and total do not reconcile",
          "Low OCR confidence",
          "Duplicate rows or duplicate SKU values",
          "No matching master/default pricing found",
        ],
      },
    ],
  },
  {
    id: "install-planner-overview",
    title: "Install Planner Overview",
    category: "Install Planner",
    type: "overview",
    audience: "operations",
    summary: "Use the Motion-style planner to schedule installs, measures, deliveries, and prep work with manual control where needed.",
    keywords: ["install planner", "schedule", "drag and drop", "auto schedule", "locks", "planner"],
    updatedAt: "2026-05-07",
    openRoute: "/schedule",
    relatedRoutes: ["/schedule"],
    relatedArticles: ["install-planner-crews-and-estimates", "jobs-and-workflow-handoff", "troubleshooting-scheduling-and-printing"],
    featured: true,
    sections: [
      {
        heading: "What the planner does",
        paragraphs: [
          "The Install Planner schedules install tasks such as install, measure, delivery, service, and admin/prep. It supports automatic scheduling, manual drag-and-drop, resizing, locking, and lane-based planning.",
        ],
        bullets: [
          "Planner views include month, work, week, and two-week ranges.",
          "Lane modes include unified, staff, and crew planning.",
          "Tasks can be scheduled, locked, resized, split, duplicated, or reassigned.",
        ],
      },
      {
        heading: "What the auto-scheduler respects",
        bullets: [
          "Priority, deadlines, dependencies, and duration",
          "Working hours and available capacity",
          "Crew assignment and locked positions",
          "No double-booking of staff or crews",
        ],
      },
      {
        heading: "Typical day-to-day workflow",
        steps: [
          "Filter the planner to scheduled, needs planning, or multi-day tasks.",
          "Open a task to confirm job, duration, priority, and lane assignment.",
          "Drag tasks between days or lanes when operations need a manual adjustment.",
          "Lock tasks that must not move, then let the scheduler rebalance the rest.",
        ],
        notes: [
          "Show Me How: Use install planner demonstrates the current planner lanes, drag movement, conflict explanation, and lock control.",
        ],
      },
    ],
  },
  {
    id: "install-planner-crews-and-estimates",
    title: "Crews, Capacity, and Install Duration Estimates",
    category: "Install Planner",
    type: "guide",
    audience: "operations",
    summary: "Configure crews and estimator settings so installs begin with realistic durations and available capacity.",
    keywords: ["crew", "capacity", "estimator", "duration", "install days", "skills"],
    updatedAt: "2026-05-07",
    openRoute: "/schedule",
    relatedRoutes: ["/schedule"],
    relatedArticles: ["install-planner-overview", "pricing-overview"],
    sections: [
      {
        heading: "Crew scheduling",
        bullets: [
          "Crews have name, active status, assigned staff members, daily capacity, optional skills, and notes.",
          "A task can be assigned to a crew and also require a minimum crew size or specific skills.",
          "The planner prevents double-booking a crew and also prevents a staff member from being scheduled in two crews at once.",
        ],
      },
      {
        heading: "Duration estimator",
        paragraphs: [
          "Install duration suggestions are based on quote/pricing/import data such as cabinet count, drawer count, doors/fronts, panels, hardware, and complexity.",
        ],
        bullets: [
          "Complexity multipliers are Simple, Standard, Detailed, Premium/Bespoke, and High-risk install.",
          "The estimator stores both the original estimate and any manual override for audit comparison.",
          "Long installs can be split across multiple days while keeping a shared install group.",
        ],
      },
      {
        heading: "When to override the estimate",
        bullets: [
          "Site complexity is materially higher than the imported data suggests.",
          "A crew is smaller than normal for that job type.",
          "A measure or delivery task should be shorter than the automatically suggested full install allowance.",
        ],
      },
    ],
  },
  {
    id: "jobs-and-workflow-handoff",
    title: "Jobs, Workflow, and Handoffs",
    category: "Jobs & Workflow",
    type: "workflow",
    audience: "operations",
    summary: "Understand how quotes convert into jobs and how workflow tasks, approvals, and handoff notes support delivery.",
    keywords: ["jobs", "workflow", "handoff", "approvals", "change orders", "operations"],
    updatedAt: "2026-05-07",
    openRoute: "/jobs",
    relatedRoutes: ["/jobs", "/jobs/:id", "/quotes/:id"],
    relatedArticles: ["quotes-workflow", "install-planner-overview"],
    sections: [
      {
        heading: "Quote to Job handoff",
        paragraphs: [
          "A quote can be converted into a job once the commercial side is ready. The Job record becomes the operations home for delivery and install coordination.",
        ],
        bullets: [
          "Use quote approvals, signoff, and handoff fields before conversion.",
          "Linked jobs remain visible from the quote Overview tab.",
        ],
      },
      {
        heading: "Workflow tasks",
        bullets: [
          "Workflow tasks can be assigned to staff.",
          "Assignment can be changed quickly from the quote workflow tab where supported.",
          "Tasks carry due dates, ownership, and status so the next operational action is visible.",
        ],
      },
      {
        heading: "Change orders and readiness",
        bullets: [
          "Quotes and Jobs both surface approval/readiness panels and change order history.",
          "Use those panels to keep commercial approval and production handoff visible instead of burying those notes in comments.",
        ],
      },
    ],
  },
  {
    id: "document-templates",
    title: "Document Templates",
    category: "Documents",
    type: "guide",
    audience: "admin",
    summary: "Design and manage reusable quote and contract templates without exposing internal pricing fields to clients.",
    keywords: ["document templates", "quote template", "contract template", "merge fields", "layout"],
    updatedAt: "2026-05-07",
    openRoute: "/documents/templates",
    relatedRoutes: ["/documents/templates", "/quotes/:id"],
    relatedArticles: ["quote-documents-and-generation"],
    sections: [
      {
        heading: "What the template editor is for",
        paragraphs: [
          "The template editor is the reusable layout system for client-facing documents. Templates support blocks such as headings, paragraphs, tables, signature sections, terms, logos, and repeating line item sections.",
        ],
        bullets: [
          "Templates are versioned by save/publish flow rather than by editing generated files directly.",
          "Client-safe merge fields are exposed for customer, job, quote totals, company branding, and line items.",
          "Internal buy cost, margin, labour cost, and other internal fields are intentionally not available in normal client templates.",
        ],
      },
      {
        heading: "Template management",
        bullets: [
          "Create, duplicate, archive, and preview templates.",
          "Import of Mozaik/DevExpress-style template sources is supported as a best-effort reference workflow where available.",
          "Use the quote generator to select the template when preparing a document.",
        ],
      },
    ],
  },
  {
    id: "files-and-document-information",
    title: "Files, Versions, and Document Information",
    category: "Files",
    type: "guide",
    audience: "all",
    summary: "Attach supporting files, generated PDFs, and pricing import files to quotes while keeping context in Document Information.",
    keywords: ["files", "attachments", "document information", "versions", "quote files", "generated pdf"],
    updatedAt: "2026-05-07",
    openRoute: "/quotes",
    relatedRoutes: ["/quotes/:id", "/jobs/:id"],
    relatedArticles: ["quote-pricing-tab-and-imports", "quote-documents-and-generation"],
    sections: [
      {
        heading: "Quote Files tab behaviour",
        paragraphs: [
          "The Files tab stores manual uploads, generated quote/contract PDFs, and pricing import source files that are automatically attached to the quote.",
        ],
        bullets: [
          "Document Information is editable per file and should be used for practical notes such as supplier quote details, revision notes, assumptions, or what the document relates to.",
          "Pricing imports automatically create or link a quote file record so the source document remains attached for audit.",
          "Images preview directly. Other file types keep their existing file/PDF card presentation and can be opened or versioned from the card actions.",
        ],
      },
      {
        heading: "Version handling",
        bullets: [
          "Use Versions to inspect or manage version history where it exists.",
          "Generated documents should be left attached rather than replaced outside the app so the quote history remains clear.",
        ],
      },
    ],
  },
  {
    id: "suppliers-and-linked-pricing",
    title: "Suppliers and Supplier-Linked Pricing",
    category: "Suppliers",
    type: "guide",
    audience: "estimating",
    summary: "Suppliers remain available in JoinerFlow primarily to support pricing, imports, and future buy-cost accuracy.",
    keywords: ["suppliers", "supplier linked pricing", "buy cost", "supplier sku"],
    updatedAt: "2026-05-07",
    openRoute: "/suppliers",
    relatedRoutes: ["/suppliers", "/pricing"],
    relatedArticles: ["pricing-price-lists", "imports-reference"],
    sections: [
      {
        heading: "Current role of Suppliers",
        paragraphs: [
          "Supplier records support pricing imports, supplier-linked master pricing items, and historical buy-cost tracking.",
          "The old standalone stock/purchasing workflow is no longer the centre of cost control; Pricing is.",
        ],
      },
      {
        heading: "Good supplier data improves matching",
        bullets: [
          "Use consistent supplier names.",
          "Keep supplier product numbers or SKU values clean.",
          "Prefer matching on supplier + SKU rather than vague descriptions.",
        ],
      },
    ],
  },
  {
    id: "reporting-and-time-tracking",
    title: "Reporting and Time Tracking",
    category: "Reporting",
    type: "overview",
    audience: "management",
    summary: "Understand the reporting and timeclock areas that support management visibility and payroll/export workflows.",
    keywords: ["reports", "time tracking", "time clock", "myob", "manual entry"],
    updatedAt: "2026-05-07",
    openRoute: "/reports",
    relatedRoutes: ["/reports", "/time-tracking", "/manual-entry", "/export-history"],
    relatedArticles: ["admin-and-settings"],
    sections: [
      {
        heading: "Reporting",
        bullets: [
          "The Reporting screen is designed for operational, financial, and management views with saved views and exports.",
          "Use it for trend review and drill-down rather than day-to-day data entry.",
        ],
      },
      {
        heading: "Time Tracking",
        bullets: [
          "Time Tracking supports clock-in, timesheets, and MYOB export where enabled.",
          "Manual Entry is the admin correction screen for backdated or corrected time records.",
          "Export History provides an append-only audit of export batches.",
        ],
      },
    ],
  },
  {
    id: "admin-and-settings",
    title: "Administration and Settings",
    category: "Administration",
    type: "guide",
    audience: "admin",
    summary: "Manage staff, access, modules, categories, sections, crews, estimator defaults, and system-level support screens.",
    keywords: ["admin", "settings", "access", "staff", "modules", "crews", "health"],
    updatedAt: "2026-05-07",
    openRoute: "/access",
    relatedRoutes: ["/access", "/staff", "/admin/audit", "/admin/health", "/schedule", "/pricing"],
    relatedArticles: ["first-day-setup", "pricing-categories-and-sections", "install-planner-crews-and-estimates"],
    sections: [
      {
        heading: "Access & Modules",
        bullets: [
          "Use Access & Modules to control which modules are available in navigation and routing.",
          "Module changes apply immediately across the app.",
        ],
      },
      {
        heading: "Staff and crews",
        bullets: [
          "Staff records control people available for assignment and time clock.",
          "Crew Settings in Install Planner control operational grouping, capacity, and skills.",
        ],
      },
      {
        heading: "Audit and health",
        bullets: [
          "Audit gives entity-level change history.",
          "System provides backups, diagnostics, repair tools, and health checks for live support.",
        ],
      },
    ],
  },
  {
    id: "troubleshooting-imports-and-gst",
    title: "Troubleshooting Imports and GST",
    category: "Troubleshooting",
    type: "troubleshooting",
    audience: "all",
    summary: "Solve the most common import, GST, and review issues without damaging historical quote data.",
    keywords: ["troubleshooting", "gst", "import", "mismatch", "unknown gst", "duplicate"],
    updatedAt: "2026-05-07",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing", "/quotes/:id"],
    relatedArticles: ["imports-reference", "quote-pricing-tab-and-imports"],
    sections: [
      {
        heading: "If GST looks wrong",
        bullets: [
          "Check whether the imported source was ex GST, inc GST, no GST, or still unknown.",
          "On quote line items, GST is shown separately from the line total so you can confirm the treatment before sending the quote.",
          "If a document total does not reconcile, review imported rows before confirming rather than correcting the final quote manually first.",
        ],
      },
      {
        heading: "If an import created odd rows",
        bullets: [
          "Look for heading rows that should have become Sections rather than line items.",
          "Check duplicate rows and merge where appropriate before Update or Confirm Import.",
          "Use delete or exclude inside Review Imported Items rather than deleting master pricing items.",
        ],
      },
      {
        heading: "If master pricing was updated accidentally",
        paragraphs: [
          "Review whether the change came from a supplier price list import or from a user pressing Save default inside a quote. Only those deliberate actions should change future pricing defaults.",
        ],
      },
    ],
  },
  {
    id: "troubleshooting-scheduling-and-printing",
    title: "Troubleshooting Scheduling and Document Output",
    category: "Troubleshooting",
    type: "troubleshooting",
    audience: "all",
    summary: "Resolve install planning conflicts, blocked prints, pagination issues, and document rendering concerns.",
    keywords: ["troubleshooting", "install planner", "print", "pdf", "pagination", "blocked print"],
    updatedAt: "2026-05-07",
    openRoute: "/schedule",
    relatedRoutes: ["/schedule", "/quotes/:id", "/documents/templates"],
    relatedArticles: ["install-planner-overview", "quote-documents-and-generation"],
    sections: [
      {
        heading: "Install planner issues",
        bullets: [
          "If a task will not auto-place, check lane assignment, lock state, crew capacity, required crew size, and deadlines.",
          "If a task appears double-booked, review shared staff membership across crews as well as the lane itself.",
        ],
      },
      {
        heading: "Printing and PDFs",
        bullets: [
          "Use the Print button from document generation rather than browser-printing the edit screen itself.",
          "If a table is long, the renderer is designed to repeat headers and continue rows across pages. Review the preview before sending.",
          "If a PDF looks wrong, regenerate it from the quote after checking the preview. Generated files are attached to the quote for traceability.",
        ],
      },
    ],
  },
  {
    id: "ux-review-and-priorities",
    title: "Application Review: Guidance Gaps and UX Priorities",
    category: "UX Review",
    type: "review",
    audience: "admin",
    summary: "A reviewed list of terminology, workflow, and guidance priorities identified while documenting the current application.",
    keywords: ["ux", "review", "recommendations", "priority", "confusing", "terminology"],
    updatedAt: "2026-05-07",
    openRoute: "/help",
    relatedRoutes: ["/help"],
    relatedArticles: ["terminology-and-data-model", "pricing-categories-and-sections", "quote-pricing-tab-and-imports"],
    sections: [
      {
        heading: "Priority 1: reinforce the separation between quote imports and master pricing imports",
        paragraphs: [
          "This is the most important conceptual split in the app. New users can easily assume all imports update master pricing, which is not true. The help system now calls this out repeatedly and should stay linked from both Pricing and Quote screens.",
        ],
      },
      {
        heading: "Priority 2: keep Category versus Section language consistent",
        bullets: [
          "Category = pricing logic and reporting classification.",
          "Section = quote grouping and document display order.",
          "Where labels are ambiguous, documentation and contextual help now use this wording consistently.",
        ],
      },
      {
        heading: "Priority 3: document quote status, approval, and handoff expectations",
        paragraphs: [
          "The quote record has strong operational controls, but a new user can miss them because they sit alongside pricing and quote list work. The Overview tab guidance should remain part of onboarding.",
        ],
      },
      {
        heading: "Priority 4: keep install planner training practical",
        paragraphs: [
          "The planner is powerful, but it mixes automatic scheduling with manual control. Training should focus on locks, lane modes, crew capacity, and the estimator so staff do not fight the scheduler.",
        ],
      },
      {
        heading: "Low-risk next UX improvements",
        bullets: [
          "Add more inline help hints inside complex import review areas.",
          "Surface the current route’s help article more prominently on mobile.",
          "Consider adding a short explanatory strip above quote Pricing imports showing quote-level versus master-level outcomes.",
        ],
      },
    ],
  },
  {
    id: "beginner-quick-start-guide",
    title: "Beginner Quick Start Guide",
    category: "Getting Started",
    type: "training",
    audience: "all",
    summary: "A first-session guide for staff who want the fewest clicks and the clearest next step.",
    keywords: ["beginner", "quick start", "new user", "paper", "manual", "safe"],
    updatedAt: "2026-05-09",
    openRoute: "/help",
    relatedRoutes: ["/", "/dashboard", "/quotes", "/pricing", "/schedule"],
    relatedArticles: ["getting-started-overview", "quotes-workflow", "safety-and-recovery-guide"],
    featured: true,
    beginner: true,
    sections: [
      {
        heading: "Start with today, not everything",
        paragraphs: [
          "JoinerFlow is easiest when you treat it like a workshop bench: open the job in front of you, check what needs attention, then move to the next practical step.",
        ],
        steps: [
          "Open Operations or Dashboard and look for work needing attention.",
          "Open the quote or install you are working on today.",
          "Follow the green or amber status badges before changing anything else.",
          "Use Help when a term is unfamiliar. You can skip any tour and restart it later.",
        ],
        why: "This keeps the system from feeling like a big software package. You only need the next workshop action.",
      },
      {
        heading: "Safe habits",
        bullets: [
          "Use Archive instead of Delete when the record may be needed later.",
          "Preview imports and documents before confirming them.",
          "Read amber warnings before sending or printing.",
          "If something looks wrong after an import, use Undo Import or restore the previous saved version where available.",
        ],
      },
    ],
  },
  {
    id: "workshop-user-guide",
    title: "Workshop User Guide",
    category: "Jobs & Workflow",
    type: "training",
    audience: "operations",
    summary: "Practical guidance for workshop staff moving jobs through stages without needing office/admin details.",
    keywords: ["workshop", "stages", "handover", "production", "tasks", "install"],
    updatedAt: "2026-05-09",
    openRoute: "/jobs",
    relatedRoutes: ["/jobs", "/schedule", "/time-tracking", "/log-time"],
    relatedArticles: ["jobs-and-workflow-handoff", "install-planner-overview", "site-measure-workflow-guide"],
    beginner: true,
    sections: [
      {
        heading: "Daily workshop routine",
        steps: [
          "Open Jobs to see live work.",
          "Check the status badge and assigned person before starting.",
          "Open the handover pack for drawings, site notes, photos, and generated documents.",
          "Move the job to the next stage only when the physical work is ready.",
        ],
        why: "This keeps production information in one place and reduces verbal handover mistakes.",
      },
      {
        heading: "Millbrook examples",
        bullets: [
          "Kitchen job: check appliance notes, Blum hardware, services, and access notes before machining or install.",
          "Wardrobe job: check sections, mirror/door notes, and whether the site measure photos show floor or wall issues.",
          "Service job: keep the task small, assign it clearly, and leave a short note after the visit.",
        ],
      },
    ],
  },
  {
    id: "office-admin-guide",
    title: "Office and Admin Guide",
    category: "Administration",
    type: "training",
    audience: "admin",
    summary: "Office guidance for setup, access, suppliers, templates, exports, and safe recovery.",
    keywords: ["office", "admin", "setup", "suppliers", "templates", "export", "access"],
    updatedAt: "2026-05-09",
    openRoute: "/access",
    relatedRoutes: ["/access", "/staff", "/suppliers", "/documents/templates", "/myob-export"],
    relatedArticles: ["admin-and-settings", "suppliers-and-linked-pricing", "document-templates", "safety-and-recovery-guide"],
    advanced: true,
    sections: [
      {
        heading: "Admin work should be deliberate",
        bullets: [
          "Keep staff access simple and review permissions before enabling advanced modules.",
          "Update supplier files through the shared import wizard so each upload has a review and success summary.",
          "Use document templates for repeatable client wording instead of editing every quote by hand.",
          "Use export history to check what was sent to MYOB or archive packs.",
        ],
        why: "Admin screens change the rules other staff rely on, so they should stay predictable and recoverable.",
      },
    ],
  },
  {
    id: "quoting-guide",
    title: "Quoting Guide",
    category: "Quotes",
    type: "training",
    audience: "sales",
    summary: "A linear quote path from lead through pricing, review, documents, sending, scheduling, and archive.",
    keywords: ["quote", "pricing", "review", "document", "send", "print", "schedule"],
    updatedAt: "2026-05-09",
    openRoute: "/quotes",
    relatedRoutes: ["/leads", "/quotes", "/pricing", "/schedule"],
    relatedArticles: ["quotes-workflow", "quote-pricing-tab-and-imports", "quote-documents-and-generation"],
    beginner: true,
    sections: [
      {
        heading: "Simple quote path",
        steps: [
          "Create or open the lead.",
          "Create the quote and check client details.",
          "Import Mozaik, supplier, PDF, or labour pricing if available.",
          "Review missing costs, margins, GST, and imported lines.",
          "Generate the quote document and preview it.",
          "Send or print only when the quote is marked safe.",
          "Schedule install or archive when the quote is complete.",
        ],
        why: "A fixed order removes guesswork and helps prevent missed hardware, below-cost quoting, or wrong documents.",
      },
    ],
  },
  {
    id: "import-guide",
    title: "Import Guide",
    category: "Imports",
    type: "training",
    audience: "all",
    summary: "How to import Mozaik CSV files, supplier price lists, PDF quotes, and labour costing with review checkpoints.",
    keywords: ["import", "Mozaik", "CSV", "XLSX", "PDF", "supplier", "Blum", "review imported items"],
    updatedAt: "2026-05-09",
    openRoute: "/pricing",
    relatedRoutes: ["/pricing", "/quotes"],
    relatedArticles: ["imports-reference", "quote-pricing-tab-and-imports", "safety-and-recovery-guide"],
    beginner: true,
    sections: [
      {
        heading: "The shared import path",
        steps: [
          "Upload the file.",
          "Let JoinerFlow detect the import type.",
          "Check Column Matching if headings need help.",
          "Review Imported Items.",
          "Fix amber warnings or leave clear notes.",
          "Confirm Import only when the preview looks right.",
          "Read the success summary and use Undo if the wrong file was applied.",
        ],
        why: "Every import follows the same path so Mozaik, Blum, supplier lists, and PDF quotes do not feel like separate systems.",
      },
      {
        heading: "Plain-language import terms",
        bullets: [
          "Column Matching means JoinerFlow is checking which spreadsheet column means cost, code, description, or quantity.",
          "Review Imported Items means the lines are not final yet.",
          "Confirm Import means apply the reviewed changes.",
          "Missing Cost means the line cannot be safely used for quoting until a cost is supplied or accepted.",
        ],
      },
    ],
  },
  {
    id: "install-planner-guide",
    title: "Install Planner Guide",
    category: "Install Planner",
    type: "training",
    audience: "operations",
    summary: "A practical guide for scheduling installs, crews, locks, conflicts, and changes.",
    keywords: ["install", "planner", "schedule", "crew", "conflict", "lock", "drag"],
    updatedAt: "2026-05-09",
    openRoute: "/schedule",
    relatedRoutes: ["/schedule", "/jobs"],
    relatedArticles: ["install-planner-overview", "install-planner-crews-and-estimates"],
    beginner: true,
    sections: [
      {
        heading: "Simple scheduling routine",
        steps: [
          "Check upcoming installs first.",
          "Drag the job to the planned day or crew.",
          "Read conflict messages before saving.",
          "Lock a task only when the date cannot move.",
          "Leave a short note when access, appliances, or client timing affects install.",
        ],
        why: "A visible routine makes the planner feel like a wall board, while still protecting the team from double-booking.",
      },
    ],
  },
  {
    id: "common-mistakes-guide",
    title: "Common Mistakes Guide",
    category: "Troubleshooting",
    type: "troubleshooting",
    audience: "all",
    summary: "The most common workflow mistakes and the calmest recovery path.",
    keywords: ["mistakes", "recovery", "missing cost", "wrong file", "wrong quote", "archive"],
    updatedAt: "2026-05-09",
    openRoute: "/help",
    relatedRoutes: ["/quotes", "/pricing", "/schedule"],
    relatedArticles: ["safety-and-recovery-guide", "import-guide", "quoting-guide"],
    beginner: true,
    sections: [
      {
        heading: "Common mistakes and fixes",
        bullets: [
          "Wrong file imported: do not keep editing. Use Undo Import or restore the last good state, then import the right file.",
          "Quote not safe to print: check missing costs, amber review badges, GST, and document preview.",
          "Job scheduled on the wrong day: move it, read any conflict message, and lock it only if the slot is fixed.",
          "Old quote still showing: archive it when finished so current work stays easier to see.",
        ],
        why: "Clear recovery steps show what changed and what to do next.",
      },
    ],
  },
  {
    id: "millbrook-working-method",
    title: "How We Use JoinerFlow at Millbrook",
    category: "Getting Started",
    type: "training",
    audience: "all",
    summary: "A workshop-specific way of using JoinerFlow for kitchens, wardrobes, Mozaik imports, documents, and installs.",
    keywords: ["Millbrook", "kitchen", "wardrobe", "Mozaik", "Blum", "workflow", "handover"],
    updatedAt: "2026-05-09",
    openRoute: "/help",
    relatedRoutes: ["/quotes", "/pricing", "/jobs", "/schedule"],
    relatedArticles: ["beginner-quick-start-guide", "quoting-guide", "workshop-user-guide"],
    beginner: true,
    sections: [
      {
        heading: "Our normal job rhythm",
        steps: [
          "Lead comes in and contact details are checked.",
          "Quote is created and Mozaik or supplier pricing is imported.",
          "Imported hardware, Blum guides, labour, and installation lines are reviewed.",
          "Quote document is previewed, sent, or printed.",
          "Won work moves to job, site measure details, production handover, install, and archive.",
        ],
        why: "The system should support the way the workshop already thinks, not force staff to learn software habits first.",
      },
    ],
  },
  {
    id: "site-measure-workflow-guide",
    title: "Site Measure Workflow Guide",
    category: "Jobs & Workflow",
    type: "workflow",
    audience: "operations",
    summary: "Capture site details, photos, sketches, appliance notes, access notes, and checklist items before quoting or install.",
    keywords: ["site measure", "photos", "sketch", "appliance", "access", "checklist", "production handover"],
    updatedAt: "2026-05-09",
    openRoute: "/quotes",
    relatedRoutes: ["/quotes", "/jobs", "/schedule"],
    relatedArticles: ["workshop-user-guide", "install-planner-guide"],
    beginner: true,
    sections: [
      {
        heading: "What to capture",
        bullets: [
          "Site address, measure date, measured by, appliance details, client requests, access notes, and general notes.",
          "Photos of services, floor level, wall condition, ceiling, access, appliances, and any unusual site issue.",
          "Sketches or PDFs that explain dimensions or constraints.",
        ],
        why: "Good site capture prevents expensive surprises during production or install.",
      },
      {
        heading: "Checklist",
        steps: [
          "Confirm appliances.",
          "Check services.",
          "Check floor level.",
          "Check walls and ceiling.",
          "Check access.",
          "Link the measure to quote, install, and production handover pack.",
        ],
      },
    ],
  },
  {
    id: "safety-and-recovery-guide",
    title: "Safety and Recovery Guide",
    category: "Troubleshooting",
    type: "guide",
    audience: "all",
    summary: "How JoinerFlow protects work through preview, archive, undo, restore, review states, and clear confirmations.",
    keywords: ["safe", "recovery", "undo", "restore", "archive", "delete", "review state", "safe to print"],
    updatedAt: "2026-05-09",
    openRoute: "/help",
    relatedRoutes: ["/quotes", "/pricing", "/schedule", "/help"],
    relatedArticles: ["common-mistakes-guide", "import-guide", "quoting-guide"],
    beginner: true,
    sections: [
      {
        heading: "Use the safest action first",
        bullets: [
          "Archive hides finished work without losing it.",
          "Restore brings archived work back when it is needed.",
          "Undo Import reverses a mistaken import where available.",
          "Preview before sending, printing, or confirming imported changes.",
        ],
        why: "These actions protect approved pricing and documents from accidental changes.",
      },
      {
        heading: "Review states",
        bullets: [
          "Needs Review means pause and check before sending.",
          "Missing Cost means the quote may be below cost or incomplete.",
          "Ready to Send means required checks have passed.",
          "Safe to Print means the document preview and pricing checks are acceptable.",
        ],
      },
    ],
  },
];

export const HELP_TRAINING_PACKS = [
  {
    id: "quick-start",
    title: "Beginner Quick Start Guide",
    summary: "Short onboarding pack for a new workshop, office, or estimating user.",
    articleIds: ["beginner-quick-start-guide", "getting-started-overview", "first-day-setup", "terminology-and-data-model", "quotes-workflow"],
  },
  {
    id: "workshop-user-guide",
    title: "Workshop User Guide",
    summary: "Practical guide for workshop staff using jobs, handover packs, time, site measure, and installs.",
    articleIds: ["workshop-user-guide", "site-measure-workflow-guide", "jobs-and-workflow-handoff", "install-planner-guide", "reporting-and-time-tracking"],
  },
  {
    id: "office-admin-guide",
    title: "Office / Admin Guide",
    summary: "Setup, access, suppliers, templates, exports, and recovery guidance for office users.",
    articleIds: ["office-admin-guide", "admin-and-settings", "suppliers-and-linked-pricing", "document-templates", "safety-and-recovery-guide"],
  },
  {
    id: "user-manual",
    title: "User Manual",
    summary: "Full operational handbook covering the currently accessible JoinerFlow modules.",
    articleIds: HELP_ARTICLES.map((article) => article.id),
  },
  {
    id: "quote-workflow",
    title: "Quote Workflow Guide",
    summary: "Step-by-step guide for quoting, pricing imports, documents, and files.",
    articleIds: ["quoting-guide", "quotes-workflow", "quote-pricing-tab-and-imports", "quote-documents-and-generation", "files-and-document-information"],
  },
  {
    id: "import-workflow",
    title: "Import Guide",
    summary: "Shared import process for Mozaik, supplier files, PDF quotes, CSV/XLSX, and labour costing.",
    articleIds: ["import-guide", "imports-reference", "quote-pricing-tab-and-imports", "common-mistakes-guide"],
  },
  {
    id: "install-workflow",
    title: "Install Workflow Guide",
    summary: "Guide for converting to jobs, planning installs, and using crews and estimates.",
    articleIds: ["install-planner-guide", "jobs-and-workflow-handoff", "install-planner-overview", "install-planner-crews-and-estimates"],
  },
  {
    id: "common-mistakes",
    title: "Common Mistakes Guide",
    summary: "Mistakes, warnings, safe recovery, and archive/restore guidance.",
    articleIds: ["common-mistakes-guide", "safety-and-recovery-guide", "import-guide", "quoting-guide"],
  },
  {
    id: "millbrook-method",
    title: "How We Use JoinerFlow at Millbrook",
    summary: "Millbrook-specific rhythm for kitchens, wardrobes, Mozaik imports, handover, install, and archive.",
    articleIds: ["millbrook-working-method", "beginner-quick-start-guide", "quoting-guide", "workshop-user-guide"],
  },
];

export const GUIDED_TOURS = [
  {
    id: "create-first-quote",
    title: "Create your first quote",
    summary: "A short guided walkthrough for the day-one quoting path.",
    startRoute: "/quotes",
    articleId: "quotes-workflow",
    steps: [
      {
        title: "Start from Quotes",
        body: "Open Quotes from the left navigation. This is the entry point for creating, searching, and reopening customer quote records.",
        route: "/quotes",
      },
      {
        title: "Create the quote shell",
        body: "Use New Quote, then choose an existing contact if possible. This keeps customer records linked and avoids duplicate people.",
        route: "/quotes",
      },
      {
        title: "Open the quote record",
        body: "After saving, open the quote row. The quote detail screen is where pricing imports, quote list editing, file handling, approvals, and document generation happen.",
        route: "/quotes",
      },
      {
        title: "Choose your next step",
        body: "From the quote detail record, go to Pricing for Review Imported Items, Quote List for manual lines and grouping, or Files for supporting documents and generated PDFs.",
        route: "/quotes",
      },
    ],
  },
  {
    id: "generate-quote-document",
    title: "Generate a quote or contract",
    summary: "Review, preview, print, and generate a client-facing document from a quote.",
    startRoute: "/quotes",
    articleId: "quote-documents-and-generation",
    steps: [
      {
        title: "Start from the quote record",
        body: "Open the quote you want to issue. Confirm the Quote List first because the document is built from that confirmed content.",
        route: "/quotes",
      },
      {
        title: "Open Generate Quote/Contract",
        body: "Choose Quote or Contract, review customer details, scope, pricing, payment terms, disclaimer, and the editable terms section.",
        route: "/quotes",
      },
      {
        title: "Preview before issuing",
        body: "Preview checks layout, multi-page table continuation, totals, and the final terms. Use Print for a print-ready version or Generate PDF to store the formal output against the quote.",
        route: "/quotes",
      },
    ],
  },
  {
    id: "schedule-first-install",
    title: "Schedule an install",
    summary: "Use the planner’s automatic scheduling and manual control together.",
    startRoute: "/schedule",
    articleId: "install-planner-overview",
    steps: [
      {
        title: "Open Install Planner",
        body: "Use the planner to view backlog and scheduled work. Switch views or filters to narrow the workload you are looking at.",
        route: "/schedule",
      },
      {
        title: "Create or edit the task",
        body: "Set install type, duration, priority, lane assignment, and whether the task should be manually locked.",
        route: "/schedule",
      },
      {
        title: "Drag, resize, or reassign",
        body: "Manual moves and resizes remain available. Lock the task if its slot must stay fixed, then let the planner rebalance the rest.",
        route: "/schedule",
      },
      {
        title: "Use crews and estimates when needed",
        body: "Switch to crew lanes if you schedule by team rather than by individual. Review estimated hours and suggested crew size before finalising a long install.",
        route: "/schedule",
      },
    ],
  },
  {
    id: "assign-workflow-tasks",
    title: "Assign workflow tasks",
    summary: "Give quote and job tasks a clear owner so the next action is obvious.",
    startRoute: "/quotes",
    articleId: "jobs-and-workflow-handoff",
    steps: [
      {
        title: "Open the quote or job",
        body: "Start from the record that needs action. Workflow tasks show who owns each next step.",
        route: "/quotes",
      },
      {
        title: "Use Advanced only when needed",
        body: "Workflow assignment is available behind Advanced on a quote so everyday quoting stays uncluttered.",
        route: "/quotes",
      },
      {
        title: "Click the owner badge",
        body: "Choose the person responsible. Unassigned tasks should be cleared first because they are easy to miss.",
        route: "/quotes",
      },
    ],
  },
  {
    id: "print-quote-list",
    title: "Print quote list",
    summary: "Preview the quote list before printing so the workshop gets the right information.",
    startRoute: "/quotes",
    articleId: "quote-documents-and-generation",
    steps: [
      {
        title: "Open Quote List",
        body: "Check sections, line items, missing costs, and anything marked Needs Review.",
        route: "/quotes",
      },
      {
        title: "Use Print Quote List",
        body: "The print action uses the document template so page breaks and totals are handled consistently.",
        route: "/quotes",
      },
      {
        title: "Preview first",
        body: "Use the preview as the final safety check before the document goes to the workshop or client.",
        route: "/quotes",
      },
    ],
  },
  {
    id: "archive-export-quote",
    title: "Archive or export a quote",
    summary: "Keep old quote information recoverable instead of deleting it.",
    startRoute: "/quotes",
    articleId: "files-and-document-information",
    steps: [
      {
        title: "Confirm the quote is finished",
        body: "Make sure generated documents and supporting files are attached before archiving or handoff.",
        route: "/quotes",
      },
      {
        title: "Use archive where possible",
        body: "Archive keeps history safe and recoverable. Delete should be reserved for obvious mistakes.",
        route: "/quotes",
      },
      {
        title: "Restore if needed",
        body: "Archived records should remain searchable and restorable so completed work is not lost.",
        route: "/quotes",
      },
    ],
  },
];

const DEFAULT_TOUR_WHY = "This step gives the next person clearer information to trust.";

function buildStepWhy(tour, step, index) {
  if (step.why) return step.why;
  const title = String(step?.title || "").toLowerCase();
  const body = String(step?.body || "").toLowerCase();
  const text = `${tour?.id || ""} ${tour?.title || ""} ${title} ${body}`.toLowerCase();

  if (title.includes("start from quotes")) return "Starting in Quotes gives the user one familiar place for new, current, and reopened quote work.";
  if (title.includes("create the quote shell")) return "Linking the quote to the right contact early prevents duplicated customer details and later retyping.";
  if (title.includes("choose your next step")) return "Clear next-step choices stop users wandering through tabs to work out what happens after quote creation.";
  if (title.includes("choose the right import area")) return "Picking quote import or master pricing import first prevents a file from changing the wrong set of prices.";
  if (title.includes("upload and review")) return "The review pause lets the user check headings, sections, and costs before imported rows are applied.";
  if (title.includes("confirm what will change")) return "Confirming the scope of change shows whether one upload will alter future pricing.";
  if (title.includes("start from the quote record")) return "Starting from the quote record ensures the document is generated from the right client and scope.";
  if (title.includes("open generate")) return "Opening the document action from the quote keeps terms, totals, and customer details together.";
  if (title.includes("open install planner")) return "Opening the planner first shows the current workload before a new install is placed.";
  if (title.includes("create or edit the task")) return "Setting duration, priority, and lock status explains what the scheduler is allowed to move.";
  if (title.includes("drag, resize")) return "Manual movement keeps the planner practical for real workshop changes that happen during the day.";
  if (title.includes("use crews")) return "Crew estimates help long installs land with enough people and hours before the date is promised.";
  if (title.includes("open pricing")) return "Opening the correct pricing tab keeps automatic additions away from everyday quote editing until needed.";
  if (title.includes("define the trigger")) return "A careful match rule stops an automatic addition appearing under the wrong parent item.";
  if (title.includes("set the inclusion rule")) return "The quantity, GST, margin, and review setting decide whether the added line is safe enough to trust.";
  if (title.includes("use advanced")) return "Keeping assignment in Advanced protects the simple quote path while leaving task ownership available.";
  if (title.includes("click the owner")) return "Choosing an owner turns a loose task into somebody’s clear next action.";
  if (title.includes("open quote list")) return "The Quote List is the workshop-facing check of sections, lines, and missing costs before printing.";
  if (title.includes("use print quote list")) return "Using the standard print action avoids one-off formatting and gives the workshop consistent paperwork.";
  if (title.includes("confirm the quote is finished")) return "Checking files and generated documents first keeps archived work complete and recoverable.";
  if (title.includes("use archive")) return "Archive is the safer cleanup action because it hides old work without destroying the record.";
  if (title.includes("restore if needed")) return "Knowing restore exists makes archive feel safe for users who worry about losing work.";
  if (title.includes("come back")) return "Returning to the dashboard gives the user an obvious next job without hunting through menus.";
  if (title.includes("check the quote is finished")) return "Checking documents and notes first prevents archiving work that still needs action.";
  if (title.includes("choose archive")) return "Choosing Archive keeps the daily list tidy without removing the quote history.";
  if (title.includes("read the confirmation")) return "The confirmation tells a cautious user what happened and how the action can be recovered.";
  if (title.includes("show archived")) return "Showing archived quotes gives users a clear place to look before assuming old work is lost.";
  if (title.includes("restore it")) return "Restoring from the archived record brings the quote back without recreating client or pricing details.";
  if (title.includes("check the warning clears")) return "The cleared warning is the visible proof that the quote is safer to send or print.";
  if (title.includes("read the warning")) return "Reading the warning first shows whether the issue is cost, sell price, margin, GST, or review state.";
  if (title.includes("adjust deliberately")) return "A deliberate adjustment keeps tight margins visible instead of hidden in a silent edit.";
  if (title.includes("confirm it is acceptable")) return "Confirming the reason helps the team understand that the margin was checked, not missed.";
  if (title.includes("resolve missing items")) return "Resolving missing items before production prevents the workshop starting with incomplete information.";
  if (title.includes("upload to the right")) return "Uploading to the right record means the next person finds the file where they expect it.";
  if (title.includes("use a clear file")) return "Plain file names help workshop users identify drawings, photos, and supplier quotes quickly.";
  if (title.includes("check upload success")) return "The success check confirms the file is attached and ready for the next workflow step.";
  if (title.includes("open preview")) return "Opening preview gives one final visual check before the system creates or prints anything.";
  if (title.includes("preview first")) return "Preview first gives paper-based users a familiar final check before anything leaves the system.";
  if (title.includes("check key details")) return "Key detail checks catch the errors clients notice first: name, scope, totals, GST, and terms.";
  if (title.includes("generate when safe")) return "Generating only after preview keeps the saved document aligned with the reviewed quote.";
  if (title.includes("use the normal path")) return "Following the normal path first keeps new users away from advanced settings until they need them.";
  if (title.includes("open advanced")) return "Advanced sections are there for rare detail checks, not for everyday quoting.";
  if (title.includes("close it again")) return "Closing advanced areas leaves the screen simpler for the next user.";
  if (title.includes("archive finished")) return "Archiving finished work keeps daily lists short while preserving the job history.";
  if (title.includes("delete only")) return "Restricting delete to true mistakes protects records that may be needed for warranty, revision, or client follow-up.";
  if (title.includes("amber means")) return "Amber means the user should pause and check before the item reaches a client or workshop pack.";
  if (title.includes("green means")) return "Green gives confidence that the normal checks have passed and the item can move forward.";
  if (title.includes("choose the document")) return "Choosing the current document prevents printing an old quote, contract, or handover pack.";
  if (title.includes("print when safe")) return "Safe-to-print keeps paper copies tied to checked pricing and current document versions.";
  if (text.includes("start with today")) return "Starting with today’s work keeps new users focused on one real job instead of the whole system.";
  if (text.includes("use help")) return "Knowing help can be restarted lowers the pressure to remember everything the first time.";
  if (text.includes("safety checks") || text.includes("amber") || text.includes("green")) return "Colour states give a quick workshop-style signal: check amber items, move green items forward.";
  if (text.includes("dashboard") || text.includes("attention first")) return "Attention items are where delays and mistakes usually begin, so they belong at the top of the day.";
  if (text.includes("open the record") || text.includes("open the quote") || text.includes("open the job")) return "Opening the record keeps notes, files, pricing, and next actions together instead of scattered across memory or paper.";
  if (text.includes("contact") || text.includes("person")) return "Using the existing customer record avoids duplicate names and keeps phone, email, lead, and quote history connected.";
  if (text.includes("site address") || text.includes("client request")) return "Capturing the useful field notes early prevents repeated phone calls and missed client requests later.";
  if (text.includes("move to quote")) return "Creating the quote from the lead keeps the enquiry history attached to the pricing work.";
  if (text.includes("upload")) return "Uploading into the guided flow lets JoinerFlow check the file before it changes pricing or quote lines.";
  if (text.includes("column matching")) return "Checking columns prevents costs, quantities, descriptions, or sections from landing in the wrong place.";
  if (text.includes("review before") || text.includes("review and resolve")) return "Review is the safe pause point where imported lines can be checked before they become trusted pricing.";
  if (text.includes("choose the supplier")) return "Choosing the supplier first keeps future prices tied to the right source and avoids mixing price lists.";
  if (text.includes("changed items")) return "Changed prices can affect many future quotes, so the user needs to see what moved before confirming.";
  if (text.includes("summary")) return "The success summary gives a plain record of what changed and whether an undo is available.";
  if (title.includes("confirm or cancel")) return "Confirm and cancel being explicit reassures users that a checked PDF will not change the quote by accident.";
  if (text.includes("pdf")) return "PDF text can be misread, so the review step protects the quote from hidden extraction errors.";
  if (text.includes("low-confidence")) return "Low-confidence text is a prompt to use human judgement before the price reaches a client.";
  if (text.includes("cancel")) return "A safe cancel reassures users that checking a file does not mean they have committed to it.";
  if (text.includes("missing cost")) return "Missing costs can hide loss-making work, so they need to be resolved before sending or printing.";
  if (text.includes("reviewed lines")) return "Marking reviewed lines tells the next person the import has been checked and is safe to use.";
  if (text.includes("what happened")) return "A clear warning explanation helps the user fix the cause instead of guessing what the software wants.";
  if (text.includes("risk") || text.includes("why it matters")) return "Understanding the risk helps traditional users decide whether to fix, accept, or ask for help.";
  if (text.includes("next action")) return "A visible next action turns a warning into a practical workshop step.";
  if (title.includes("read the card")) return "Reading the card first shows whether the issue is cost, sell price, margin, or a review warning.";
  if (title.includes("adjust the visible")) return "Using the visible control keeps the pricing change understandable for the next person.";
  if (title.includes("check the quote total")) return "Checking the total confirms the margin change affected the client price as intended.";
  if (text.includes("margin")) return "Margin checks protect the business from underquoting while keeping the adjustment visible.";
  if (text.includes("quote total")) return "Checking the total confirms the change affected the client price the way the user expected.";
  if (text.includes("ready to send")) return "Ready-to-send checks stop unfinished pricing from becoming a client-facing quote.";
  if (text.includes("preview")) return "Preview catches wrong totals, client details, wording, or page breaks before anything is printed or sent.";
  if (text.includes("send") || text.includes("print")) return "Sending or printing from the reviewed action keeps the issued document consistent with the saved quote.";
  if (text.includes("archive")) return "Archiving clears finished work from daily lists while keeping it recoverable.";
  if (text.includes("restore")) return "Restore makes archive feel safe because finished work can come back when a client returns.";
  if (text.includes("category")) return "Category controls pricing logic, so choosing it correctly keeps markups and reports accurate.";
  if (title.includes("check imports for both")) return "Checking both fields on import stops pricing rules and document grouping drifting apart.";
  if (text.includes("section")) return "Section controls quote layout, so it helps the client and workshop read the job clearly.";
  if (title.includes("every job")) return "Every Job Additions cover standard costs that are easy to forget when quoting quickly.";
  if (title.includes("matched additions")) return "Matched additions connect supporting items, such as hardware, to the parent line that caused them.";
  if (title.includes("review first")) return "Reviewing new automatic lines builds trust before the rule becomes routine.";
  if (title.includes("choose common items")) return "Limiting every-job items prevents the quote from filling with extras that do not belong.";
  if (title.includes("set a safe default")) return "Safe defaults reduce typing while keeping unusual jobs easy to review.";
  if (title.includes("check the quote preview")) return "Preview confirms the automatic line appears in the right section and total.";
  if (text.includes("automatic") || text.includes("addition")) return "Automatic additions reduce forgotten hardware, labour, freight, and consumables.";
  if (text.includes("clear match") || text.includes("narrow")) return "Narrow matches stop the system adding the wrong supporting items to a quote.";
  if (text.includes("require review")) return "Review-on-first-use lets the workshop trust a rule gradually instead of blindly accepting it.";
  if (text.includes("gst")) return "GST mistakes are visible to clients and accounts, so they need a check before the document is issued.";
  if (text.includes("lanes")) return "Understanding lanes makes the planner feel like a familiar wall board rather than a technical schedule.";
  if (text.includes("move the card") || text.includes("drag")) return "Drag-and-drop is the fastest way to adjust install timing while keeping the change visible.";
  if (text.includes("conflict")) return "Conflict explanations prevent double-booking and make auto-scheduling decisions understandable.";
  if (title.includes("check handover")) return "Checking handover details before changing stage prevents the next person starting with missing information.";
  if (title.includes("move one stage")) return "Moving one stage at a time keeps the digital status matched to the real workshop progress.";
  if (title.includes("waiting means")) return "Clear waiting status stops people assuming a task is already underway.";
  if (title.includes("blocked")) return "A blocked reason tells the team what needs fixing before work can continue.";
  if (title.includes("done means")) return "Done should mean the next person can act without rechecking the whole job.";
  if (text.includes("handover")) return "A complete handover gives the workshop the drawings, notes, and site details they need without chasing the office.";
  if (text.includes("check required")) return "Checking required information before production prevents expensive stops once work has started.";
  if (text.includes("basics")) return "Basic site details connect the measure to the right quote, person, and install date.";
  if (text.includes("checklist")) return "The checklist catches common measure misses such as appliances, services, floor, walls, ceiling, and access.";
  if (text.includes("photos") || text.includes("sketch")) return "Photos and sketches give the workshop evidence that words alone often miss.";
  if (title.includes("choose the right job")) return "Choosing the job first keeps labour time attached to the right quote history and costing.";
  if (title.includes("add the work type")) return "Work type separates workshop, install, service, admin, and rework time for better future estimates.";
  if (title.includes("look for missing job")) return "Entries without job links cannot reliably improve job costing or reporting.";
  if (title.includes("check long")) return "Long or unusual entries need context before they affect reports or exports.";
  if (title.includes("confirm reviewed entries")) return "Reviewed entries tell office/admin staff the time data is ready to use.";
  if (text.includes("time") || text.includes("labour")) return "Accurate labour time improves future kitchen, wardrobe, and install quotes.";
  if (text.includes("unusual")) return "Notes on unusual time explain the story behind the number before it becomes reporting data.";
  if (title.includes("check latest")) return "Checking the latest badge protects the workshop from working off an old revision.";
  if (title.includes("keep old versions")) return "Keeping previous versions visible preserves the change history without cluttering current work.";
  if (title.includes("name revisions")) return "Plain revision names make paper and digital references match during busy workshop conversations.";
  if (text.includes("file")) return "Putting files on the right record stops drawings, photos, and PDFs being lost in email or paper folders.";
  if (text.includes("version") || text.includes("rev ")) return "Version clarity prevents the workshop using old drawings or superseded quote revisions.";
  if (title.includes("start from reviewed quote")) return "Starting from reviewed pricing keeps the contract based on approved numbers.";
  if (title.includes("review terms")) return "Reviewing terms prevents payment, scope, or exclusion wording being carried forward blindly.";
  if (title.includes("save the generated")) return "Saving the generated file gives the office and workshop a single contract record to refer back to.";
  if (text.includes("contract")) return "Contracts should use reviewed quote information so staff are not retyping important terms by hand.";
  if (text.includes("advanced")) return "Keeping advanced details tucked away reduces overwhelm while preserving expert controls.";
  if (text.includes("pause")) return "Pausing before more edits protects the last known good state when something looks wrong.";
  if (title.includes("use the available")) return "Using the named recovery action is safer than trying to manually repair every changed line.";
  if (title.includes("check the result")) return "Checking the result confirms the recovery worked before the user continues.";
  if (text.includes("undo")) return "Undo shows that a mistaken import or change can be recovered.";
  if (title.includes("read the summary")) return "The import summary is the quickest way to spot whether the wrong file or target was used.";
  if (title.includes("undo if wrong")) return "Undoing immediately is safer than editing around a bad import.";
  if (title.includes("import again")) return "Re-importing carefully gives the user a clean path back from the mistake.";
  if (text.includes("delete")) return "Delete is hard to recover from, so it should be reserved for records that truly should not exist.";
  if (text.includes("grey") || text.includes("blue")) return "Context badges explain whether an item is archived, locked, imported, or auto-added without extra digging.";

  return `${DEFAULT_TOUR_WHY} Step ${index + 1} keeps “${step.title}” tied to the real workshop task.`;
}

GUIDED_TOURS.forEach((tour) => {
  tour.steps = (tour.steps || []).map((step, index) => ({
    ...step,
    body: String(step.body || "")
      .replace(/\bcommitting\b/gi, "confirming")
      .replace(/\bcommit\b/gi, "confirm")
      .replace(/\bcommercial records\b/gi, "quote records")
      .replace(/\bTriggered Inclusions\b/g, "Automatic Additions")
      .replace(/\bstaged imports\b/gi, "reviewed imports"),
    why: buildStepWhy(tour, step, index),
    target: step.target || (index === 0 ? "The main action button or tab named in this step." : "The highlighted status, button, or review area for this step."),
    learnMoreArticleId: step.learnMoreArticleId || tour.articleId,
  }));
});

function makeWorkshopTour({ id, title, summary, startRoute, articleId, target, why: _why, steps }) {
  return {
    id,
    title,
    summary,
    startRoute,
    articleId,
    steps: steps.map((step, index) => ({
      title: step.title,
      body: step.body,
      route: step.route || startRoute,
      target: step.target || target || "The main control named in this step.",
      why: buildStepWhy({ id, title }, step, index),
      learnMoreArticleId: step.learnMoreArticleId || articleId,
      beginner: step.beginner !== false,
      stepNumber: index + 1,
    })),
  };
}

const WORKSHOP_GUIDED_TOUR_DEFINITIONS = [
  {
    id: "first-login-welcome",
    title: "Welcome to JoinerFlow",
    summary: "A focused first look at the system without opening every feature at once.",
    startRoute: "/",
    articleId: "beginner-quick-start-guide",
    target: "Operations, Help, and the most important status cards.",
    why: "This helps new staff start with today's work instead of feeling buried in menus.",
    steps: [
      { title: "Start with today's work", body: "Look at the work needing attention first. You do not need to learn every screen before using JoinerFlow." },
      { title: "Use Help when unsure", body: "The Help Centre, page tips, and guided tours can be restarted at any time." },
      { title: "Trust the safety checks", body: "Amber badges mean pause and review. Green badges mean the item is ready for the next practical step." },
    ],
  },
  {
    id: "dashboard-overview",
    title: "Dashboard Overview",
    summary: "Read the home screen by priority: attention, ready work, upcoming installs, and recent activity.",
    startRoute: "/dashboard",
    articleId: "getting-started-overview",
    target: "Quotes needing attention, upcoming installs, imports needing review, and ready-to-send work.",
    why: "A quick priority scan reduces repeated questions during a busy workshop day.",
    steps: [
      { title: "Check attention first", body: "Start with amber or red items before opening ordinary lists." },
      { title: "Open the record", body: "Click the quote, import, task, or install that needs action." },
      { title: "Come back for the next job", body: "Return to Dashboard when the action is done so the next priority is obvious." },
    ],
  },
  {
    id: "create-first-lead",
    title: "Create First Lead",
    summary: "Capture an enquiry without overtyping.",
    startRoute: "/leads",
    articleId: "leads-and-contacts",
    target: "New Lead, contact lookup, site address, notes, and quote stage.",
    why: "Clean lead details prevent retyping and keep the later quote linked to the right person.",
    steps: [
      { title: "Check for the person first", body: "Search for the contact before creating a new one. This avoids duplicate customers." },
      { title: "Capture only useful details", body: "Add site address, phone/email, brief job type, and any client request worth remembering." },
      { title: "Move to quote when ready", body: "When pricing starts, create the quote from the lead so the history stays together." },
    ],
  },
  {
    id: "import-mozaik-csv",
    title: "Import Mozaik CSV",
    summary: "Bring Mozaik lines into review before they affect a quote or price list.",
    startRoute: "/pricing",
    articleId: "import-guide",
    target: "Upload, Column Matching, Review Imported Items, Confirm Import.",
    why: "Reviewing Mozaik lines first helps prevent missed hardware, wrong sections, or below-cost quoting.",
    steps: [
      { title: "Upload the Mozaik file", body: "Drop the CSV or XLSX file into the import wizard and let JoinerFlow detect what it is." },
      { title: "Check Column Matching", body: "Confirm the spreadsheet columns line up with code, description, quantity, cost, and section." },
      { title: "Review before confirming", body: "Fix amber warnings, then use Confirm Import when the preview matches the job." },
    ],
  },
  {
    id: "import-supplier-price-list",
    title: "Import Supplier Price List",
    summary: "Update reusable supplier pricing through the same review path.",
    startRoute: "/pricing",
    articleId: "import-guide",
    target: "Supplier, price list file, review warnings, and success summary.",
    why: "Supplier imports affect future quotes, so they need a clear preview and recovery path.",
    steps: [
      { title: "Choose the supplier", body: "Select the supplier before uploading so the prices are stored against the right source." },
      { title: "Review changed items", body: "Check new, changed, and missing prices before confirming." },
      { title: "Read the summary", body: "After confirmation, check how many prices were added, updated, or skipped." },
    ],
  },
  {
    id: "import-pdf-quote",
    title: "Import PDF Quote",
    summary: "Extract a supplier or subcontractor quote without hiding the review step.",
    startRoute: "/quotes",
    articleId: "import-guide",
    target: "PDF upload, extracted lines, confidence warnings, and Confirm Import.",
    why: "PDF imports can misread text, so clear review protects the quote before prices are used.",
    steps: [
      { title: "Upload the PDF", body: "Use the quote import area when the PDF belongs to one quote." },
      { title: "Check extracted lines", body: "Review descriptions, quantities, costs, and any low-confidence warnings." },
      { title: "Confirm or cancel safely", body: "Confirm only when the extracted information is right. Cancel leaves the quote unchanged." },
    ],
  },
  {
    id: "review-imported-pricing",
    title: "Review Imported Pricing",
    summary: "Work through imported lines before they become trusted quote pricing.",
    startRoute: "/quotes",
    articleId: "quote-pricing-tab-and-imports",
    target: "Needs Review, Missing Cost, Imported, and Auto-Added badges.",
    why: "A review pass catches wrong costs, duplicated lines, and automatic additions before the client sees the quote.",
    steps: [
      { title: "Start with amber rows", body: "Amber rows need a human check before sending or printing." },
      { title: "Fix missing costs", body: "Add the cost or mark why the line is accepted." },
      { title: "Confirm reviewed lines", body: "When the lines look right, mark the import reviewed so the next person knows it is safe." },
    ],
  },
  {
    id: "understanding-review-warnings",
    title: "Understanding Review Warnings",
    summary: "Read warnings as practical prompts, not software errors.",
    startRoute: "/quotes",
    articleId: "safety-and-recovery-guide",
    target: "Amber warning badges and warning explanation panels.",
    why: "Plain warning explanations help staff fix the cause instead of guessing.",
    steps: [
      { title: "Read what happened", body: "Each warning should say what JoinerFlow noticed in plain language." },
      { title: "Check why it matters", body: "Use the explanation to understand the risk, such as missing cost or unsure GST." },
      { title: "Choose the next action", body: "Fix the line, leave a note, or ask for review before sending." },
    ],
  },
  {
    id: "adjust-margin-cards",
    title: "Adjust Margin from Margin Cards",
    summary: "Use margin cards as a quick quote health check.",
    startRoute: "/quotes",
    articleId: "quote-pricing-tab-and-imports",
    target: "Margin cards, warning colours, and quote total preview.",
    why: "This helps avoid quoting below cost while keeping the adjustment visible.",
    steps: [
      { title: "Read the card first", body: "Check cost, sell, margin, and any warning before editing." },
      { title: "Adjust the visible control", body: "Use the margin or markup control shown on the card instead of changing hidden calculations." },
      { title: "Check the quote total", body: "Confirm the total and warning state changed as expected." },
    ],
  },
  {
    id: "send-quote",
    title: "Send Quote",
    summary: "Send only after the quote is reviewed and the document preview looks right.",
    startRoute: "/quotes",
    articleId: "quoting-guide",
    target: "Ready to Send badge, preview, and send/print actions.",
    why: "This protects client-facing pricing and keeps the office confident about what was issued.",
    steps: [
      { title: "Check Ready to Send", body: "Look for missing costs, review warnings, and document preview issues before sending." },
      { title: "Preview the document", body: "Open the generated quote and check customer details, totals, GST, and terms." },
      { title: "Send or print", body: "Use the main Send or Print action once the quote is safe." },
    ],
  },
  {
    id: "archive-quote",
    title: "Archive Quote",
    summary: "Move finished quotes out of the way without losing history.",
    startRoute: "/quotes",
    articleId: "safety-and-recovery-guide",
    target: "Archive action and confirmation message.",
    why: "Archive keeps current work cleaner because the quote can be restored.",
    steps: [
      { title: "Check the quote is finished", body: "Make sure documents and notes are saved first." },
      { title: "Choose Archive", body: "Archive hides the quote from daily lists but keeps it searchable." },
      { title: "Read the confirmation", body: "The success message should explain how to restore it later." },
    ],
  },
  {
    id: "restore-archived-quote",
    title: "Restore Archived Quote",
    summary: "Bring a quote back when work restarts or the client comes back.",
    startRoute: "/quotes",
    articleId: "safety-and-recovery-guide",
    target: "Archived filter, Restore action, and restored badge.",
    why: "Recoverable archive makes the system safer for staff who worry about losing work.",
    steps: [
      { title: "Show archived quotes", body: "Use the archived filter or search to find the quote." },
      { title: "Open the quote", body: "Check it is the right client and revision." },
      { title: "Restore it", body: "Use Restore so the quote appears in active work again." },
    ],
  },
  {
    id: "categories-vs-sections",
    title: "Categories vs Sections",
    summary: "Learn the most important pricing wording split.",
    startRoute: "/pricing",
    articleId: "terminology-and-data-model",
    target: "Category and Section fields on pricing or quote lines.",
    why: "Correct wording keeps pricing rules and client documents from getting mixed up.",
    steps: [
      { title: "Category is pricing logic", body: "Use Category for what kind of cost the item is, such as hardware, labour, or subcontract." },
      { title: "Section is document grouping", body: "Use Section for where it appears on the quote, such as Materials, Doors, Labour, or Installation." },
      { title: "Check imports for both", body: "Imported lines should have both fields checked before confirming." },
    ],
  },
  {
    id: "auto-inclusions-overview",
    title: "Automatic Additions Overview",
    summary: "Understand automatic hardware or labour lines in plain workshop language.",
    startRoute: "/pricing",
    articleId: "pricing-auto-inclusions",
    target: "Automatic Additions and Every Job Additions.",
    why: "Automatic Additions help prevent missed screws, hinges, freight, or setup labour.",
    steps: [
      { title: "Every Job Additions", body: "These appear on every suitable quote, such as standard setup or freight." },
      { title: "Matched Additions", body: "These appear when another line matches a rule, such as Blum hardware following a cabinet line." },
      { title: "Review first", body: "Keep new automatic lines marked for review until the team trusts the rule." },
    ],
  },
  {
    id: "triggered-auto-inclusions",
    title: "Matched Automatic Additions",
    summary: "Add a rule that creates supporting lines when a parent item is imported.",
    startRoute: "/pricing",
    articleId: "pricing-auto-inclusions",
    target: "Rule match fields and review-required switch.",
    why: "Narrow rules prevent accidental extra costs while still catching repeat hardware.",
    steps: [
      { title: "Pick a clear match", body: "Match on category, code, supplier, or a strong description keyword." },
      { title: "Add the supporting item", body: "Set the quantity, cost, margin, section, and GST handling." },
      { title: "Require review at first", body: "Leave review on until the rule has been checked on real quotes." },
    ],
  },
  {
    id: "every-job-auto-inclusions",
    title: "Every Job Automatic Additions",
    summary: "Set up standard lines that should appear on normal jobs.",
    startRoute: "/pricing",
    articleId: "pricing-auto-inclusions",
    target: "Every Job Additions list.",
    why: "Standard additions reduce forgotten setup, consumables, packaging, or freight.",
    steps: [
      { title: "Choose common items only", body: "Only use this for lines that are genuinely normal on most jobs." },
      { title: "Set a safe default", body: "Use the normal quantity and review setting." },
      { title: "Check the quote preview", body: "Confirm the line appears in the right section and total." },
    ],
  },
  {
    id: "import-review-workflow",
    title: "Import Review Workflow",
    summary: "Use the same Upload to Success Summary path every time.",
    startRoute: "/pricing",
    articleId: "import-guide",
    target: "Upload, Detect, Parse, Review, Resolve, Confirm, Success Summary.",
    why: "A repeated path makes every import feel familiar, no matter where the file came from.",
    steps: [
      { title: "Upload and detect", body: "Let JoinerFlow identify the file type and show a preview." },
      { title: "Review and resolve", body: "Work through warnings in plain language before confirming." },
      { title: "Confirm and check summary", body: "Confirm Import, then read what changed and what can be undone." },
    ],
  },
  {
    id: "missing-cost-warnings",
    title: "Missing Cost Warnings",
    summary: "Understand why a quote line is not safe yet.",
    startRoute: "/quotes",
    articleId: "safety-and-recovery-guide",
    target: "Missing Cost badges and highlighted rows.",
    why: "Missing costs can lead to quoting below cost or giving away work.",
    steps: [
      { title: "Find the highlighted row", body: "Open the quote pricing or review area and look for Missing Cost." },
      { title: "Add or confirm the cost", body: "Enter the known cost, import it again, or leave a clear note if it is intentionally zero." },
      { title: "Check the warning clears", body: "The quote should not be marked safe until the warning is resolved." },
    ],
  },
  {
    id: "gst-handling",
    title: "GST Handling",
    summary: "Check whether imported prices include or exclude GST before sending.",
    startRoute: "/quotes",
    articleId: "quote-pricing-tab-and-imports",
    target: "GST fields, totals, and document preview.",
    why: "GST mistakes are hard to explain after a quote has gone to the client.",
    steps: [
      { title: "Check the import source", body: "Supplier lists and PDFs may use different GST assumptions." },
      { title: "Review the GST field", body: "Make sure costs and sell prices are treated consistently." },
      { title: "Preview totals", body: "Open the quote document preview and check GST wording and totals." },
    ],
  },
  {
    id: "margin-warnings",
    title: "Margin Warnings",
    summary: "Use margin warnings as a practical pricing check.",
    startRoute: "/quotes",
    articleId: "quote-pricing-tab-and-imports",
    target: "Margin warning badges and margin cards.",
    why: "Margin warnings protect the business from work priced too tightly or below cost.",
    steps: [
      { title: "Read the warning", body: "Check whether the line, section, or whole quote is below the expected margin." },
      { title: "Adjust deliberately", body: "Change the sell price, margin, or accepted reason." },
      { title: "Confirm it is acceptable", body: "Only clear the warning when the margin is understood." },
    ],
  },
  {
    id: "install-planner",
    title: "Using the Install Planner",
    summary: "Schedule work visually without making auto-scheduling feel mysterious.",
    startRoute: "/schedule",
    articleId: "install-planner-guide",
    target: "Planner lanes, task cards, conflicts, and lock controls.",
    why: "The planner should feel like a workshop wall board with better conflict checks.",
    steps: [
      { title: "Read the lanes", body: "Lanes show the day, staff member, or crew depending on the selected view." },
      { title: "Move the card", body: "Drag or edit the install to the planned slot." },
      { title: "Resolve conflicts", body: "Read any conflict explanation before saving the change." },
    ],
  },
  {
    id: "workshop-stages",
    title: "Moving Jobs Through Workshop Stages",
    summary: "Keep live work status clear for the whole team.",
    startRoute: "/jobs",
    articleId: "workshop-user-guide",
    target: "Job status, stage controls, and handover pack.",
    why: "Clear stages reduce verbal chasing and missed handovers.",
    steps: [
      { title: "Open the job", body: "Check the current stage and assigned owner." },
      { title: "Check handover details", body: "Review files, notes, site measure, and document pack before changing stage." },
      { title: "Move one stage at a time", body: "Update the stage when the real work is ready for the next person." },
    ],
  },
  {
    id: "workflow-statuses",
    title: "Understanding Workflow Statuses",
    summary: "Read task status as the next physical action.",
    startRoute: "/jobs",
    articleId: "jobs-and-workflow-handoff",
    target: "Waiting, assigned, in progress, blocked, done, and archived statuses.",
    why: "Status wording keeps the team aligned without needing extra meetings.",
    steps: [
      { title: "Waiting means not started", body: "The task exists but is not being worked on yet." },
      { title: "Blocked needs a reason", body: "Add a short note so the team knows what is stopping progress." },
      { title: "Done means ready to hand over", body: "Only mark Done when the next person can trust the task is complete." },
    ],
  },
  {
    id: "production-handover-pack",
    title: "Production Handover Pack",
    summary: "Gather the quote, files, site measure, and documents before workshop work begins.",
    startRoute: "/jobs",
    articleId: "workshop-user-guide",
    target: "Handover pack, files, site measure, quote documents, and notes.",
    why: "A complete handover pack reduces mistakes between office, workshop, and install.",
    steps: [
      { title: "Open the job pack", body: "Start from the job or quote that is moving into production." },
      { title: "Check required information", body: "Look for drawings, site photos, appliance notes, access notes, and approved documents." },
      { title: "Resolve missing items", body: "Add or request missing files before releasing work to the workshop." },
    ],
  },
  {
    id: "site-measure-workflow",
    title: "Site Measure Workflow",
    summary: "Capture the details that prevent expensive measure mistakes.",
    startRoute: "/quotes",
    articleId: "site-measure-workflow-guide",
    target: "Site measure record, checklist, photos, sketches, and linked quote/install.",
    why: "Structured site capture protects production and install from surprises.",
    steps: [
      { title: "Enter the basics", body: "Capture address, measure date, measured by, client requests, appliance details, and access notes." },
      { title: "Complete the checklist", body: "Check appliances, services, floor, walls, ceiling, and access." },
      { title: "Attach evidence", body: "Upload photos, sketches, or PDFs and link them to quote, install, and handover pack." },
    ],
  },
  {
    id: "actual-labour-tracking",
    title: "Actual Labour Tracking",
    summary: "Record real labour time so future quoting improves.",
    startRoute: "/time-tracking",
    articleId: "reporting-and-time-tracking",
    target: "Time clock, job selection, labour notes, and actual hours.",
    why: "Actual labour helps quote future kitchens, wardrobes, and installs more accurately.",
    steps: [
      { title: "Choose the right job", body: "Select the job before starting or entering time." },
      { title: "Add the work type", body: "Record whether time was workshop, install, service, admin, or rework." },
      { title: "Review unusual time", body: "Leave a note when hours are higher or lower than expected." },
    ],
  },
  {
    id: "review-timeclock-entries",
    title: "Reviewing Timeclock Entries",
    summary: "Check time entries before reporting or export.",
    startRoute: "/time-tracking",
    articleId: "reporting-and-time-tracking",
    target: "Time entry list, warnings, job links, and export status.",
    why: "Clean time entries keep job costing and payroll/export work trustworthy.",
    steps: [
      { title: "Look for missing job links", body: "Entries without a job are hard to cost correctly." },
      { title: "Check long or unusual entries", body: "Read notes or ask the staff member before export." },
      { title: "Confirm reviewed entries", body: "Mark entries reviewed once they are ready for reporting or MYOB export." },
    ],
  },
  {
    id: "uploading-files",
    title: "Uploading Files",
    summary: "Attach drawings, photos, PDFs, and sketches where the next person will find them.",
    startRoute: "/quotes",
    articleId: "files-and-document-information",
    target: "Upload area, file type, linked record, and success message.",
    why: "Clear file handling prevents drawings or site photos from living only in email or paper folders.",
    steps: [
      { title: "Upload to the right record", body: "Attach quote files to the quote and job files to the job or handover pack." },
      { title: "Use a clear file name", body: "Keep names practical, such as kitchen-site-photos or Blum-hardware-quote." },
      { title: "Check upload success", body: "Confirm the file appears in the list and shows what it is used for." },
    ],
  },
  {
    id: "file-versions",
    title: "Understanding File Versions",
    summary: "Keep revised drawings and documents clear.",
    startRoute: "/quotes",
    articleId: "files-and-document-information",
    target: "Version labels, latest badge, and previous file history.",
    why: "Version clarity prevents the workshop using an old drawing or quote revision.",
    steps: [
      { title: "Check latest version", body: "Look for the latest or current badge before printing or handing over." },
      { title: "Keep old versions visible", body: "Do not delete old files unless they are true mistakes." },
      { title: "Name revisions plainly", body: "Use revision wording staff can recognise, such as Rev B or client changes 09 May." },
    ],
  },
  {
    id: "preview-documents",
    title: "Previewing Documents",
    summary: "Use preview as the final check before sending, printing, or saving.",
    startRoute: "/quotes",
    articleId: "quote-documents-and-generation",
    target: "Preview, totals, terms, page breaks, and generated file.",
    why: "Preview catches wrong customer details, missing totals, and layout issues before the client or workshop sees them.",
    steps: [
      { title: "Open preview", body: "Preview the quote, contract, or print pack before generating the final version." },
      { title: "Check key details", body: "Review customer, site, scope, totals, GST, terms, and page breaks." },
      { title: "Generate when safe", body: "Save or print only when the preview matches the intended output." },
    ],
  },
  {
    id: "generating-contracts",
    title: "Generating Contracts",
    summary: "Create contract documents from reviewed quote information.",
    startRoute: "/quotes",
    articleId: "quote-documents-and-generation",
    target: "Generate Contract, terms, payment schedule, and preview.",
    why: "Contracts should use approved pricing and wording, not fresh manual typing.",
    steps: [
      { title: "Start from reviewed quote", body: "Check the quote is approved or ready before generating a contract." },
      { title: "Review terms", body: "Check payment schedule, scope, exclusions, and client details." },
      { title: "Save the generated file", body: "Store the generated contract against the quote for later reference." },
    ],
  },
  {
    id: "printing-documents",
    title: "Printing Documents",
    summary: "Print the right document version without extra setup.",
    startRoute: "/quotes",
    articleId: "quote-documents-and-generation",
    target: "Print action, preview, latest file badge, and safe-to-print state.",
    why: "A clear print path helps workshop staff trust the paperwork in front of them.",
    steps: [
      { title: "Choose the document", body: "Open the latest quote, contract, quote list, or handover pack." },
      { title: "Preview first", body: "Check the document before it reaches paper." },
      { title: "Print when safe", body: "Use Print only when the document shows Safe to Print or has been reviewed." },
    ],
  },
  {
    id: "hidden-collapsed-sections",
    title: "Hidden and Collapsed Sections",
    summary: "Understand where advanced details live without cluttering the main workflow.",
    startRoute: "/quotes",
    articleId: "beginner-quick-start-guide",
    target: "Advanced, More Options, and collapsed section controls.",
    why: "Hiding advanced details keeps everyday screens focused while leaving expert controls available.",
    steps: [
      { title: "Use the normal path first", body: "Follow the main workflow before opening Advanced sections." },
      { title: "Open Advanced only when needed", body: "Advanced areas hold diagnostics, detailed mappings, audit history, and rare controls." },
      { title: "Close it again", body: "Collapse advanced sections when finished so the next user sees a simpler screen." },
    ],
  },
  {
    id: "undo-recovery",
    title: "Undo and Recovery Features",
    summary: "Recover when the wrong action was taken.",
    startRoute: "/help",
    articleId: "safety-and-recovery-guide",
    target: "Undo, Restore, Archive, and success messages.",
    why: "Visible recovery options show staff what to do after a mistake.",
    steps: [
      { title: "Pause first", body: "If something looks wrong, stop editing and read the latest success or warning message." },
      { title: "Use the available recovery action", body: "Choose Undo Import, Restore, or Archive recovery where shown." },
      { title: "Check the result", body: "Confirm the record, prices, or files are back in the expected state." },
    ],
  },
  {
    id: "archive-vs-delete",
    title: "Archive vs Delete",
    summary: "Know when to hide work and when to remove a mistake.",
    startRoute: "/quotes",
    articleId: "safety-and-recovery-guide",
    target: "Archive, Restore, Delete, and confirmation messages.",
    why: "Archive protects history and is safer for day-to-day workshop use.",
    steps: [
      { title: "Archive finished work", body: "Use Archive for old quotes, completed records, or inactive pricing that may be needed later." },
      { title: "Delete only true mistakes", body: "Use Delete only when the record should never have existed." },
      { title: "Restore archived work", body: "Archived work can be brought back when a client returns or a revision starts." },
    ],
  },
  {
    id: "import-mistake-recovery",
    title: "Recovering from Import Mistakes",
    summary: "Undo or revert when the wrong file was imported.",
    startRoute: "/pricing",
    articleId: "common-mistakes-guide",
    target: "Import success summary, Undo Import, and import history.",
    why: "Clear recovery makes staff more willing to use imports instead of returning to manual entry.",
    steps: [
      { title: "Read the summary", body: "Check what was added, updated, skipped, or marked for review." },
      { title: "Undo if wrong", body: "Use Undo Import before making more edits if the file or target was wrong." },
      { title: "Import again carefully", body: "Upload the correct file and review warnings before confirming." },
    ],
  },
  {
    id: "review-states",
    title: "Understanding Review States",
    summary: "Read badges consistently across quotes, imports, files, documents, and installs.",
    startRoute: "/help",
    articleId: "safety-and-recovery-guide",
    target: "Needs Review, Ready to Send, Missing Cost, Safe to Print, Warning, Archived, Locked, Imported, Auto-Added.",
    why: "Consistent states let users understand what needs attention at a glance.",
    steps: [
      { title: "Amber means check", body: "Needs Review, Warning, and Missing Cost should be checked before sending or printing." },
      { title: "Green means ready", body: "Ready to Send and Safe to Print mean the normal checks have passed." },
      { title: "Grey or blue means context", body: "Archived, Locked, Imported, and Auto-Added explain where the item came from or how it can move." },
    ],
  },
];

const existingTourIds = new Set(GUIDED_TOURS.map((tour) => tour.id));
GUIDED_TOURS.push(
  ...WORKSHOP_GUIDED_TOUR_DEFINITIONS
    .filter((tour) => !existingTourIds.has(tour.id))
    .map(makeWorkshopTour)
);

export const HELP_ROUTE_CONTEXTS = [
  { path: "/pricing", articleId: "pricing-overview", tourId: "import-review-workflow", label: "Pricing help" },
  { path: "/quotes", articleId: "quotes-workflow", tourId: "create-first-quote", label: "Quotes help" },
  { path: "/leads", articleId: "leads-and-contacts", tourId: "create-first-lead", label: "Leads help" },
  { path: "/contacts", articleId: "leads-and-contacts", label: "Contacts help" },
  { path: "/companies", articleId: "leads-and-contacts", label: "Company help" },
  { path: "/schedule", articleId: "install-planner-overview", tourId: "install-planner", label: "Install planner help" },
  { path: "/jobs", articleId: "jobs-and-workflow-handoff", tourId: "workshop-stages", label: "Jobs help" },
  { path: "/suppliers", articleId: "suppliers-and-linked-pricing", label: "Suppliers help" },
  { path: "/documents/templates", articleId: "document-templates", label: "Document templates help" },
  { path: "/reports", articleId: "reporting-and-time-tracking", label: "Reporting help" },
  { path: "/time-tracking", articleId: "reporting-and-time-tracking", label: "Time tracking help" },
  { path: "/log-time", articleId: "reporting-and-time-tracking", label: "Time clock help" },
  { path: "/LogTime", articleId: "reporting-and-time-tracking", label: "Time clock help" },
  { path: "/myob-export", articleId: "reporting-and-time-tracking", label: "MYOB export help" },
  { path: "/MYOBExport", articleId: "reporting-and-time-tracking", label: "MYOB export help" },
  { path: "/manual-entry", articleId: "reporting-and-time-tracking", label: "Manual entry help" },
  { path: "/ManualEntry", articleId: "reporting-and-time-tracking", label: "Manual entry help" },
  { path: "/export-history", articleId: "reporting-and-time-tracking", label: "Export history help" },
  { path: "/ExportHistoryPage", articleId: "reporting-and-time-tracking", label: "Export history help" },
  { path: "/access", articleId: "admin-and-settings", label: "Administration help" },
  { path: "/staff", articleId: "admin-and-settings", label: "Staff help" },
  { path: "/admin/audit", articleId: "admin-and-settings", label: "Audit help" },
  { path: "/admin/health", articleId: "admin-and-settings", label: "System help" },
  { path: "/dashboard", articleId: "getting-started-overview", label: "Dashboard help" },
  { path: "/", articleId: "getting-started-overview", label: "Operations help", exact: true },
  { path: "/help", articleId: "getting-started-overview", label: "Help centre" },
];

export const COMMON_HELP_TASKS = [
  { label: "Create first quote", articleId: "quoting-guide", tourId: "create-first-quote" },
  { label: "Import Mozaik CSV", articleId: "import-guide", tourId: "import-mozaik-csv" },
  { label: "Review missing costs", articleId: "safety-and-recovery-guide", tourId: "missing-cost-warnings" },
  { label: "Generate quote document", articleId: "quote-documents-and-generation", tourId: "generate-quote-document" },
  { label: "Schedule install", articleId: "install-planner-guide", tourId: "install-planner" },
  { label: "Capture site measure", articleId: "site-measure-workflow-guide", tourId: "site-measure-workflow" },
];

export const COMMON_HELP_MISTAKES = [
  { label: "Wrong file imported", articleId: "common-mistakes-guide", tourId: "import-mistake-recovery" },
  { label: "Quote not safe to print", articleId: "safety-and-recovery-guide", tourId: "review-states" },
  { label: "Missing cost left unresolved", articleId: "safety-and-recovery-guide", tourId: "missing-cost-warnings" },
  { label: "Old drawing used", articleId: "files-and-document-information", tourId: "file-versions" },
  { label: "Install conflict ignored", articleId: "install-planner-guide", tourId: "install-planner" },
];

export const BEGINNER_HELP_NEXT_STEPS = [
  { label: "Start with the Beginner Quick Start", articleId: "beginner-quick-start-guide", tourId: "first-login-welcome" },
  { label: "Learn the quote path", articleId: "quoting-guide", tourId: "create-first-quote" },
  { label: "Learn import review", articleId: "import-guide", tourId: "import-review-workflow" },
  { label: "Learn safe recovery", articleId: "safety-and-recovery-guide", tourId: "undo-recovery" },
];

export const HELP_ARTICLE_MAP = new Map(HELP_ARTICLES.map((article) => [article.id, article]));
export const HELP_TOUR_MAP = new Map(GUIDED_TOURS.map((tour) => [tour.id, tour]));
export const HELP_PACK_MAP = new Map(HELP_TRAINING_PACKS.map((pack) => [pack.id, pack]));

export function getHelpArticle(articleId) {
  return HELP_ARTICLE_MAP.get(articleId) || null;
}

export function getHelpTour(tourId) {
  return HELP_TOUR_MAP.get(tourId) || null;
}

export function getTrainingPack(packId) {
  return HELP_PACK_MAP.get(packId) || null;
}

export function getArticlesForPack(packId) {
  const pack = getTrainingPack(packId);
  if (!pack) return [];
  return pack.articleIds.map((articleId) => getHelpArticle(articleId)).filter(Boolean);
}

export function getHelpContextForPath(pathname = "") {
  const normalizedPath = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  const matches = HELP_ROUTE_CONTEXTS
    .filter((context) => {
      if (context.exact) {
        return normalizedPath === context.path;
      }
      return normalizedPath === context.path || normalizedPath.startsWith(`${context.path}/`);
    })
    .sort((left, right) => right.path.length - left.path.length);
  return matches[0] || null;
}

export function collectArticleSearchText(article) {
  return [
    article.title,
    article.summary,
    article.category,
    ...(article.keywords || []),
    ...(article.sections || []).flatMap((section) => [
      section.heading,
      section.why,
      ...(section.paragraphs || []),
      ...(section.bullets || []),
      ...(section.steps || []),
      ...(section.notes || []),
    ]),
  ]
    .filter(Boolean)
    .join(" \n")
    .toLowerCase();
}

export function scoreHelpArticle(article, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = collectArticleSearchText(article);
  const title = String(article.title || "").toLowerCase();
  const keywords = (article.keywords || []).map((keyword) => String(keyword).toLowerCase());
  let score = 0;

  for (const token of tokens) {
    if (title.includes(token)) score += 8;
    if (keywords.some((keyword) => keyword.includes(token))) score += 5;
    if (haystack.includes(token)) score += 2;
  }

  return score;
}

export function filterHelpArticles({
  query = "",
  category = "all",
  type = "all",
  route = "",
} = {}) {
  const trimmedQuery = String(query || "").trim();
  return HELP_ARTICLES
    .filter((article) => (category === "all" ? true : article.category === category))
    .filter((article) => (type === "all" ? true : article.type === type))
    .filter((article) => {
      if (!route) return true;
      return (article.relatedRoutes || []).some((relatedRoute) => route === relatedRoute || route.startsWith(`${relatedRoute}/`) || relatedRoute.startsWith(route));
    })
    .map((article) => ({
      article,
      score: trimmedQuery ? scoreHelpArticle(article, trimmedQuery) : (article.featured ? 1 : 0),
    }))
    .filter(({ score }) => (trimmedQuery ? score > 0 : true))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.article.title || "").localeCompare(String(right.article.title || ""), undefined, { sensitivity: "base" });
    })
    .map(({ article }) => article);
}
