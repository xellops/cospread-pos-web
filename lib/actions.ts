"use client";

import type { Cart, CartCustomer, CartLine, LocalInvoice, LocalOrder, OutboxEntry, PosDb } from "./db";
import { setMeta } from "./db";
import type { Session } from "./session";
import { syncNow } from "./sync";
import type {
  CreateInvoiceInput,
  CreateOrderInput,
  OrderStatus,
  OrderStatusAction,
  OrderType,
  RecipientInput,
} from "./types";
import { lineTotal, uid } from "./utils";

/* ---------- Carts ---------- */

export const ACTIVE_CART_KEY = "activeCartId";

export async function createCart(db: PosDb): Promise<Cart> {
  const carts = await db.carts.orderBy("position").toArray();
  const used = new Set(carts.map((c) => c.name));
  let n = carts.length + 1;
  while (used.has(`Customer ${n}`)) n++;
  const cart: Cart = {
    id: uid("cart"),
    name: `Customer ${n}`,
    position: (carts.at(-1)?.position ?? 0) + 1,
    lines: [],
    customer: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.carts.add(cart);
  await setMeta(db, ACTIVE_CART_KEY, cart.id);
  return cart;
}

/** Closes a cart tab and activates its neighbour (creating a fresh cart if it was the last). */
export async function closeCart(db: PosDb, cartId: string) {
  const carts = await db.carts.orderBy("position").toArray();
  const idx = carts.findIndex((c) => c.id === cartId);
  await db.carts.delete(cartId);
  const remaining = carts.filter((c) => c.id !== cartId);
  if (!remaining.length) {
    await createCart(db);
    return;
  }
  const next = remaining[Math.min(idx, remaining.length - 1)];
  await setMeta(db, ACTIVE_CART_KEY, next.id);
}

export function renameCart(db: PosDb, cartId: string, name: string) {
  return db.carts.update(cartId, { name: name.trim() || "Customer", updatedAt: Date.now() });
}

export async function addToCart(db: PosDb, cartId: string, line: Omit<CartLine, "quantity">, quantity = 1) {
  await db.transaction("rw", db.carts, async () => {
    const cart = await db.carts.get(cartId);
    if (!cart) return;
    const existing = cart.lines.find((l) => l.variantId === line.variantId);
    const lines = existing
      ? cart.lines.map((l) => (l.variantId === line.variantId ? { ...l, quantity: l.quantity + quantity } : l))
      : [...cart.lines, { ...line, quantity }];
    await db.carts.update(cartId, { lines, updatedAt: Date.now() });
  });
}

export async function setLineQuantity(db: PosDb, cartId: string, variantId: string, quantity: number) {
  await db.transaction("rw", db.carts, async () => {
    const cart = await db.carts.get(cartId);
    if (!cart) return;
    const lines =
      quantity <= 0
        ? cart.lines.filter((l) => l.variantId !== variantId)
        : cart.lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l));
    await db.carts.update(cartId, { lines, updatedAt: Date.now() });
  });
}

export function clearCart(db: PosDb, cartId: string) {
  return db.carts.update(cartId, { lines: [], customer: null, updatedAt: Date.now() });
}

export function setCartCustomer(db: PosDb, cartId: string, customer: CartCustomer | null) {
  return db.carts.update(cartId, { customer, updatedAt: Date.now() });
}

/* ---------- Checkout: orders and invoices are written locally, then queued for the API ---------- */

function recipientOf(customer: CartCustomer): RecipientInput {
  if (customer.customerId) return { customerId: customer.customerId };
  return {
    custom: {
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      ...(customer.email?.trim() ? { email: customer.email.trim() } : {}),
      ...(customer.phone?.trim() ? { phone: customer.phone.trim() } : {}),
    },
  };
}

function itemsOf(cart: Cart) {
  return cart.lines.map((l) => ({ quantity: l.quantity, productVariantId: l.variantId }));
}

function localItems(cart: Cart) {
  return cart.lines.map((l) => ({
    description: l.variantLabel ? `${l.name} (${l.variantLabel})` : l.name,
    price: l.unitPrice,
    quantity: l.quantity,
    productVariantId: l.variantId,
  }));
}

