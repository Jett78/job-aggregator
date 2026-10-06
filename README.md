# Job Aggregator

A lean Turborepo monorepo that aggregates **frontend & fullstack developer jobs**
from free public job boards into one searchable UI — plus quick links to Nepal
job boards (which offer no public API).

Modeled on the [`nextjs-turborepo-boilerplate`](https://github.com/Jett78/nextjs-turborepo-boilerplate)
(Turborepo + Next.js + NestJS conventions, `@/` path alias, `config/api-routes.ts`
pattern, Next.js `/api/*` proxy rewrites).

## Tech Stack

| Layer    | Technology                                         |
|----------|----------------------------------------------------|
| Monorepo | Turborepo, npm workspaces (`apps/*`, `packages/*`) |
| Frontend | Next.js 16, React 19, Tailwind CSS, TanStack Query |
| Backend  | NestJS 11, TypeScript (no database — in-memory cache) |

## Job Sources (all free, no API keys)

- [RemoteOK](https://remoteok.com) — `GET https://remoteok.com/api`
- [Arbeitnow](https://www.arbeitnow.com) — `GET https://www.arbeitnow.com/api/job-board-api`
- [Remotive](https://remotive.com) — `GET https://remotive.com/api/remote-jobs`
- [Jobicy](https://jobicy.com) — `GET https://jobicy.com/api/v2/remote-jobs`

Listings are normalized, de-duplicated, filtered to frontend/fullstack-relevant
roles, and cached in memory for 30 minutes. Every Apply link and every
“via \<source\>” attribution points at the **original listing** (RemoteOK and
Jobicy require link-back attribution).

## Project Structure

```
job-aggregator/
├── apps/
│   ├── web/                  # Next.js frontend (port 3000)
│   │   ├── app/page.tsx      # Job board UI (single page)
│   │   ├── config/api-routes.ts
│   │   ├── lib/api-client.ts
│   │   └── types/job.ts
│   └── api/                  # NestJS backend (port 4000)
│       └── src/modules/jobs/ # jobs.controller / jobs.service / jobs.module
├── packages/
│   ├── ui/                   # Shared React components
│   ├── eslint-config/
│   └── typescript-config/
└── turbo.json
```

## Getting Started

### Prerequisites

- Node.js >= 18
- npm 11+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment (optional)

**Backend** — copy `apps/api/.env.example` to `apps/api/.env`:

```bash
PORT=4000
FRONTEND_URL=http://localhost:3000   # comma-separated; unset = allow all
```

**Frontend** — copy `apps/web/.env.example` to `apps/web/.env.local`.
Leave `NEXT_PUBLIC_API_URL` empty for local dev (Next.js rewrites `/api/*`
to `http://localhost:4000`).

### 3. Run in development

```bash
npm run dev        # starts web (:3000) and api (:4000) together
```

Or individually:

```bash
cd apps/api && npm run dev   # http://localhost:4000
cd apps/web && npm run dev   # http://localhost:3000
```

### Useful commands

```bash
npm run build         # build all apps
npm run lint          # lint all apps
npm run check-types   # type-check all apps
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | Normalized job listings. Query params: `q` (keyword), `source` (comma-separated: `remoteok,arbeitnow,remotive,jobicy`), `remote` (`true`/`false`) |
| GET | `/jobs/sources` | Per-source status (listing counts, reachability) |
| GET | `/health` | Health check |

Response shape:

```json
{
  "data": [
    {
      "id": "remoteok-123",
      "title": "Frontend Developer",
      "company": "Acme",
      "location": "Remote",
      "remote": true,
      "url": "https://remoteok.com/remote-jobs/123",
      "source": "remoteok",
      "sourceUrl": "https://remoteok.com",
      "publishedAt": "2026-10-06T10:00:00.000Z",
      "tags": ["react", "typescript"]
    }
  ],
  "total": 42,
  "cachedAt": "2026-10-06T12:00:00.000Z",
  "sources": [{ "source": "remoteok", "count": 18, "ok": true }]
}
```

## Deploy

### `apps/web` → Vercel

Deploy as-is. Set the environment variable in the Vercel project:

```
NEXT_PUBLIC_API_URL=https://your-api-host.com
```

### `apps/api` → a Node host

NestJS is a long-running server, so it can’t run on Vercel. Deploy it on any
Node host (Railway, Render, Fly.io, a VPS, …):

```bash
cd apps/api
npm install
npm run build
PORT=4000 FRONTEND_URL=https://your-web-app.vercel.app node dist/main.js
```

No database or extra services are required — the API keeps a 30-minute
in-memory cache of upstream listings.
