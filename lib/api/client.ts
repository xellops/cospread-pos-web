import { API_URL } from "../config";
import { getSession, updateSession } from "../session";
import type { ApiEnvelope } from "../types";

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got a response. */
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** The request did not reach the API (offline, DNS, CORS, timeout). Safe to retry later. */
  get isNetwork() {
    return this.status === 0;
  }

  get isAuth() {
    return this.status === 401;
  }

  /** Server-side failures are worth retrying; 4xx validation errors are not. */
  get isRetryable() {
    return this.isNetwork || this.status >= 500 || this.status === 429;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the Authorization / x-business-id headers (public auth routes). */
  anonymous?: boolean;
  /** Override the session token (used right after sign-in, before the session is stored). */
  token?: string;
  businessId?: string;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = `${API_URL}/${path.replace(/^\//, "")}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const m = (payload as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/**
 * Calls the CoSpread API and unwraps its `{ success, message, data }` envelope.
 * Throws `ApiError` for network failures (status 0) and non-2xx responses.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const session = opts.anonymous ? null : getSession();
  const token = opts.token ?? session?.token;
  const businessId = opts.businessId ?? session?.businessId;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (!opts.anonymous && token) headers.Authorization = `Bearer ${token}`;
  if (!opts.anonymous && businessId) headers["x-business-id"] = businessId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
      credentials: "include",
    });
  } catch {
    throw new ApiError("You appear to be offline", 0);
  } finally {
    clearTimeout(timer);
  }

  // The API silently re-issues tokens that are close to expiry.
  const refreshed = res.headers.get("x-token");
  if (refreshed && session && !opts.token) {
    updateSession({ token: refreshed.replace(/^Bearer\s+/i, "") });
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    // A gateway answering for an unreachable API is still "offline" for our purposes.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new ApiError("The CoSpread service is unreachable", 0);
    }
    if (res.status === 401 && session && !opts.anonymous && !opts.token) {
      updateSession({ needsReauth: true });
    }
    throw new ApiError(messageFrom(payload, res.statusText || "Request failed"), res.status);
  }

  return (payload as ApiEnvelope<T> | null)?.data as T;
}