export interface CheckoutDetails {
  customer: CartCustomer;
  type: OrderType;
  note?: string;
  deliveryAddress?: string;
  deliveryFee?: number;
}

export async function placeOrder(db: PosDb, session: Session, cart: Cart, details: CheckoutDetails) {
  const now = new Date().toISOString();
  const deliveryFee = details.type === "DELIVERY" ? details.deliveryFee || 0 : 0;
  const payload: CreateOrderInput = {
    recipient: recipientOf(details.customer),
    type: details.type,
    items: itemsOf(cart),
    ...(details.note?.trim() ? { note: details.note.trim() } : {}),
    ...(details.type === "DELIVERY" && details.deliveryAddress?.trim()
      ? { deliveryAddress: details.deliveryAddress.trim() }
      : {}),
    ...(deliveryFee ? { deliveryFee } : {}),
    ...(session.activeLocationId ? { businessLocationId: session.activeLocationId } : {}),
  };
  const subtotal = lineTotal(cart.lines);
  const order: LocalOrder = {
    localId: uid("local"),
    serverId: null,
    syncState: "pending",
    syncError: null,
    pendingOps: 1,
    createdBy: session.user.email,
    reference: null,
    status: "PENDING",
    paymentStatus: "UNPAID",
    type: details.type,
    recipientFirstName: details.customer.firstName,
    recipientLastName: details.customer.lastName,
    recipientEmail: details.customer.email || null,
    recipientPhone: details.customer.phone || null,
    note: payload.note ?? null,
    deliveryAddress: payload.deliveryAddress ?? null,
    deliveryFee,
    subtotal,
    total: subtotal + deliveryFee,
    businessLocationId: session.activeLocationId,
    items: localItems(cart),
    createdAt: now,
    updatedAt: now,
  };
  const entry: OutboxEntry = {
    type: "createOrder",
    localId: order.localId,
    payload,
    attempts: 0,
    lastError: null,
    status: "queued",
    createdAt: Date.now(),
  };
  await db.transaction("rw", db.orders, db.outbox, db.carts, db.meta, async () => {
    await db.orders.add(order);
    await db.outbox.add(entry);
  });
  await closeCart(db, cart.id);
  void syncNow({ pull: false });
  return order;
}

