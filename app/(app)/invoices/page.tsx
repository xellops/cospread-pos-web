"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { usePos } from "@/components/pos-context";
import { InvoiceDetail } from "@/components/records/invoice-detail";
import {
  displayReference,
  FilterChip,
  InvoiceStatusBadge,
  ListToolbar,
  MasterDetail,
  SyncBadge,
} from "@/components/records/shared";
import { Badge, EmptyState, Spinner } from "@/components/ui";
import type { InvoiceStatus } from "@/lib/types";
import { cn, formatDateTime, formatMoney, humanize } from "@/lib/utils";

const FILTERS: (InvoiceStatus | "ALL" | "OVERDUE" | "UNSYNCED")[] = ["ALL", "PENDING", "OVERDUE", "PAID", "CANCELLED", "UNSYNCED"];

function isOverdue(i: { status: InvoiceStatus; dueDate: string | null }, now: number) {
  return i.status === "PENDING" && !!i.dueDate && new Date(i.dueDate).getTime() < now;
}

export default function InvoicesPage() {
  const { db, session } = usePos();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [hereOnly, setHereOnly] = useState(Boolean(session.activeLocationId));
  const [selected, setSelected] = useState<string | null>(null);

  const invoices = useLiveQuery(() => db.invoices.orderBy("createdAt").reverse().toArray(), [db]);
  const locations = useLiveQuery(() => db.locations.toArray(), [db], []);
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name;
  // Fixed when the page opens; that's precise enough for the overdue filter.
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    let list = invoices ?? [];
    if (hereOnly && session.activeLocationId) {
      list = list.filter((i) => !i.businessLocationId || i.businessLocationId === session.activeLocationId);
    }
    if (filter === "UNSYNCED") list = list.filter((i) => i.syncState !== "synced");
    else if (filter === "OVERDUE") list = list.filter((i) => isOverdue(i, now));
    else if (filter !== "ALL") list = list.filter((i) => i.status === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        [displayReference(i), i.recipientFirstName, i.recipientLastName, i.recipientEmail, i.recipientPhone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [invoices, filter, query, hereOnly, session.activeLocationId, now]);

  const current = invoices?.find((i) => i.localId === selected) ?? null;

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
            {FILTERS.map((f) => (
              <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {f === "ALL" ? "All" : f === "UNSYNCED" ? "Not synced" : humanize(f)}
              </FilterChip>
            ))}
          </>
        }
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {invoices === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={invoices.length ? "No invoices match" : "No invoices yet"}
            description={invoices.length ? "Try a different filter." : "Create one from a cart with the Invoice button."}
          />
        ) : (
          <ul className="divide-y">
            {visible.map((i) => (
              <li key={i.localId}>
                <button
                  onClick={() => setSelected(i.localId)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface sm:px-5",
                    selected === i.localId && "bg-brand-soft/60 hover:bg-brand-soft/60",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{displayReference(i)}</span>
                      <SyncBadge state={i.syncState} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.recipientFirstName} {i.recipientLastName} · {formatDateTime(i.createdAt)}
                    </p>
                    <div className="flex gap-1">
                      <InvoiceStatusBadge status={i.status} />
                      {isOverdue(i, now) && <Badge tone="danger">Overdue</Badge>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(i.total, session.currencyCode)}</span>
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
      detail={current ? <InvoiceDetail invoice={current} locationName={locationName(current.businessLocationId)} /> : null}
      onCloseDetail={() => setSelected(null)}
    />
  );
}
