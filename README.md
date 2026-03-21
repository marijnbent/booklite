# BookLite

BookLite is a simple, self-hosted digital book library. It is inspired by [BookLore](https://github.com/booklore-app/booklore) but strips away the complexity — no OPDS feeds, no KOReader sync, no comic/audiobook support, no complex permissions or BookDrop imports. Just the essentials: upload books, organize them, fetch metadata, and sync to your Kobo.

If you need the full feature set, check out [BookLore](https://github.com/booklore-app/booklore).

## Features

- **Upload** EPUB, KEPUB, and PDF files from the web UI
- **Collections** with drag-and-drop organization
- **Metadata** from 7 providers (Open Library, Google Books, Amazon, bol.com, Hardcover, Goodreads, Douban)
- **Kobo sync** — books and reading progress over the built-in Kobo API
- **Multi-user** with simple Owner/Member roles
- **Built-in EPUB and KEPUB reader**
- **Full-text search** powered by SQLite FTS5

## Stack

- Backend: Fastify + TypeScript + Drizzle + SQLite (WAL)
- Frontend: React + Vite + TanStack Query + dnd-kit
- Runtime: Single Docker container

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose -f deploy/compose.yml up -d --build
```

or run the predefinded build with:

```bash
docker run -p 6060:6060 ghcr.io/marijnbent/booklite:latest
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
- `APP_DATA_BIND` (default `./app-data`)
- `BOOKS_BIND` (default `./books`)
- `JWT_SECRET`
- `BASE_URL`
- `ACCESS_TOKEN_TTL_SECONDS` (default `900`, 15 minutes)
- `REFRESH_TOKEN_TTL_SECONDS` (default `7776000`, 90 days)
- `BOOKLITE_FRONTEND_MODE` (`auto`/`vite`/`static`/`off`, default `auto`)
  - `auto` resolves to `vite` when `NODE_ENV` is not `production`
  - `auto` resolves to `static` when `NODE_ENV=production`
- `AMAZON_BOOKS_DOMAIN` (optional, default `com`)
- `AMAZON_BOOKS_COOKIE` (optional)
- `GOOGLE_BOOKS_LANGUAGE` (optional, example `en`)
- `GOOGLE_BOOKS_API_KEY` (optional)
- `HARDCOVER_API_KEY` (optional)

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
- Only EPUB and KEPUB books are synced to Kobo
- PDF remains library-only
- Progress sync uses latest timestamp wins
