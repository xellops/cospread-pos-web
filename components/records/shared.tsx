"use client";

import { AlertTriangle, ArrowLeft, CloudUpload, Search } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { discardUnsynced, retrySync } from "@/lib/actions";
import type { LocalInvoice, LocalOrder, SyncState } from "@/lib/db";
import type { InvoiceStatus, OrderPaymentStatus, OrderStatus } from "@/lib/types";
import { cn, formatMoney, humanize } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Badge, Button, Input, type BadgeTone } from "../ui";

const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: "warning",
  CONFIRMED: "brand",
  PROCESSING: "brand",
  READY: "brand",
  DISPATCHED: "brand",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const PAYMENT_TONE: Record<OrderPaymentStatus, BadgeTone> = {
  UNPAID: "neutral",
  PARTIAL: "warning",
  PAID: "success",
  REFUNDED: "danger",
};

const INVOICE_TONE: Record<InvoiceStatus, BadgeTone> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_STATUS_TONE[status]}>{humanize(status)}</Badge>;
}

export function PaymentBadge({ status }: { status: OrderPaymentStatus }) {
  return <Badge tone={PAYMENT_TONE[status]}>{humanize(status)}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_TONE[status]}>{humanize(status)}</Badge>;
}

export function SyncBadge({ state }: { state: SyncState }) {
  if (state === "synced") return null;
  return state === "failed" ? (
    <Badge tone="danger">
      <AlertTriangle className="size-3" /> Sync failed
    </Badge>
  ) : (
    <Badge tone="neutral">
      <CloudUpload className="size-3" /> Not synced
    </Badge>
  );
}

/** Reference to show for a record: the server's, or a short local code until it syncs. */
export function displayReference(r: LocalOrder | LocalInvoice) {
  return r.reference ?? `#${r.localId.slice(-6).toUpperCase()}`;
}

export function SyncProblem({ kind, record }: { kind: "order" | "invoice"; record: LocalOrder | LocalInvoice }) {
  const { db } = usePos();
  if (record.syncState !== "failed") return null;
  const neverSynced = !record.serverId;
  return (
    <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3">
      <div className="flex gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">CoSpread rejected this {neverSynced ? kind : "change"}</p>
          {record.syncError && <p className="mt-0.5 text-xs">{record.syncError}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => retrySync(db, kind, record.localId)}>
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            const msg = neverSynced
              ? `Discard this ${kind}? It only exists on this device.`
              : "Discard the unsynced changes and restore the server's version?";
            if (!window.confirm(msg)) return;
            await discardUnsynced(db, kind, record.localId);
            toast.success(neverSynced ? `${humanize(kind)} discarded` : "Changes discarded");
          }}
        >
          {neverSynced ? `Discard ${kind}` : "Discard changes"}
        </Button>
      </div>
    </div>
  );
}

export function ListToolbar({
  query,
  onQuery,
  placeholder,
  filters,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  filters: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b bg-surface px-3 py-3 sm:px-5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} className="pl-9" />
      </div>
      <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1">{filters}</div>
    </div>
  );
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 shrink-0 rounded-full border px-3 text-xs font-medium text-subtle-foreground",
        active && "border-brand bg-brand-soft text-brand",
      )}
    >
      {children}
    </button>
  );
}

/** List on the left, detail on the right; on narrow screens the detail covers the list. */
export function MasterDetail({
  list,
  detail,
  onCloseDetail,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  onCloseDetail: () => void;
}) {
  return (
    <div className="flex h-full min-h-0">
      <div className={cn("min-w-0 flex-1 flex-col lg:flex lg:max-w-xl lg:border-r", detail ? "hidden" : "flex")}>{list}</div>
      <div className={cn("min-w-0 flex-1 flex-col bg-surface", detail ? "flex" : "hidden lg:flex")}>
        {detail ? (
          <>
            <button
              onClick={onCloseDetail}
              className="flex items-center gap-1 border-b px-4 py-3 text-sm font-medium text-brand lg:hidden"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{detail}</div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a record to see its details</div>
        )}
      </div>
    </div>
  );
}

export function ItemsTable({
  items,
  currency,
}: {
  items: { description: string; price: number; quantity: number }[];
  currency?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-background text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Qty</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((it, i) => (
            <tr key={i}>
              <td className="px-3 py-2.5">
                <p className="font-medium">{it.description}</p>
                <p className="text-xs text-muted-foreground">{formatMoney(it.price, currency)} each</p>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{it.quantity}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatMoney(it.price * it.quantity, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
