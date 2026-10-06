# Project Architecture

## Overview

Turborepo monorepo: Next.js 16 frontend + NestJS 11 backend (in-memory cache, no DB).

```
job-aggregator/
├── apps/
│   ├── web/          # Next.js 16 frontend (port 3000)
│   └── api/          # NestJS backend (port 4000)
├── packages/
│   ├── eslint-config/
│   ├── typescript-config/
│   └── ui/
├── turbo.json
└── package.json
```

## Data Flow

```
Browser → Next.js (3000) → /api/* rewrite → NestJS (4000) → public job-board APIs
                                    ↘ (prod) NEXT_PUBLIC_API_URL → deployed API
```

The NestJS `JobsService` fans out to 4 free public APIs (RemoteOK, Arbeitnow,
Remotive, Jobicy), normalizes each payload into `JobListing`
`{ id, title, company, location, remote, url, source, sourceUrl, publishedAt, tags[] }`,
de-duplicates, filters to frontend/fullstack-relevant roles, sorts newest-first,
and caches for 30 minutes.

## Frontend (`apps/web`)

Single page at `app/page.tsx` (client component):
- Debounced search input → `GET /jobs?q=`
- Source filter chips → `?source=remoteok,arbeitnow,…`
- All / Remote / On-site toggle → `?remote=true|false`
- Job cards: title, company, location, remote badge, tags, posted date,
  Apply button (original listing URL), “via \<source\>” attribution link
- Loading skeletons, empty state, error state with retry
- “Nepal job boards” section: quick-link cards (merojob, Cari Jobs — no public API)
- TanStack Query via `QueryProvider`; endpoints centralized in `config/api-routes.ts`

## Backend (`apps/api`)

```
src/
├── main.ts                    # bootstrap: CORS, ValidationPipe, port 4000
├── app.module.ts              # ConfigModule + JobsModule
├── app.controller.ts          # GET / and GET /health
├── app.service.ts
└── modules/jobs/
    ├── jobs.module.ts
    ├── jobs.controller.ts     # GET /jobs (q, source, remote), GET /jobs/sources
    ├── jobs.service.ts        # fetch + normalize + filter + 30-min cache
    └── job-listing.interface.ts
```

One source failing does not fail the request (`Promise.allSettled`); if every
source is down and there is no cached data, the API returns 503. Concurrent
requests share a single in-flight refresh.
