// In local dev, Next.js rewrites /api/* to the NestJS backend (see next.config.js).
// In production (Vercel), set NEXT_PUBLIC_API_URL to the deployed API URL.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const API_ROUTES = {
  JOBS: `${API_BASE_URL}/jobs`,
  JOB_SOURCES: `${API_BASE_URL}/jobs/sources`,
  HEALTH: `${API_BASE_URL}/health`,
} as const;
