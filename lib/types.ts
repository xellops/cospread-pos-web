/* Shapes returned by the CoSpread API (../cospread-api). Only the fields the POS uses are typed. */

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Paginated<T> {
  total: number;
  limit: number;
  page: number;
  records: T[];
}

export interface SignInResult {
  firstName: string;
  lastName: string;
  email: string;
  token: string;
  refreshToken: string;
}

export interface BusinessLocation {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface Business {
  id: string;
  name: string;
  currencyCode?: string;
  primaryLocationId?: string | null;
}

export interface BusinessMember {
  id: string;
  userId: string;
  businessId: string;
  accessType: "OWNER" | "ADMIN" | "MEMBER" | string;
  isActive: boolean;
  businessLocationId: string | null;
  business: Business;
  businessLocation?: BusinessLocation | null;
}

export interface FileRecord {
  id: string;
  key: string;
  originalName: string;
  mimetype: string;
}

export interface FileAttachment {
  id: string;
  reference: string;
  fileId: string;
  isThumbnail?: boolean;
  file?: FileRecord;
}

export interface ProductVariant {
  id: string;
  productId: string;
  description: string | null;
  price: number;
  stock: number;
  isDefault: boolean;
  specification?: Record<string, unknown>;
}

export interface Stock {
  id: string;
  businessLocationId: string;
  productVariantId: string;
  quantity: number;
  onDisplay: boolean;
  pricePerUnit: number | null;
}

export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "DELETED";

export interface Product {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string;
  type: "GOOD" | "SERVICE";
  unit: string;
  status: ProductStatus;
  tags: string;
  sku: string | null;
  stockThreshold?: number;
  businessId: string;
  defaultAttachmentReference: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  variants: ProductVariant[];
  stocks?: Stock[];
  attachments?: FileAttachment[];
  updatedAt: string;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "READY"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED";

export type OrderPaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED";

export type OrderType = "DELIVERY" | "PICKUP" | "IN_STORE";

export interface ApiOrderItem {
  id: string;
  description: string;
  price: number;
  quantity: number;
  productVariantId: string | null;
  productId: string | null;
}

export interface ApiOrder {
  id: string;
  reference: string;
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
  customerId: string | null;
  userId: string | null;
  invoiceId: string | null;
  businessLocationId: string | null;
  businessLocation?: BusinessLocation | null;
  items?: ApiOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export interface ApiInvoiceItem {
  id: string;
  description: string;
  price: number;
  quantity: number;
  productVariantId: string | null;
}

export interface ApiInvoice {
  id: string;
  reference: string;
  status: InvoiceStatus;
  recipientFirstName: string;
  recipientLastName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  customerId: string | null;
  businessLocationId: string | null;
  dueDate: string | null;
  paidAt: string | null;
  items?: ApiInvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipientInput {
  customerId?: string;
  custom?: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
}

export interface LineItemInput {
  quantity: number;
  productVariantId?: string;
  custom?: { description: string; price: number };
}

export interface CreateOrderInput {
  recipient: RecipientInput;
  type: OrderType;
  note?: string;
  deliveryAddress?: string;
  deliveryFee?: number;
  businessLocationId?: string;
  items: LineItemInput[];
}

export interface CreateInvoiceInput {
  recipient: RecipientInput;
  items: LineItemInput[];
  dueDate?: string;
  businessLocationId?: string;
}

/** The PUT /v1/orders/:id/status/<action> verbs. */
export type OrderStatusAction =
  | "confirm"
  | "process"
  | "ready"
  | "dispatch"
  | "deliver"
  | "cancel"
  | "paid";
