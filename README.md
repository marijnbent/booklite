# BookLite

BookLite is a self-hosted digital book library for people who want a clean personal or family bookshelf without the heavier feature surface of larger library servers. You can upload books, organize them, enrich metadata from multiple providers, read in the browser, share books between users, and sync selected books to Kobo.

It is inspired by [BookLore](https://github.com/booklore-app/booklore), but deliberately keeps a tighter scope: no OPDS feeds, no KOReader sync, no comics or audiobooks, and no BookDrop-style ingestion pipeline.

## Features

### Library and reading

- Upload `EPUB`, `KEPUB`, and `PDF` from the web UI
- Built-in browser reader for `EPUB` and `KEPUB`
- Reading status and progress tracking
- Full-text library search powered by SQLite FTS5
- Custom collections plus built-in `Favorites`, `Shared with me`, and `Uncollected`
- Per-book metadata editing, cover changes, downloads, and deletion

### Upload and import flow

- Drag-and-drop multi-file uploads
- Background import jobs with live queue/progress states
- Automatic filename parsing before import
- Optional OpenRouter-assisted filename cleanup for messy filenames
- Automatic metadata preview while reviewing uploads
- Manual edits to title, author, and description are preserved during enrichment
- Assign collections and favorites before import completes

### Metadata pipeline

- Metadata from 7 providers: Open Library, Google Books, Amazon, bol.com, Hardcover, Goodreads, and Douban
- Owners can enable or disable providers per instance
- Results are merged field-by-field instead of trusting a single source
- Covers are ranked separately from text metadata
- Optional OpenRouter resolver can normalize provider results, reject wrong matches, and fill missing series data
- Cover suggestions can be reviewed and changed later from the library detail drawer

### Multi-user and admin

- Simple `OWNER` and `MEMBER` roles
- Share books directly between users
- Owner-only user management, provider settings, upload limits, and diagnostics
- Admin impersonation for member support and debugging
- Activity log for auth, upload, metadata, and Kobo events
- LLM-ready API docs with expiring admin-generated tokens

### Kobo sync

- Built-in Kobo-compatible API endpoint
- Sync all books or only selected collections
- Reading progress sync with latest timestamp wins
- Only `EPUB` and `KEPUB` are synced to Kobo
- New accounts automatically get a `Favorites` collection, which is preselected for Kobo sync

## Stack

- Backend: Fastify + TypeScript + Drizzle + SQLite (WAL)
- Frontend: React + Vite + TanStack Query + dnd-kit
- Runtime: single Docker container

## Quick Start

### Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
```

Open [http://localhost:6060](http://localhost:6060).

### Prebuilt image

```bash
docker run -d \
  --name booklite \
  -p 6060:6060 \
  -e JWT_SECRET=change-me-booklite \
  -e BASE_URL=http://localhost:6060 \
  -v "$(pwd)/app-data:/app/data" \
  -v "$(pwd)/books:/books" \
  ghcr.io/marijnbent/booklite:latest
```

Pending Drizzle migrations are applied automatically when the API starts, including on Docker deploys.

On first run either:

1. Open `/setup` in the UI and create the first owner account.
2. Or set bootstrap env vars before startup:

- `BOOTSTRAP_OWNER_EMAIL`
- `BOOTSTRAP_OWNER_USERNAME`
- `BOOTSTRAP_OWNER_PASSWORD`

## Environment

See [`.env.example`](.env.example) for the common starting point.

Core settings:

- `PORT` default `6060`
- `HOST` default `0.0.0.0`
- `BASE_URL` default `http://localhost:6060`
- `JWT_SECRET`
- `ACCESS_TOKEN_TTL_SECONDS` default `3600`
- `REFRESH_TOKEN_TTL_SECONDS` default `7776000`

Storage and frontend:

- `APP_DATA_DIR` default `/app/data`
- `BOOKS_DIR` default `/books`
- `APP_DATA_BIND` default `./app-data` when using `compose.yml`
- `BOOKS_BIND` default `./books` when using `compose.yml`
- `WEB_DIST_DIR` optional override for built frontend assets
- `BOOKLITE_FRONTEND_MODE` one of `auto`, `vite`, `static`, `off`

Upload and metadata defaults:

- `UPLOAD_LIMIT_MB` default `100`
- `AMAZON_BOOKS_DOMAIN` optional, default `com`
- `AMAZON_BOOKS_COOKIE` optional
- `GOOGLE_BOOKS_LANGUAGE` optional, example `en`
- `GOOGLE_BOOKS_API_KEY` optional
- `HARDCOVER_API_KEY` optional
- `OPENROUTER_API_KEY` optional
- `OPENROUTER_MODEL` optional, default `google/gemini-3.1-flash-lite-preview`

Bootstrap:

- `BOOTSTRAP_OWNER_EMAIL`
- `BOOTSTRAP_OWNER_USERNAME`
- `BOOTSTRAP_OWNER_PASSWORD`

Most metadata provider toggles and AI settings can also be changed later from `Administration`.

## Development

```bash
npm install
npm run db:migrate
npm run dev
```

- App: `http://localhost:6060`
- Run `npm run db:migrate` again after pulling new schema or migration changes.

Docker dev mode:

```bash
npm run docker:dev
```

Optional split dev mode:

```bash
npm run dev:split
```

## Build and Test

```bash
npm run build
npm run typecheck
npm test
```

Database helpers:

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## Repository Layout

- `apps/api` Fastify API
- `apps/web` React app
- `packages/shared` shared TypeScript contracts

## Kobo Notes

- Copy the full `api_endpoint=https://your-booklite-host/api/kobo/...` line from the Kobo page into `Kobo eReader.conf`
- Only `EPUB` and `KEPUB` sync to Kobo
- `PDF` stays library-only
- Progress sync uses latest timestamp wins
- Regenerating the Kobo token invalidates the previous endpoint
