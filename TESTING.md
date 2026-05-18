# Testing

## Install

```bash
npm install
```

## Main Test Commands

Run the repository test suite:

```bash
npm test
```

Run coverage:

```bash
npm run test:coverage
```

Run Playwright end-to-end tests:

```bash
npm run test:e2e
```

Run everything:

```bash
npm run test:all
```

## Useful Targeted Commands

### Server-Only Tests

```bash
npm run test --workspace=server
```

### Client-Only Tests

```bash
npm run test --workspace=client
```

### Fast Verification For Runtime, Module, And API Regressions

```bash
npx vitest run client/src/api/localApiClient.test.js client/src/lib/moduleConfig.test.js server/src/api.test.ts
```

### Server Smoke Test

```bash
npm run smoke
```

## Test Support Servers

For manual browser testing against isolated auth and database settings:

```bash
npm run dev:test:server
npm run dev:test:client
```

That setup uses:

- an isolated test SQLite file
- an isolated test filesystem root
- test-only auth endpoints

## What The Suite Covers

- client business helpers and export builders
- API client runtime lifecycle and local fail-safe behavior
- server auth, authorization, module gating, validation, upload protection, audit behavior, and conflict handling
- selected end-to-end browser workflows through Playwright

## Test Isolation Notes

- Vitest server tests use isolated test data and do not need the normal local stack running.
- Client tests can use fake timers and mocked `fetch` to exercise the API client without a live server.
- Playwright tests are the slowest layer and are best used for browser-level confidence rather than every small change.

## Before Production Changes

At minimum, run:

```bash
npm test
npm run smoke
```

For authentication, runtime, or startup/shutdown work, also run:

```bash
npx vitest run client/src/api/localApiClient.test.js client/src/lib/moduleConfig.test.js server/src/api.test.ts
```
