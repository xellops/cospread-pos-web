import { MAX_PAGES, PAGE_LIMIT } from "../config";
import type {
  ApiInvoice,
  ApiOrder,
  BusinessLocation,
  BusinessMember,
  CreateInvoiceInput,
  CreateOrderInput,
  Customer,
  OrderStatusAction,
  Paginated,
  Product,
  SignInResult,
} from "../types";
import { api } from "./client";

/* Auth (v1/auth). There is no sign-up in the POS: accounts are created on the dashboard. */

export const signIn = (email: string, password: string) =>
  api<SignInResult>("v1/auth/signin", {
    method: "POST",
    body: { email, password },
    anonymous: true,
  });

export const requestPasswordReset = (email: string) =>
  api<void>("v1/auth/forgot-password", { method: "POST", body: { email }, anonymous: true });

export const resetPassword = (email: string, otp: string, password: string) =>
  api<void>("v1/auth/reset-password", {
    method: "POST",
    body: { email, otp, password },
    anonymous: true,
  });

/** Confirms the user belongs to the business identified by `clientId` and returns the membership. */
export const fetchMembership = (clientId: string, token: string) =>
  api<BusinessMember>(`v1/profile/businesses/${encodeURIComponent(clientId)}`, { token });

/* Business data. All of these are scoped by the x-business-id header. */

/** Walks every page of a paginated list endpoint (bounded by the API's page cap). */
export async function fetchAllPages<T>(
  path: string,
  query: Record<string, string | undefined> = {},
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await api<Paginated<T>>(path, { query: { ...query, page, limit: PAGE_LIMIT } });
    out.push(...res.records);
    if (res.records.length < PAGE_LIMIT || out.length >= res.total) break;
  }
  return out;
}

export const fetchProducts = () => fetchAllPages<Product>("v1/products", { status: "PUBLISHED" });

export const fetchLocations = () => fetchAllPages<BusinessLocation>("v1/business-locations", {}, 2);

export const fetchCustomers = () => fetchAllPages<Customer>("v1/customers", {}, 5);

export const fetchOrders = (businessLocationId?: string) =>
  fetchAllPages<ApiOrder>("v1/orders", { businessLocationId }, 3);

export const fetchOrder = (id: string) => api<ApiOrder>(`v1/orders/${id}`);

export const createOrder = (input: CreateOrderInput) =>
  api<ApiOrder>("v1/orders", { method: "POST", body: input });

export const updateOrderStatus = (id: string, action: OrderStatusAction, note?: string) =>
  api<ApiOrder>(`v1/orders/${id}/status/${action}`, {
    method: "PUT",
    body: note ? { note } : {},
  });

export const fetchInvoices = (businessLocationId?: string) =>
  fetchAllPages<ApiInvoice>("v1/invoices", { businessLocationId }, 3);

export const fetchInvoice = (id: string) => api<ApiInvoice>(`v1/invoices/${id}`);

/** The 20 most recent orders; used to detect a create that landed before its response was lost. */
export const fetchRecentOrders = () =>
  api<Paginated<ApiOrder>>("v1/orders", { query: { page: 1, limit: 20 } }).then((r) => r.records);

export const createInvoice = (input: CreateInvoiceInput) =>
  api<ApiInvoice>("v1/invoices", { method: "POST", body: input });

export const updateInvoiceStatus = (id: string, status: "PAID" | "CANCELLED") =>
  api<ApiInvoice>(`v1/invoices/${id}/status`, { method: "PATCH", body: { status } });

export const sendInvoicePaymentRequest = (id: string) =>
  api<void>(`v1/invoices/${id}/send-payment-request`, { method: "POST" });
