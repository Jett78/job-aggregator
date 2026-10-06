# API — Job Aggregator Backend

NestJS 11 API that aggregates frontend/fullstack job listings from free public
job boards. No database — listings are cached in memory for 30 minutes.

```bash
npm run dev      # from repo root, or: cd apps/api && npm run dev (port 4000)
npm run build    # nest build → dist/
npm start        # node dist/main.js
```

Env (see `.env.example`): `PORT`, `FRONTEND_URL` (comma-separated CORS origins).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | Listings. Params: `q`, `source` (csv), `remote` (`true`/`false`) |
| GET | `/jobs/sources` | Per-source status |
| GET | `/health` | Health check |

Sources: RemoteOK, Arbeitnow, Remotive, Jobicy (all keyless public APIs).
All Apply/attribution links point at the original listings (source ToS).
