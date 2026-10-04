"use client";

import { Mail, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { changeInvoiceStatus } from "@/lib/actions";
import { ApiError } from "@/lib/api/client";
import { sendInvoicePaymentRequest } from "@/lib/api/endpoints";
import type { LocalInvoice } from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Button } from "../ui";
import { displayReference, InvoiceStatusBadge, ItemsTable, SyncBadge, SyncProblem } from "./shared";

export function InvoiceDetail({ invoice, locationName }: { invoice: LocalInvoice; locationName?: string }) {
  const { db, session } = usePos();
  const currency = session.currencyCode;
  const [sending, setSending] = useState(false);
  // A rejected invoice that never reached CoSpread can only be retried or discarded.
  const open = invoice.status === "PENDING" && !(invoice.syncState === "failed" && !invoice.serverId);
  const overdue = open && invoice.dueDate && new Date(invoice.dueDate) < new Date();

  async function sendRequest() {
    if (!invoice.serverId) return;
    setSending(true);
    try {
      await sendInvoicePaymentRequest(invoice.serverId);
      toast.success(`Payment request sent to ${invoice.recipientEmail}`);
    } catch (e) {
      toast.error(e instanceof ApiError && e.isNetwork ? "You're offline. Try again when connected." : e instanceof Error ? e.message : "Unable to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{displayReference(invoice)}</h2>
            <SyncBadge state={invoice.syncState} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(invoice.createdAt)}
            {locationName && ` · ${locationName}`}
          </p>
        </div>
        <div className="flex gap-1">
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </div>

      <SyncProblem kind="invoice" record={invoice} />

      {open && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => changeInvoiceStatus(db, invoice.localId, "PAID")}>Mark as paid</Button>
          {invoice.recipientEmail && (
            <Button
              variant="secondary"
              loading={sending}
              disabled={!invoice.serverId}
              title={invoice.serverId ? undefined : "Available once the invoice syncs"}
              onClick={sendRequest}
            >
              <Mail /> Send payment request
            </Button>
          )}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Billed to</dt>
          <dd className="font-medium">
            {invoice.recipientFirstName} {invoice.recipientLastName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Due</dt>
          <dd className={overdue ? "font-medium text-destructive" : "font-medium"}>
            {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "On receipt"}
            {overdue && " · overdue"}
          </dd>
        </div>
        {invoice.recipientPhone && (
          <div>
            <dt className="text-xs text-muted-foreground">Phone</dt>
            <dd>{invoice.recipientPhone}</dd>
          </div>
        )}
        {invoice.recipientEmail && (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="truncate">{invoice.recipientEmail}</dd>
          </div>
        )}
        {invoice.paidAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Paid</dt>
            <dd>{formatDateTime(invoice.paidAt)}</dd>
          </div>
        )}
      </dl>

      <ItemsTable items={invoice.items} currency={currency} />

      <div className="flex justify-between rounded-xl bg-background px-4 py-3 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(invoice.total, currency)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        {open && (
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={() => window.confirm("Cancel this invoice? This can't be undone.") && changeInvoiceStatus(db, invoice.localId, "CANCELLED")}
          >
            Cancel invoice
          </Button>
        )}
      </div>
    </div>
  );
}
