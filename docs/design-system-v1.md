# JoinerFlow / Millbrook CRM Design System V1

## Objective

Design System V1 establishes a reusable visual foundation for a premium, warm, architectural workshop operating system. It is intentionally a foundation pass: workflows remain unchanged, while tokens and components can be rolled out gradually.

The visual language should feel like Millbrook:

- premium cabinetry and joinery
- warm timber, limestone, walnut, bronze, clay, and muted sage tones
- calm operational workspace
- strong hierarchy through spacing, typography, and tone
- fewer hard borders and less bright-white generic SaaS styling

## Token Files

Central token source:

- `client/src/lib/designSystemTokens.js`

Global CSS/theme:

- `client/src/index.css`
- `client/tailwind.config.js`

Important CSS variables:

- `--jf-warm-off-white`
- `--jf-limestone`
- `--jf-limestone-soft`
- `--jf-clay`
- `--jf-walnut`
- `--jf-walnut-deep`
- `--jf-bronze`
- `--jf-charcoal-brown`
- `--jf-muted-sage`
- `--jf-muted-amber`
- `--jf-dusty-red`
- `--jf-slate-blue`
- `--jf-shadow-soft`
- `--jf-shadow-raised`
- `--jf-touch-target`
- `--jf-workshop-target`

Tailwind colour namespace:

```jsx
bg-millbrook-limestone
text-millbrook-walnut
bg-millbrook-bronze
text-millbrook-sage
```

## Components

Import new V1 components from:

```jsx
import {
  PageShell,
  SectionHeader,
  MetricStrip,
  StatCard,
  EditorialCard,
  WorkflowRail,
  DataTable,
  ActionButtonGroup,
  ContextPanel,
  HelpBanner,
  TouchButton,
  StatusBadge,
  ReviewStateBadge,
  EmptyState,
} from "@/components/design-system";
```

## Usage Patterns

### PageShell

Use for new or gradually refactored pages. It provides consistent page spacing and header structure.

```jsx
<PageShell
  eyebrow="Workshop"
  title="Production Board"
  subtitle="Track work from approval through install without extra admin."
  actions={<TouchButton>Print Handover Pack</TouchButton>}
>
  <EditorialCard title="Ready for production">...</EditorialCard>
</PageShell>
```

### SectionHeader

Use inside complex pages where sections need clear hierarchy without adding another card.

```jsx
<SectionHeader
  eyebrow="Quote review"
  title="Pricing needs attention"
  subtitle="Check missing costs before printing."
/>
```

### MetricStrip and StatCard

Use for top-level operational metrics. Keep each card short and scannable.

```jsx
<MetricStrip columns={4}>
  <StatCard label="Ready to send" value="4" helper="Quotes checked today" tone="sage" />
  <StatCard label="Needs review" value="2" helper="Missing cost or warning" tone="warning" />
</MetricStrip>
```

### WorkflowRail

Use for guided, linear workshop flows such as quote review, import review, document generation, and install scheduling.

```jsx
<WorkflowRail
  currentStep="pricing"
  steps={[
    { id: "details", label: "Quote Details", complete: true },
    { id: "pricing", label: "Pricing" },
    { id: "documents", label: "Generate Documents" },
  ]}
/>
```

### DataTable

Use for new tables or refactors where the page wants the V1 table density and styling.

```jsx
<DataTable
  columns={[
    { key: "name", header: "Item" },
    { key: "status", header: "Status", render: (row) => <StatusBadge label={row.status} color="amber" /> },
  ]}
  rows={items}
/>
```

### HelpBanner

Use sparingly for practical workshop guidance. It should explain what to do next, not teach software concepts.

```jsx
<HelpBanner tone="tip" title="Why this matters">
  This helps prevent missed hardware before the quote is printed.
</HelpBanner>
```

## Updated Existing Primitives

These existing shared components were tuned to inherit the V1 visual language:

- `Button`
- `Card`
- `Table`
- `StatusBadge`
- `ReviewStateBadge`
- `StatCard`
- `EmptyState`
- `PageHeader`

This gives current screens warmer surfaces and calmer hierarchy without changing workflows.

## Status Colours

Use calm operational colours:

- `slate` / `neutral`: archived, secondary, metadata
- `blue`: imported or informational
- `emerald` / `green`: ready, safe, complete
- `amber`: needs review or warning
- `red`: missing cost, blocked, destructive
- `accent`: auto-added or bronze emphasis
- `locked`: locked/restricted state

Avoid saturated blue, harsh red, and bright green unless a workflow already depends on those names. The component maps legacy names to Millbrook V1 tones.

## Before / After Notes

Before:

- many white cards with similar weight
- bright SaaS colours
- heavy grey borders and small controls
- limited hierarchy between title, helper text, badges, and table metadata

After:

- warm limestone/off-white surfaces
- walnut/bronze primary accents
- softer borders and shadows
- larger default touch targets
- calmer status colours
- table headings and badges that feel more operational and workshop-readable

## Rollout Rules

1. Do not redesign a workflow just to use the design system.
2. Replace local one-off cards with `EditorialCard`, `ContextPanel`, or `MetricStrip` when touching that screen for another reason.
3. Prefer `StatusBadge` and `ReviewStateBadge` for every operational state.
4. Use `TouchButton` for workshop, timeclock, install, and print actions.
5. Keep destructive actions visually calm but unmistakable.
6. Avoid adding borders to create hierarchy; use spacing, tone, and typography first.
7. Preserve data and behaviour. This V1 pass is visual/system groundwork only.

## Accessibility Rules

- Minimum interactive target: `44px`.
- Workshop/touch target: `52px`.
- Body/table text should stay readable at normal desktop zoom.
- Avoid colour-only status communication; pair colour with label or icon.
- Keep dark text on light surfaces and light text on dark/timber surfaces.

