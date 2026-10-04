"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/components/pos-context";
import {
  displayReference,
  FilterChip,
  ListToolbar,
  MasterDetail,
  OrderStatusBadge,
  PaymentBadge,
  SyncBadge,
} from "@/components/records/shared";
import { OrderDetail } from "@/components/records/order-detail";
import { EmptyState, Spinner } from "@/components/ui";
import type { OrderStatus } from "@/lib/types";
import { cn, formatDateTime, formatMoney, humanize } from "@/lib/utils";

const STATUS_FILTERS: (OrderStatus | "ALL" | "UNSYNCED")[] = [
  "ALL",
  "UNSYNCED",
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
];

export default function OrdersPage() {
  const { db, session } = usePos();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [hereOnly, setHereOnly] = useState(Boolean(session.activeLocationId));
  const [selected, setSelected] = useState<string | null>(null);

  const orders = useLiveQuery(() => db.orders.orderBy("createdAt").reverse().toArray(), [db]);
  const locations = useLiveQuery(() => db.locations.toArray(), [db], []);
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name;

  const visible = useMemo(() => {
    let list = orders ?? [];
    if (hereOnly && session.activeLocationId) {
      list = list.filter((o) => !o.businessLocationId || o.businessLocationId === session.activeLocationId);
    }
    if (status === "UNSYNCED") list = list.filter((o) => o.syncState !== "synced");
    else if (status !== "ALL") list = list.filter((o) => o.status === status);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        [displayReference(o), o.recipientFirstName, o.recipientLastName, o.recipientEmail, o.recipientPhone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [orders, status, query, hereOnly, session.activeLocationId]);

  const current = orders?.find((o) => o.localId === selected) ?? null;

  const list = (
    <>
      <ListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search reference or customer"
        filters={
          <>
            {session.activeLocationId && !session.assignedLocationId && (
              <FilterChip active={hereOnly} onClick={() => setHereOnly((v) => !v)}>
                {hereOnly ? `At ${locationName(session.activeLocationId) ?? "this location"}` : "All locations"}
              </FilterChip>
            )}
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                {s === "ALL" ? "All" : s === "UNSYNCED" ? "Not synced" : humanize(s)}
              </FilterChip>
            ))}
          </>
        }
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {orders === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title={orders.length ? "No orders match" : "No orders yet"}
            description={orders.length ? "Try a different filter." : "Orders you create, and recent orders from CoSpread, show up here."}
          />
        ) : (
          <ul className="divide-y">
            {visible.map((o) => (
              <li key={o.localId}>
                <button
                  onClick={() => setSelected(o.localId)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface sm:px-5",
                    selected === o.localId && "bg-brand-soft/60 hover:bg-brand-soft/60",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{displayReference(o)}</span>
                      <SyncBadge state={o.syncState} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.recipientFirstName} {o.recipientLastName} · {formatDateTime(o.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <OrderStatusBadge status={o.status} />
                      <PaymentBadge status={o.paymentStatus} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(o.total, session.currencyCode)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <MasterDetail
      list={list}
      detail={current ? <OrderDetail order={current} locationName={locationName(current.businessLocationId)} /> : null}
      onCloseDetail={() => setSelected(null)}
    />
  );
}
