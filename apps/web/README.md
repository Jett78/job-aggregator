# Web — Job Aggregator Frontend

Next.js 16 (App Router) single-page job board. See the root README for full
setup.

```bash
npm run dev      # from repo root, or: cd apps/web && npm run dev (port 3000)
```

- Page: `app/page.tsx` — search, source chips, remote toggle, job cards,
  Nepal quick links.
- API endpoints: `config/api-routes.ts`. Local dev proxies `/api/*` to
  `http://localhost:4000` (see `next.config.js`); production uses
  `NEXT_PUBLIC_API_URL`.
- Data fetching: TanStack Query + `apiClient` (`lib/api-client.ts`).
- UI primitives: `components/ui/` (shadcn-style button, card, badge, input).
