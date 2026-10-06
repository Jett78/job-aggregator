// In local dev, Next.js rewrites /api/* to the NestJS backend (see next.config.js).
// In production, NEXT_PUBLIC_API_URL can override this; it defaults to the
// deployed Render API so the Vercel build works without extra configuration.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://job-aggregator-api-cdja.onrender.com'
    : '/api');

export const API_ROUTES = {
  JOBS: `${API_BASE_URL}/jobs`,
  JOB_SOURCES: `${API_BASE_URL}/jobs/sources`,
  HEALTH: `${API_BASE_URL}/health`,
} as const;
