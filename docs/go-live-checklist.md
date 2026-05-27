# JoinerFlow Go-Live Checklist

## Current Infrastructure Stack

Updated from live production check on 2026-05-27.

- Active NAS/app host: Synology `Data` at `192.168.1.32`; `192.168.1.31` was not the active reachable host during this check.
- Production source: `/volume1/joinerflow-data`; runtime data: `/volume1/joinerflow`.
- Runtime containers: `joinerflow-server`, `joinerflow-client`, `joinerflow-clock-client`, `joinerflow-proxy`, and `joinerflow-postgres`; all were healthy during the check.
- Database mode: `DATABASE_DRIVER=sqlite` with `DATABASE_SHADOW_WRITE=true`; authoritative DB is `/volume1/joinerflow/server/joinerflow.sqlite`; PostgreSQL runs as staged shadow/future primary at `127.0.0.1:15432`.
- AI config: `OLLAMA_BASE_URL=http://192.168.1.40:11434` and `QDRANT_URL=http://192.168.1.40:6333`; from the NAS, the chunker on `192.168.1.40:8088` responded, while Ollama `11434` and Qdrant `6333` timed out during this check.
- User-facing routes: `crm.millbrookfurniture.co.nz`, `joinerflow.local`, `clock.joinerflow.local`, and compatibility `timeclock.millbrookfurniture.co.nz` through Caddy/DSM; Caddy maps `8080->80` and `8443->443`.

Use this as the final Millbrook go-live sign-off.

## Data Preservation

- [ ] Current database backed up.
- [ ] Current filesystem/uploads backed up.
- [ ] Environment file backed up.
- [ ] Restore process tested on a non-live copy.
- [ ] No reset or seed command run against live data.

## Build

- [ ] `npm install` complete.
- [ ] `npm run build:release` complete.
- [ ] `npm run preflight:prod` passes.
- [ ] `npm run smoke --workspace=server` passes on a non-live copy.

## Security

- [ ] HTTPS enabled.
- [ ] `PUBLIC_API_ORIGIN` is correct.
- [ ] Google sign-in origin configured.
- [ ] `AUTH_SESSION_SECRET` is strong.
- [ ] `ENABLE_TEST_AUTH` disabled.
- [ ] `TIMECLOCK_KIOSK_KEY` configured.
- [ ] Backend is not publicly exposed except through reverse proxy.
- [ ] `/filesystem` access works only through protected routes.

## Workshop Workflows

- [ ] Create/open quote.
- [ ] Review pricing.
- [ ] Generate quote document.
- [ ] Print quote list.
- [ ] Upload and preview file.
- [ ] Open Time Clock.
- [ ] Open Handover Pack.
- [ ] Open Workshop Board.
- [ ] Move a job stage.
- [ ] Open Install Planner.

## Admin/Recovery

- [ ] Admin Health page opens.
- [ ] Backup list opens.
- [ ] Manual backup can be created.
- [ ] Daily backup schedule configured.
- [ ] Logs are written.
- [ ] Recovery contacts know where backups are stored.

## Printing

- [ ] Quote document prints.
- [ ] Quote list prints over multiple pages.
- [ ] Production handover pack prints A3.
- [ ] PDF preview opens in Time Clock handover.

## Final Sign-Off

- [ ] Bruce can clock in/out.
- [ ] Bruce can find the job handover pack.
- [ ] Office can create/send a quote.
- [ ] Workshop can see production status.
- [ ] Install/project manager can see upcoming installs.
- [ ] Backup/restore owner assigned.

