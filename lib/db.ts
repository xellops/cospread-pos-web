import Dexie, { type EntityTable } from "dexie";
import type {
  BusinessLocation,
  Customer,
  InvoiceStatus,
  OrderPaymentStatus,
  OrderStatus,
  OrderStatusAction,
  OrderType,
  Product,
  CreateInvoiceInput,
  CreateOrderInput,
} from "./types";

/**
 * Local (IndexedDB) store. This is the source of truth for the UI: screens
 * read from here via `useLiveQuery`, writes land here first and are pushed to
 * the API by the sync engine (lib/sync.ts) through the `outbox` table.
 *
 * One database per business ("client ID") keeps tenants isolated on shared devices.
 */

export type SyncState = "synced" | "pending" | "failed";

export interface CachedProduct extends Product {
  /** Lower-cased name + description + SKUs, for offline search. */
  searchText: string;
}

export interface CartLine {
  variantId: string;
  productId: string;
  name: string;
  variantLabel: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  image: string | null;
}

export interface CartCustomer {
  customerId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

export interface Cart {
  id: string;
  name: string;
  position: number;
  lines: CartLine[];
  customer: CartCustomer | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalLineItem {
  description: string;
  price: number;
  quantity: number;
  productVariantId: string | null;
}

interface SyncedRecord {
  /** Stable local key. Equals the server id for records that originated on the server. */
  localId: string;
  serverId: string | null;
  syncState: SyncState;
  syncError?: string | null;
  /** Outbox entries still waiting for this record; pulls don't overwrite it meanwhile. */
  pendingOps: number;
  createdBy?: string | null;
}

export interface LocalOrder extends SyncedRecord {
  reference: string | null;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  type: OrderType;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  note: string | null;
  deliveryAddress: string | null;
  deliveryFee: number;
  subtotal: number;
  total: number;
  businessLocationId: string | null;
  items: LocalLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalInvoice extends SyncedRecord {
  reference: string | null;
  status: InvoiceStatus;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  businessLocationId: string | null;
  dueDate: string | null;
  paidAt: string | null;
  items: LocalLineItem[];
  total: number;
  createdAt: string;
  updatedAt: string;
}

export type OutboxEntry =
  | OutboxBase<"createOrder", CreateOrderInput>
  | OutboxBase<"createInvoice", CreateInvoiceInput>
  | OutboxBase<"orderStatus", { action: OrderStatusAction; note?: string }>
  | OutboxBase<"invoiceStatus", { status: "PAID" | "CANCELLED" }>;

interface OutboxBase<T extends string, P> {
  seq?: number;
  type: T;
  /** localId of the order/invoice this entry acts on. */
  localId: string;
  payload: P;
  attempts: number;
  lastError: string | null;
  /** Failed entries are parked until the user retries or discards them. */
  status: "queued" | "failed";
  createdAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export type PosDb = Dexie & {
  products: EntityTable<CachedProduct, "id">;
  customers: EntityTable<Customer, "id">;
  locations: EntityTable<BusinessLocation, "id">;
  carts: EntityTable<Cart, "id">;
  orders: EntityTable<LocalOrder, "localId">;
  invoices: EntityTable<LocalInvoice, "localId">;
  outbox: EntityTable<OutboxEntry, "seq">;
  meta: EntityTable<MetaEntry, "key">;
};

function open(businessId: string): PosDb {
  const db = new Dexie(`cospread-pos-${businessId}`) as PosDb;
  db.version(1).stores({
    products: "&id, name, status",
    customers: "&id",
    locations: "&id",
    carts: "&id, position",
    orders: "&localId, serverId, createdAt, syncState",
    invoices: "&localId, serverId, createdAt, syncState",
    outbox: "++seq, status, localId",
    meta: "&key",
  });
  return db;
}

let current: { businessId: string; db: PosDb } | null = null;

export function getDb(businessId: string): PosDb {
  if (current?.businessId !== businessId) {
    current?.db.close();
    current = { businessId, db: open(businessId) };
  }
  return current.db;
}

export async function getMeta<T>(db: PosDb, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export function setMeta(db: PosDb, key: string, value: unknown) {
  return db.meta.put({ key, value });
}
