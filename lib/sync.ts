"use client";

import type { Table } from "dexie";
import { useSyncExternalStore } from "react";
import { ApiError } from "./api/client";
import * as endpoints from "./api/endpoints";
import { SYNC_INTERVAL_MS } from "./config";
import {
  getDb,
  setMeta,
  type LocalInvoice,
  type LocalLineItem,
  type LocalOrder,
  type OutboxEntry,
  type PosDb,
} from "./db";
import { toCachedProduct } from "./products";
import { getSession } from "./session";
import type { ApiInvoice, ApiOrder, CreateOrderInput } from "./types";

/* ---------- API record -> local record mapping ---------- */

function mapItems(items: { description: string; price: number; quantity: number; productVariantId: string | null }[] = []): LocalLineItem[] {
  return items.map((i) => ({
    description: i.description,
    price: Number(i.price) || 0,
    quantity: i.quantity,
    productVariantId: i.productVariantId,
  }));
}

export function orderFromApi(o: ApiOrder, existing?: LocalOrder): LocalOrder {
  return {
    localId: existing?.localId ?? o.id,
    serverId: o.id,
    syncState: "synced",
    syncError: null,
    pendingOps: existing?.pendingOps ?? 0,
    createdBy: existing?.createdBy ?? null,
    reference: o.reference,
    status: o.status,
    paymentStatus: o.paymentStatus,
    type: o.type,
    recipientFirstName: o.recipientFirstName,
    recipientLastName: o.recipientLastName,
    recipientEmail: o.recipientEmail,
    recipientPhone: o.recipientPhone,
    note: o.note,
    deliveryAddress: o.deliveryAddress,
    deliveryFee: Number(o.deliveryFee) || 0,
    subtotal: Number(o.subtotal) || 0,
    total: Number(o.total) || 0,
    businessLocationId: o.businessLocationId,
    // Status endpoints and some list views omit items; keep what we had.
    items: o.items ? mapItems(o.items) : existing?.items ?? [],
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function invoiceFromApi(i: ApiInvoice, existing?: LocalInvoice): LocalInvoice {
  const items = i.items ? mapItems(i.items) : existing?.items ?? [];
  return {
    localId: existing?.localId ?? i.id,
    serverId: i.id,
    syncState: "synced",
    syncError: null,
    pendingOps: existing?.pendingOps ?? 0,
    createdBy: existing?.createdBy ?? null,
    reference: i.reference,
    status: i.status,
    recipientFirstName: i.recipientFirstName,
    recipientLastName: i.recipientLastName,
    recipientEmail: i.recipientEmail,
    recipientPhone: i.recipientPhone,
    businessLocationId: i.businessLocationId,
    dueDate: i.dueDate,
    paidAt: i.paidAt,
    items,
    total: items.reduce((s, it) => s + it.price * it.quantity, 0),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

/* ---------- Pull: refresh the local cache from the API ---------- */

async function mergeRemote<T extends LocalOrder | LocalInvoice, R extends { id: string; createdAt: string }>(
  table: Table<T, string>,
  remote: R[],
  map: (r: R, existing?: T) => T,
) {
  const existing = await table.toArray();
  const byServerId = new Map(existing.filter((e) => e.serverId).map((e) => [e.serverId!, e]));
  const remoteIds = new Set(remote.map((r) => r.id));

  const puts: T[] = [];
  for (const r of remote) {
    const local = byServerId.get(r.id);
    // Don't clobber optimistic changes that are still waiting in the outbox.
    if (local && local.pendingOps > 0) continue;
    puts.push(map(r, local));
  }

  // Synced records that vanished from the window we pulled were deleted remotely.
  const oldest = remote.reduce<string | null>((min, r) => (!min || r.createdAt < min ? r.createdAt : min), null);
  const stale = existing
    .filter(
      (e) =>
        e.syncState === "synced" &&
        e.pendingOps === 0 &&
        e.serverId &&
        !remoteIds.has(e.serverId) &&
        oldest !== null &&
        e.createdAt >= oldest,
    )
    .map((e) => e.localId);

  await table.db.transaction("rw", table, async () => {
    if (stale.length) await table.bulkDelete(stale);
    if (puts.length) await table.bulkPut(puts);
  });
}

async function pull(db: PosDb, locationFilter: string | undefined) {
  const errors: unknown[] = [];
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(e);
      if (e instanceof ApiError && (e.isNetwork || e.isAuth)) throw e;
    }
  };

  await run(async () => {
    const locations = await endpoints.fetchLocations();
    await db.transaction("rw", db.locations, async () => {
      await db.locations.clear();
      await db.locations.bulkPut(locations);
    });
  });

  await run(async () => {
    const products = await endpoints.fetchProducts();
    await db.transaction("rw", db.products, async () => {
      await db.products.clear();
      await db.products.bulkPut(products.map(toCachedProduct));
    });
    await setMeta(db, "productsSyncedAt", Date.now());
  });

  await run(async () => {
    const customers = await endpoints.fetchCustomers();
    await db.customers.bulkPut(customers);
  });

  await run(async () => {
    const orders = await endpoints.fetchOrders(locationFilter);
    await mergeRemote<LocalOrder, ApiOrder>(db.orders as Table<LocalOrder, string>, orders, orderFromApi);
  });

  await run(async () => {
    const invoices = await endpoints.fetchInvoices(locationFilter);
    await mergeRemote<LocalInvoice, ApiInvoice>(db.invoices as Table<LocalInvoice, string>, invoices, invoiceFromApi);
  });

  if (errors.length) throw errors[0];
}

/* ---------- Push: replay the outbox against the API ---------- */

const MAX_SERVER_ERROR_ATTEMPTS = 5;

function sameOrder(remote: ApiOrder, input: CreateOrderInput, notBefore: number) {
  if (new Date(remote.createdAt).getTime() < notBefore - 60_000) return false;
  const name = input.recipient.custom;
  if (name && (remote.recipientFirstName !== name.firstName || remote.recipientLastName !== name.lastName)) {
    return false;
  }
  const want = input.items
    .map((i) => `${i.productVariantId ?? i.custom?.description}:${i.quantity}`)
    .sort()
    .join("|");
  const got = (remote.items ?? [])
    .map((i) => `${i.productVariantId ?? i.description}:${i.quantity}`)
    .sort()
    .join("|");
  return want === got;
}

async function settle(db: PosDb, entry: OutboxEntry, apply: () => Promise<void>) {
  await apply();
  await db.outbox.delete(entry.seq!);
  const table = entry.type === "createOrder" || entry.type === "orderStatus" ? db.orders : db.invoices;
  const record = await table.get(entry.localId);
  if (record) {
    const pendingOps = Math.max(0, record.pendingOps - 1);
    await table.update(entry.localId, {
      pendingOps,
      syncState: pendingOps > 0 ? "pending" : "synced",
      syncError: null,
    });
  }
}

async function process(db: PosDb, entry: OutboxEntry) {
  switch (entry.type) {
    case "createOrder": {
      // A previous attempt may have reached the API before the connection dropped.
      // There's no idempotency key on POST /v1/orders, so look for the order first.
      let created: ApiOrder | undefined;
      if (entry.attempts > 0) {
        const recent = await endpoints.fetchRecentOrders();
        created = recent.find((o) => sameOrder(o, entry.payload, entry.createdAt));
      }
      created ??= await endpoints.createOrder(entry.payload);
      const full = created.items ? created : await endpoints.fetchOrder(created.id).catch(() => created!);
      await settle(db, entry, async () => {
        const local = await db.orders.get(entry.localId);
        if (local) await db.orders.put({ ...orderFromApi(full, local), pendingOps: local.pendingOps });
      });
      return;
    }
    case "createInvoice": {
      const created = await endpoints.createInvoice(entry.payload);
      const full = created.items ? created : await endpoints.fetchInvoice(created.id).catch(() => created);
      await settle(db, entry, async () => {
        const local = await db.invoices.get(entry.localId);
        if (local) await db.invoices.put({ ...invoiceFromApi(full, local), pendingOps: local.pendingOps });
      });
      return;
    }
    case "orderStatus": {
      const local = await db.orders.get(entry.localId);
      if (!local?.serverId) throw new BlockedError();
      await endpoints.updateOrderStatus(local.serverId, entry.payload.action, entry.payload.note);
      const fresh = await endpoints.fetchOrder(local.serverId).catch(() => null);
      await settle(db, entry, async () => {
        const current = await db.orders.get(entry.localId);
        if (fresh && current) await db.orders.put({ ...orderFromApi(fresh, current), pendingOps: current.pendingOps });
      });
      return;
    }
    case "invoiceStatus": {
      const local = await db.invoices.get(entry.localId);
      if (!local?.serverId) throw new BlockedError();
      await endpoints.updateInvoiceStatus(local.serverId, entry.payload.status);
      const fresh = await endpoints.fetchInvoice(local.serverId).catch(() => null);
      await settle(db, entry, async () => {
        const current = await db.invoices.get(entry.localId);
        if (fresh && current) await db.invoices.put({ ...invoiceFromApi(fresh, current), pendingOps: current.pendingOps });
      });
      return;
    }
  }
}

/** The entry depends on a record whose creation hasn't synced yet. */
class BlockedError extends Error {}

async function markFailed(db: PosDb, entry: OutboxEntry, message: string) {
  await db.outbox.update(entry.seq!, { status: "failed", lastError: message, attempts: entry.attempts + 1 });
  const table = entry.type === "createOrder" || entry.type === "orderStatus" ? db.orders : db.invoices;
  await table.update(entry.localId, { syncState: "failed", syncError: message });
}

/** Pushes queued entries in order. Returns false if it stopped because the API is unreachable. */
async function push(db: PosDb): Promise<boolean> {
  const queued = await db.outbox.where("status").equals("queued").sortBy("seq");
  const blocked = new Set<string>();

  for (const entry of queued) {
    // Keep per-record ordering: once one entry for a record can't go, later ones wait too.
    if (blocked.has(entry.localId)) continue;
    try {
      await process(db, entry);
    } catch (e) {
      blocked.add(entry.localId);
      if (e instanceof BlockedError) continue;
      if (e instanceof ApiError) {
        if (e.isNetwork || e.isAuth) {
          await db.outbox.update(entry.seq!, { attempts: entry.attempts + 1, lastError: e.message });
          throw e;
        }
        if (e.isRetryable && entry.attempts + 1 < MAX_SERVER_ERROR_ATTEMPTS) {
          await db.outbox.update(entry.seq!, { attempts: entry.attempts + 1, lastError: e.message });
          continue;
        }
        await markFailed(db, entry, e.message);
        continue;
      }
      await markFailed(db, entry, e instanceof Error ? e.message : "Unexpected error");
    }
  }
  return true;
}

/* ---------- Engine: schedules pushes/pulls and exposes status to React ---------- */

export interface SyncStatus {
  /** Whether the last API call got through. Starts from navigator.onLine. */
  online: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}

let status: SyncStatus = { online: true, syncing: false, lastSyncedAt: null, lastError: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

let inflight: Promise<void> | null = null;
let rerun = false;

/**
 * Pushes the outbox, then (optionally) pulls fresh data. Concurrent calls
 * coalesce into one follow-up run so we never replay an entry twice.
 */
export function syncNow(opts: { pull?: boolean } = {}): Promise<void> {
  if (inflight) {
    rerun = true;
    return inflight;
  }
  const session = getSession();
  if (!session || session.needsReauth) return Promise.resolve();

  const db = getDb(session.businessId);
  // Members pinned to a location only see that location's orders and invoices.
  const locationFilter = session.assignedLocationId ?? undefined;

  inflight = (async () => {
    setStatus({ syncing: true });
    try {
      await push(db);
      if (opts.pull !== false) await pull(db, locationFilter);
      // Records created while we were pulling.
      await push(db);
      setStatus({ online: true, lastSyncedAt: Date.now(), lastError: null });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setStatus({
        online: err ? !err.isNetwork : status.online,
        lastError: e instanceof Error ? e.message : "Sync failed",
      });
    } finally {
      setStatus({ syncing: false });
      inflight = null;
      if (rerun) {
        rerun = false;
        void syncNow({ pull: false });
      }
    }
  })();
  return inflight;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts background sync. Returns a stop function. */
export function startSync() {
  const onOnline = () => {
    setStatus({ online: true });
    void syncNow();
  };
  const onOffline = () => setStatus({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };

  setStatus({ online: navigator.onLine });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  // While offline this doubles as a reachability probe: the first request fails fast.
  timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
  void syncNow();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    if (timer) clearInterval(timer);
    timer = null;
  };
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}
