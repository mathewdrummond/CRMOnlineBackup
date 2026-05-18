# Clean Export Notes

This folder is a source-only export of the Millbrook CRM workspace for creating a fresh Git repository.

Excluded from the export:

- Git history: `.git/`
- Installed dependencies: `node_modules/`
- Build outputs: `dist/`, `client/dist/`, `clock-client/dist/`, `server/dist/`
- Test and coverage artifacts: `coverage/`, `test-results/`, `playwright-report/`, `.vitest/`
- Runtime data: `.joinerflow-runtime/`, SQLite databases, local server data, backups, logs, and uploaded filesystem content
- Local secrets: `.env`, `.env.local`, `.env.production`, `.env.development`
- Local machine clutter: `.DS_Store`, duplicate `package-lock 2.json`, offloaded manual logs

Suggested first commands from this folder:

```bash
npm install
npm run start:local
```

Then initialise the new repository:

```bash
git init
git add .
git commit -m "Initial clean Millbrook CRM source export"
```
