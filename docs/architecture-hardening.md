# Architecture Hardening Reference

This reference lists the guardrails that protect the local-first CRM from silent degradation. Use it
when changing modules, persistence, workflow conversion, startup orchestration, or shared UI
primitives.

## Module Dependencies

Module definitions live in `shared/moduleDefinitions.json`. Server enforcement, dependency
resolution, and persisted-state validation live in `server/src/appModules.ts`.

- Required dependencies are enforced centrally by the module registry.
- Entity ownership for module-gated generic entity routes must be declared in the shared registry,
  not in route-local allowlists.
- Core modules must remain enabled.
- Invalid persisted module states should fail validation or be normalized with diagnostics before
  reaching the UI.
- Add or update `server/src/appModules.test.ts` and `client/src/lib/moduleConfig.test.js` when
  changing module definitions, dependency rules, entity ownership, or legacy-state repair.

## Entity Writes And Row Versions

Generic entity mutations use optimistic concurrency.

- Entity definitions documented in `joinerflow-source/base44/entities/` must be registered in the
  local server entity registry. `server/src/entityContracts.test.ts` prevents documented entities
  from silently becoming runtime 404s.
- Updates must include a positive integer `row_version` in the JSON body.
- Deletes must include a positive integer `row_version` query parameter.
- The browser local API client may fetch the current record to fill a missing online version, but it
  must reject offline mutations when the version is unknown.
- Add or update `server/src/api.test.ts` and `client/src/api/localApiClient.test.js` when changing
  entity write semantics.

## Schema Migrations

SQLite migrations are registered and validated in `server/src/db.ts`.

- Startup rejects unknown future migration versions.
- Startup rejects recorded migration names that no longer match the registry.
- Startup rejects incomplete migration history before applying pending migrations.
- Each pending migration and its metadata record must be committed in the same SQLite transaction.
- Add migration failure-state coverage in `server/src/persistence.test.ts` before changing migration
  registry behavior.

## Critical Workflow Contracts

The Lead to Quote to Job to TimeEntry path is treated as a business-critical workflow.

- Quote conversion must preserve lead, customer, contact, quote, and generated job relationships.
- Converted quotes and source leads should move to won states deterministically.
- Generated job operations must remain traceable to workflow templates.
- Completed time entries linked to job operations must update operation actuals.
- Invoice is a registered generic entity and must validate `job_id` against an existing Job before
  persistence so invoice records cannot silently orphan from the job workflow.
- Purchase order line items must validate `po_id` against an existing PurchaseOrder; purchase orders
  with a `job_id` must validate that the Job exists.
- Keep API-level workflow coverage in `server/src/api.test.ts` and browser workflow coverage in
  `tests/e2e/app.spec.ts` when UI workflow screens are changed.

## Component Catalog

Shared UI primitives live in `client/src/components/ui/` and are cataloged in
`client/src/components/ui/component-catalog.js`.

- Every shared primitive file must have catalog metadata.
- Catalog `exports` must match the primitive's actual named exports.
- Default exports may exist for compatibility, but documented public APIs should be named exports.
- Run `npx vitest run client/src/components/ui/component-catalog.test.js` after adding or changing a
  primitive.
- Run `npx vitest run client/src/components/ui/component-catalog.render.test.jsx` when changing
  high-risk overlay or table primitives.
- Dialog-based workflows should include `DialogDescription` or an explicit `aria-describedby`
  decision so accessibility warnings do not get normalized in the test suite.

## Startup Preflight

Local startup is orchestrated through `npm run start:local`.

- Preflight must run before managed processes are stopped.
- Managed service URLs, ports, npm script names, platform-specific npm command selection, and summary
  output should stay centralized in `scripts/local-startup-contract.mjs`.
- Launcher behavior should stay centralized in `scripts/start-local.mjs`;
  `start-joinerflow.sh` should only validate shell prerequisites before delegating to
  `npm run start:local`.
- Use `npm run start:local -- --check` to validate startup preflight and service summary output
  without stopping managed processes or opening long-running service ports.
- Add or update `scripts/local-startup-preflight.test.mjs` when changing dependency, script, Node, or
  runtime-path checks.

## Validation Checklist

Use the narrowest relevant checks during development, then broaden before handing off:

```bash
npx vitest run server/src/appModules.test.ts
npx vitest run server/src/api.test.ts
npx vitest run server/src/persistence.test.ts
npx vitest run client/src/components/ui/component-catalog.test.js
npx vitest run client/src/components/ui/component-catalog.render.test.jsx
npx playwright test tests/e2e/app.spec.ts -g "converts a lead-backed quote"
npm test --workspace=client
npx vitest run server/src
npm run build --workspace=server
npm run build --workspace=client
```

For production-target changes, also run:

```bash
npm run build:release
npm run preflight:prod
```