export async function createInvoice(
  db: PosDb,
  session: Session,
  cart: Cart,
  details: { customer: CartCustomer; dueDate?: string },
) {
  const now = new Date().toISOString();
  const payload: CreateInvoiceInput = {
    recipient: recipientOf(details.customer),
    items: itemsOf(cart),
    ...(details.dueDate ? { dueDate: new Date(details.dueDate).toISOString() } : {}),
    ...(session.activeLocationId ? { businessLocationId: session.activeLocationId } : {}),
  };
  const invoice: LocalInvoice = {
    localId: uid("local"),
    serverId: null,
    syncState: "pending",
    syncError: null,
    pendingOps: 1,
    createdBy: session.user.email,
    reference: null,
    status: "PENDING",
    recipientFirstName: details.customer.firstName,
    recipientLastName: details.customer.lastName,
    recipientEmail: details.customer.email || null,
    recipientPhone: details.customer.phone || null,
    businessLocationId: session.activeLocationId,
    dueDate: payload.dueDate ?? null,
    paidAt: null,
    items: localItems(cart),
    total: lineTotal(cart.lines),
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction("rw", db.invoices, db.outbox, async () => {
    await db.invoices.add(invoice);
    await db.outbox.add({
      type: "createInvoice",
      localId: invoice.localId,
      payload,
      attempts: 0,
      lastError: null,
      status: "queued",
      createdAt: Date.now(),
    });
  });
  await closeCart(db, cart.id);
  void syncNow({ pull: false });
  return invoice;
}

/* ---------- Status changes ---------- */

/** Mirrors STATUS_TRANSITIONS in the API's order.service.ts. */
export const ORDER_NEXT_ACTIONS: Record<OrderStatus, OrderStatusAction[]> = {
  PENDING: ["confirm", "cancel"],
  CONFIRMED: ["process", "cancel"],
  PROCESSING: ["ready", "cancel"],
  READY: ["dispatch", "deliver", "cancel"],
  DISPATCHED: ["deliver", "cancel"],
  DELIVERED: [],
  CANCELLED: [],
};

const ACTION_RESULT: Record<Exclude<OrderStatusAction, "paid">, OrderStatus> = {
  confirm: "CONFIRMED",
  process: "PROCESSING",
  ready: "READY",
  dispatch: "DISPATCHED",
  deliver: "DELIVERED",
  cancel: "CANCELLED",
};

export const ORDER_ACTION_LABELS: Record<OrderStatusAction, string> = {
  confirm: "Confirm",
  process: "Start processing",
  ready: "Mark ready",
  dispatch: "Dispatch",
  deliver: "Mark delivered",
  cancel: "Cancel order",
  paid: "Mark as paid",
};

export async function changeOrderStatus(db: PosDb, localId: string, action: OrderStatusAction, note?: string) {
  await db.transaction("rw", db.orders, db.outbox, async () => {
    const order = await db.orders.get(localId);
    if (!order) return;
    const patch: Partial<LocalOrder> =
      action === "paid" ? { paymentStatus: "PAID" } : { status: ACTION_RESULT[action] };
    await db.orders.update(localId, {
      ...patch,
      pendingOps: order.pendingOps + 1,
      syncState: order.syncState === "failed" ? "failed" : "pending",
      updatedAt: new Date().toISOString(),
    });
    await db.outbox.add({
      type: "orderStatus",
      localId,
      payload: { action, ...(note?.trim() ? { note: note.trim() } : {}) },
      attempts: 0,
      lastError: null,
      status: "queued",
      createdAt: Date.now(),
    });
  });
  void syncNow({ pull: false });
}

export async function changeInvoiceStatus(db: PosDb, localId: string, status: "PAID" | "CANCELLED") {
  await db.transaction("rw", db.invoices, db.outbox, async () => {
    const invoice = await db.invoices.get(localId);
    if (!invoice) return;
    await db.invoices.update(localId, {
      status,
      paidAt: status === "PAID" ? new Date().toISOString() : invoice.paidAt,
      pendingOps: invoice.pendingOps + 1,
      syncState: invoice.syncState === "failed" ? "failed" : "pending",
      updatedAt: new Date().toISOString(),
    });
    await db.outbox.add({
      type: "invoiceStatus",
      localId,
      payload: { status },
      attempts: 0,
      lastError: null,
      status: "queued",
      createdAt: Date.now(),
    });
  });
  void syncNow({ pull: false });
}

/* ---------- Failed sync recovery ---------- */

/** Re-queues every failed outbox entry for a record. */
export async function retrySync(db: PosDb, kind: "order" | "invoice", localId: string) {
  const table = kind === "order" ? db.orders : db.invoices;
  await db.transaction("rw", db.outbox, table, async () => {
    await db.outbox
      .where("localId")
      .equals(localId)
      .modify({ status: "queued", attempts: 0 });
    await table.update(localId, { syncState: "pending", syncError: null });
  });
  void syncNow({ pull: false });
}

/**
 * Drops a record's unsynced changes. A record that never reached the API is
 * deleted; one that did is reset so the next pull restores the server's copy.
 */
export async function discardUnsynced(db: PosDb, kind: "order" | "invoice", localId: string) {
  const table = kind === "order" ? db.orders : db.invoices;
  await db.transaction("rw", db.outbox, table, async () => {
    const entries = await db.outbox.where("localId").equals(localId).toArray();
    await db.outbox.bulkDelete(entries.map((e) => e.seq!));
    const record = await table.get(localId);
    if (!record) return;
    if (!record.serverId) await table.delete(localId);
    else await table.update(localId, { pendingOps: 0, syncState: "synced", syncError: null });
  });
  void syncNow();
}
