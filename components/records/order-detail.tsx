"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { changeOrderStatus, ORDER_ACTION_LABELS, ORDER_NEXT_ACTIONS } from "@/lib/actions";
import type { LocalOrder } from "@/lib/db";
import type { OrderStatusAction } from "@/lib/types";
import { formatDateTime, formatMoney, humanize } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Button, Modal, Textarea } from "../ui";
import { displayReference, ItemsTable, OrderStatusBadge, PaymentBadge, SyncBadge, SyncProblem } from "./shared";

export function OrderDetail({ order, locationName }: { order: LocalOrder; locationName?: string }) {
  const { db, session } = usePos();
  const currency = session.currencyCode;
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  // A rejected order that never reached CoSpread can only be retried or discarded.
  const stuck = order.syncState === "failed" && !order.serverId;
  const actions = (stuck ? [] : ORDER_NEXT_ACTIONS[order.status]).filter(
    // Dispatch only makes sense for deliveries.
    (a) => a !== "dispatch" || order.type === "DELIVERY",
  );
  const forward = actions.filter((a) => a !== "cancel");
  const canPay = !stuck && order.paymentStatus === "UNPAID" && order.status !== "CANCELLED";

  function run(action: OrderStatusAction, note?: string) {
    void changeOrderStatus(db, order.localId, action, note);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{displayReference(order)}</h2>
            <SyncBadge state={order.syncState} />
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(order.createdAt)}
            {locationName && ` · ${locationName}`}
          </p>
        </div>
        <div className="flex gap-1">
          <OrderStatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} />
        </div>
      </div>

      <SyncProblem kind="order" record={order} />

      {(forward.length > 0 || canPay) && (
        <div className="flex flex-wrap gap-2">
          {canPay && (
            <Button variant="secondary" onClick={() => run("paid")}>
              {ORDER_ACTION_LABELS.paid}
            </Button>
          )}
          {forward.map((a) => (
            <Button key={a} onClick={() => run(a)}>
              {ORDER_ACTION_LABELS[a]}
            </Button>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Customer</dt>
          <dd className="font-medium">
            {order.recipientFirstName} {order.recipientLastName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fulfilment</dt>
          <dd className="font-medium">{humanize(order.type)}</dd>
        </div>
        {order.recipientPhone && (
          <div>
            <dt className="text-xs text-muted-foreground">Phone</dt>
            <dd>{order.recipientPhone}</dd>
          </div>
        )}
        {order.recipientEmail && (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="truncate">{order.recipientEmail}</dd>
          </div>
        )}
        {order.deliveryAddress && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Delivery address</dt>
            <dd>{order.deliveryAddress}</dd>
          </div>
        )}
        {order.note && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Note</dt>
            <dd className="whitespace-pre-line">{order.note}</dd>
          </div>
        )}
      </dl>

      <ItemsTable items={order.items} currency={currency} />

      <div className="space-y-1.5 rounded-xl bg-background px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(order.subtotal, currency)}</span>
        </div>
        {order.deliveryFee > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Delivery</span>
            <span className="tabular-nums">{formatMoney(order.deliveryFee, currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(order.total, currency)}</span>
        </div>
        {order.syncState !== "synced" && !order.serverId && (
          <p className="pt-1 text-xs text-muted-foreground">Totals are confirmed by CoSpread once the order syncs.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
        {actions.includes("cancel") && (
          <Button variant="ghost" className="text-destructive" onClick={() => setCancelling(true)}>
            {ORDER_ACTION_LABELS.cancel}
          </Button>
        )}
      </div>

      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${displayReference(order)}?`}
        description="This can't be undone."
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelling(false)}>
              Keep order
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                run("cancel", reason);
                setCancelling(false);
                setReason("");
              }}
            >
              Cancel order
            </Button>
          </>
        }
      >
        <Textarea
          value={reason}
          maxLength={120}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional, up to 120 characters)"
        />
      </Modal>
    </div>
  );
}
