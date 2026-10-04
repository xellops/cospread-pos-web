"use client";

import { useSyncExternalStore } from "react";

/**
 * The signed-in POS session. Persisted in localStorage so the app keeps
 * working (offline) across reloads until the user explicitly signs out.
 */
export interface Session {
  token: string;
  /** The "client ID": the business the user signed in to. Sent as x-business-id. */
  businessId: string;
  businessName: string;
  currencyCode?: string;
  user: { firstName: string; lastName: string; email: string };
  accessType: string;
  /** Location the member is pinned to by the business, if any. */
  assignedLocationId: string | null;
  /** Location new orders/invoices are recorded against. */
  activeLocationId: string | null;
  /** Set when the API rejects the token; the user must re-enter their password. */
  needsReauth?: boolean;
}

const KEY = "cospread-pos:session";
const listeners = new Set<() => void>();
let cached: Session | null | undefined;

function read(): Session | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function emit() {
  listeners.forEach((l) => l());
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  return read();
}

export function setSession(next: Session | null) {
  cached = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode); the session lives in memory only.
  }
  emit();
}

export function updateSession(patch: Partial<Session>) {
  const current = getSession();
  if (current) setSession({ ...current, ...patch });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cached = undefined;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** `undefined` while hydrating (server render), then the session or `null`. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, getSession, () => undefined);
}
