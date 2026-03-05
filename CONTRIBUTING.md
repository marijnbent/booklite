# Contributing

## Stack

- Node.js 22
- TypeScript workspaces
- API: Fastify + SQLite
- Web: React + Vite

## Local Setup

```bash
npm ci
npm run dev
```

## Quality Checks

Run these before opening a PR:

```bash
npm run typecheck
npm test
npm run build
```

## Scope Guidelines

- Keep BookLite v1 minimal and Kobo-first.
- Avoid re-introducing removed legacy features (browser readers, OPDS, OIDC, complex permission matrix, large settings surfaces).
- Prefer small, focused changes with clear behavior.

## Pull Requests

- Explain user-visible behavior changes.
- Include API and UI updates together when the contract changes.
- Add or update tests for changed logic.
