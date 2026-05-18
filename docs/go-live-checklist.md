# JoinerFlow Go-Live Checklist

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

