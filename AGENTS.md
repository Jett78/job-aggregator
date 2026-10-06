# Project Instructions

## Tech Stack
- Monorepo: Turborepo (npm workspaces: `apps/*`, `packages/*`)
- Frontend: Next.js 16 (apps/web, port 3000)
- Backend: NestJS 11 (apps/api, port 4000)
- Styling: Tailwind CSS (+ shadcn-style components in `apps/web/components/ui`)
- State/data: TanStack React Query
- No database — the API caches upstream job listings in memory (30 min TTL)

## Project Structure
- `apps/web` — Next.js frontend, single job-board page at `app/page.tsx`
- `apps/api` — NestJS backend, feature modules in `src/modules/<name>/`
- `packages/` — Shared packages (ui, eslint-config, typescript-config)

## Conventions
- Components go in `apps/web/components/`
- Use `@/` path alias for imports
- API endpoints are centralized in `apps/web/config/api-routes.ts`
- Use `apiClient` from `apps/web/lib/api-client.ts` for backend calls
- Local dev: Next.js rewrites `/api/*` → `http://localhost:4000` (see `apps/web/next.config.js`);
  production uses `NEXT_PUBLIC_API_URL`
- Backend controllers return plain JSON; keep DTOs minimal
- Every job `url` / `sourceUrl` must link to the original listing (source ToS attribution)
