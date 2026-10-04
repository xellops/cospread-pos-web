import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { CURRENCY } from "./config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency = CURRENCY) {
  let f = formatters.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2 });
    }
    formatters.set(currency, f);
  }
  return f.format(Number(amount) || 0);
}

export function formatDateTime(value: string | number | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function uid(prefix = "") {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${id}` : id;
}

export function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function lineTotal(lines: { unitPrice?: number; price?: number; quantity: number }[]) {
  return lines.reduce((sum, l) => sum + (l.unitPrice ?? l.price ?? 0) * l.quantity, 0);
}
