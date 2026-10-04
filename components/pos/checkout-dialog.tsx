"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { changeOrderStatus, createInvoice, placeOrder, setCartCustomer } from "@/lib/actions";
import type { Cart, CartCustomer } from "@/lib/db";
import { useSyncStatus } from "@/lib/sync";
import type { OrderType } from "@/lib/types";
import { cn, formatMoney, lineTotal } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Button, Field, Input, Modal, Segmented, Textarea } from "../ui";

type CustomerMode = "walk-in" | "existing" | "new";

const WALK_IN: CartCustomer = { firstName: "Walk-in", lastName: "Customer" };

// Mirrors the API's class-validator rules so offline orders don't fail on sync.
const PHONE_RE = /^\+[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCustomer(c: CartCustomer): string | null {
  if (c.customerId) return null;
  if (c.firstName.trim().length < 2) return "First name must be at least 2 characters";
  if (c.lastName.trim().length < 2) return "Last name must be at least 2 characters";
  if (c.email?.trim() && !EMAIL_RE.test(c.email.trim())) return "Enter a valid email address";
  if (c.phone?.trim() && !PHONE_RE.test(c.phone.replace(/[\s-]/g, ""))) {
    return "Enter the phone number with its country code, e.g. +2348012345678";
  }
  return null;
}

function CustomerSearch({ value, onSelect }: { value?: string; onSelect: (c: CartCustomer) => void }) {
  const { db } = usePos();
  const [q, setQ] = useState("");
  const customers = useLiveQuery(() => db.customers.toArray(), [db], []);
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? customers.filter((c) =>
          [c.firstName, c.lastName, c.email, c.phone].filter(Boolean).join(" ").toLowerCase().includes(term),
        )
      : customers;
    return list.slice(0, 30);
  }, [customers, q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone" className="pl-9" />
      </div>
      <div className="max-h-48 divide-y overflow-y-auto rounded-lg border">
        {results.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {customers.length ? "No matching customers" : "No customers downloaded yet"}
          </p>
        ) : (
          results.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                onSelect({
                  customerId: c.id,
                  firstName: c.firstName,
                  lastName: c.lastName,
                  email: c.email ?? undefined,
                  phone: c.phone ?? undefined,
                })
              }
              className={cn("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background", value === c.id && "bg-brand-soft")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {c.firstName} {c.lastName}
                </p>
                <p className="truncate text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</p>
              </div>
              {value === c.id && <Check className="size-4 text-brand" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function CheckoutDialog({ cart, mode, onClose }: { cart: Cart; mode: "order" | "invoice"; onClose: () => void }) {
  const { db, session } = usePos();
  const sync = useSyncStatus();
  const currency = session.currencyCode;

  const initialMode: CustomerMode = cart.customer?.customerId
    ? "existing"
    : cart.customer && cart.customer.firstName !== WALK_IN.firstName
      ? "new"
      : mode === "invoice"
        ? "new"
        : "walk-in";
  const [customerMode, setCustomerMode] = useState<CustomerMode>(initialMode);
  const [existing, setExisting] = useState<CartCustomer | null>(cart.customer?.customerId ? cart.customer : null);
  const [custom, setCustom] = useState<CartCustomer>(
    cart.customer && !cart.customer.customerId && initialMode === "new" ? cart.customer : { firstName: "", lastName: "" },
  );

  const [type, setType] = useState<OrderType>("IN_STORE");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [note, setNote] = useState("");
  const [paid, setPaid] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lineTotal(cart.lines);
  const fee = type === "DELIVERY" ? Number(deliveryFee) || 0 : 0;
  const total = mode === "order" ? subtotal + fee : subtotal;

  const customer: CartCustomer | null =
    customerMode === "walk-in" ? WALK_IN : customerMode === "existing" ? existing : custom;

  async function submit() {
    setError(null);
    if (!customer) return setError("Select a customer");
    const invalid = validateCustomer(customer);
    if (invalid) return setError(invalid);
    if (mode === "order" && type === "DELIVERY" && !deliveryAddress.trim()) return setError("Enter a delivery address");

    setSubmitting(true);
    try {
      await setCartCustomer(db, cart.id, customer);
      if (mode === "order") {
        const order = await placeOrder(db, session, cart, {
          customer,
          type,
          note,
          deliveryAddress,
          deliveryFee: fee,
        });
        if (paid) await changeOrderStatus(db, order.localId, "paid");
        toast.success(sync.online ? "Order created" : "Order saved. It will sync when you're back online.");
      } else {
        await createInvoice(db, session, cart, { customer, dueDate: dueDate || undefined });
        toast.success(sync.online ? "Invoice created" : "Invoice saved. It will sync when you're back online.");
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "order" ? "Checkout" : "Create invoice"}
      description={`${cart.name} · ${cart.lines.reduce((n, l) => n + l.quantity, 0)} item(s)`}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button loading={submitting} onClick={submit}>
            {mode === "order" ? `Place order · ${formatMoney(total, currency)}` : `Create invoice · ${formatMoney(total, currency)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Customer</h3>
          <Segmented
            value={customerMode}
            onChange={setCustomerMode}
            options={[
              { value: "walk-in", label: "Walk-in" },
              { value: "existing", label: "Existing" },
              { value: "new", label: "New details" },
            ]}
          />
          {customerMode === "walk-in" && (
            <p className="text-xs text-muted-foreground">Recorded as “Walk-in Customer”, with no contact details.</p>
          )}
          {customerMode === "existing" && <CustomerSearch value={existing?.customerId} onSelect={setExisting} />}
          {customerMode === "new" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" htmlFor="firstName">
                <Input id="firstName" value={custom.firstName} onChange={(e) => setCustom({ ...custom, firstName: e.target.value })} />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input id="lastName" value={custom.lastName} onChange={(e) => setCustom({ ...custom, lastName: e.target.value })} />
              </Field>
              <Field label="Phone (optional)" htmlFor="phone">
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+2348012345678"
                  value={custom.phone ?? ""}
                  onChange={(e) => setCustom({ ...custom, phone: e.target.value })}
                />
              </Field>
              <Field label="Email (optional)" htmlFor="email">
                <Input id="email" type="email" value={custom.email ?? ""} onChange={(e) => setCustom({ ...custom, email: e.target.value })} />
              </Field>
            </div>
          )}
        </section>

        {mode === "order" ? (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Fulfilment</h3>
              <Segmented
                value={type}
                onChange={setType}
                options={[
                  { value: "IN_STORE", label: "In store" },
                  { value: "PICKUP", label: "Pickup" },
                  { value: "DELIVERY", label: "Delivery" },
                ]}
              />
              {type === "DELIVERY" && (
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <Field label="Delivery address" htmlFor="address">
                    <Input id="address" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                  </Field>
                  <Field label="Delivery fee" htmlFor="fee">
                    <Input id="fee" inputMode="decimal" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
                  </Field>
                </div>
              )}
            </section>

            <Field label="Note (optional)" htmlFor="note">
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the team should know" />
            </Field>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-[var(--brand)]" />
              <div className="flex-1">
                <p className="text-sm font-medium">Customer has paid</p>
                <p className="text-xs text-muted-foreground">Marks the order as paid once it&apos;s recorded.</p>
              </div>
            </label>
          </>
        ) : (
          <Field label="Due date (optional)" htmlFor="dueDate">
            <Input id="dueDate" type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        )}

        <div className="space-y-1.5 rounded-xl bg-background px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
          </div>
          {mode === "order" && fee > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery</span>
              <span className="tabular-nums">{formatMoney(fee, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </div>
        </div>

        {!sync.online && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            You&apos;re offline. This will be saved on this device and synced automatically.
          </p>
        )}
        {error && <p className="rounded-lg bg-destructive-soft px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}
