/**
 * Base URL for CoSpread API calls. Defaults to the same-origin `/api` path,
 * which `next.config.ts` rewrites to `API_PROXY_TARGET` so the browser never
 * hits CORS. Set `NEXT_PUBLIC_API_URL` to call the API directly instead (the
 * API must then list this app's origin in `ALLOWED_ORIGINS`).
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(
  /\/$/,
  "",
);

/** Prefix for file keys (product images). Mirrors the dashboard's VITE_PUBLIC_FILE_BASE_URL. */
export const FILE_BASE_URL = process.env.NEXT_PUBLIC_FILE_BASE_URL || "";

/** Currency used for display. The API stores plain decimal amounts. */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "NGN";

/** How often to pull fresh data and flush the outbox while online. */
export const SYNC_INTERVAL_MS = 60_000;

/** The API caps list endpoints at page 20 and limit 100. */
export const PAGE_LIMIT = 100;
export const MAX_PAGES = 20;
