# BookLite

BookLite is a lightweight hard-cutover rewrite of BookLore focused on a simple multi-user book workflow:

- Upload EPUB/PDF from the web UI
- Organize with personal collections (drag and drop)
- Keep setup low-friction (local auth, OWNER/MEMBER roles only)
- Sync EPUB library + reading progress with Kobo (`/api/kobo/{token}/...`)

## Stack

- Backend: Fastify + TypeScript + Drizzle + SQLite (WAL)
- Frontend: React + Vite + TanStack Query + dnd-kit
- Runtime: Single Docker container

## Current Scope (v1)

Included:
- Local auth (JWT access + refresh rotation)
- OWNER/MEMBER user model
- Upload/import jobs
- Basic metadata fetch (Open Library with Google fallback)
- Library search via SQLite FTS5
- Collections CRUD + drag/drop assignment
- Kobo token settings + Kobo device endpoints + progress sync

Removed from legacy runtime:
- Browser readers
- OPDS/KOReader/Komga/OIDC/remote-auth/email/stats/task manager
- Fine-grained permission matrix and oversized settings surface

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose -f deploy/compose.yml up -d --build
```

Open [http://localhost:6060](http://localhost:6060)

On first run either:
1. Use `/setup` in the UI, or
2. Set bootstrap env vars in `deploy/compose.yml`:

- `BOOTSTRAP_OWNER_EMAIL`
- `BOOTSTRAP_OWNER_USERNAME`
- `BOOTSTRAP_OWNER_PASSWORD`

## Environment

See `.env.example`:

- `PORT` (default `6060`)
- `APP_DATA_DIR` (default `/app/data`)
- `BOOKS_DIR` (default `/books`)
- `JWT_SECRET`
- `BASE_URL`
- `BOOKLITE_FRONTEND_MODE` (`auto`/`vite`/`static`/`off`, default `auto`)
  - `auto` resolves to `vite` when `NODE_ENV` is not `production`
  - `auto` resolves to `static` when `NODE_ENV=production`
- `GOOGLE_BOOKS_API_KEY` (optional)

## Development

```bash
npm install
npm run dev
npm run docker:dev
```

- App (API + UI): `http://localhost:6060`

Optional split dev mode (legacy API + Vite proxy):

```bash
npm run dev:split
```

## Build and Test

```bash
npm run build
npm run typecheck
npm test
```

## Repository Layout

- `apps/api` - Fastify API
- `apps/web` - React app
- `packages/shared` - shared TS contracts
- `deploy` - Docker compose files for local/prod-like runs

## Kobo Notes

- Sync endpoint remains at `/api/kobo/{token}/...`
- Only EPUB books are synced to Kobo
- PDF remains library-only in v1
- Progress sync uses latest timestamp wins
