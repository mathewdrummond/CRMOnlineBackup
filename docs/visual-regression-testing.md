# Visual Regression Testing

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

Millbrook CRM uses a dedicated Playwright visual suite to catch UI regressions that structural tests cannot see: spacing drift, typography changes, clipping, modal layout changes, navigation breakage, and responsive overflow.

## Commands

- `npm run test:visual` compares the current UI against approved screenshot baselines.
- `npm run test:visual:update` regenerates baselines after an intentional UI change.
- `npm run test:visual:headed` runs the visual suite in a headed browser for local inspection.
- `npm run test:e2e` remains the functional browser workflow suite.

## What Is Covered

The visual suite uses `playwright.visual.config.ts` and runs with one worker for deterministic screenshots. It covers:

- Login/auth screen.
- Operations home, Dashboard, Quotes, Jobs, Install Planner, Time Tracking, Access Control, and Help Centre.
- Mobile, tablet, and desktop viewports: `390x844`, `768x1024`, and `1440x900`.
- Mobile navigation open state.
- New Quote and New Job dialogs.
- A test-only component preview route at `/__ui-preview` for shared cards, buttons, badges, tables, forms, tabs, alerts, and dialog overlays.

## Baselines

Approved screenshots live under `tests/visual/__screenshots__/`.

When a visual test fails:

1. Open the generated diff in `test-results/`.
2. Confirm whether the change is intended.
3. If intended, run `npm run test:visual:update`.
4. Review the changed PNG files before committing.
5. Re-run `npm run test:visual` to confirm the updated baselines are stable.

## Determinism

The visual helpers:

- Freeze browser time to a fixed date.
- Force light mode and reduced motion.
- Disable CSS animations/transitions before screenshots.
- Wait for fonts and network idle.
- Seed fixed visual data through the local test API.

The visual suite is intentionally separate from `npm run test:e2e` so functional tests can remain parallel while visual comparisons stay serial and stable.
