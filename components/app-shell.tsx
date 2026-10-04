"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  CloudOff,
  FileText,
  LogOut,
  MapPin,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { reauthenticate, signOut } from "@/lib/auth";
import { updateSession } from "@/lib/session";
import { syncNow, useSyncStatus } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-context";
import { Button, Logo, Modal } from "./ui";

const NAV = [
  { href: "/pos", label: "Sell", icon: ShoppingCart },
  { href: "/orders", label: "Orders", icon: ReceiptText },
  { href: "/invoices", label: "Invoices", icon: FileText },
] as const;

function relativeTime(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function SyncIndicator() {
  const { db } = usePos();
  const status = useSyncStatus();
  const pending = useLiveQuery(() => db.outbox.where("status").equals("queued").count(), [db], 0);
  const failed = useLiveQuery(() => db.outbox.where("status").equals("failed").count(), [db], 0);

  let icon = <CheckCircle2 className="text-success" />;
  let label = status.lastSyncedAt ? `Synced ${relativeTime(status.lastSyncedAt)}` : "Not synced yet";
  let tone = "text-subtle-foreground";

  if (!status.online) {
    icon = <CloudOff className="text-warning" />;
    label = pending ? `Offline · ${pending} waiting` : "Offline";
    tone = "text-warning";
  } else if (status.syncing) {
    icon = <RefreshCw className="animate-spin text-brand" />;
    label = pending ? `Syncing ${pending}…` : "Syncing…";
  } else if (failed) {
    icon = <AlertTriangle className="text-destructive" />;
    label = `${failed} failed to sync`;
    tone = "text-destructive";
  } else if (pending) {
    icon = <RefreshCw className="text-brand" />;
    label = `${pending} waiting to sync`;
  }

  return (
    <button
      onClick={() => void syncNow()}
      title={status.lastError ?? "Sync now"}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border bg-surface px-3 text-xs font-medium [&_svg]:size-4",
        tone,
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function LocationPicker() {
  const { db, session } = usePos();
  const locations = useLiveQuery(() => db.locations.toArray(), [db], []);
  const active = locations.find((l) => l.id === session.activeLocationId);
  const pinned = Boolean(session.assignedLocationId);

  if (!locations.length && !active) return null;

  return (
    <label
      className="inline-flex h-9 max-w-[14rem] items-center gap-1.5 rounded-lg border bg-surface px-2.5 text-xs font-medium text-subtle-foreground"
      title={pinned ? "You're assigned to this location" : "Location for new orders"}
    >
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <select
        value={session.activeLocationId ?? ""}
        disabled={pinned}
        onChange={(e) => updateSession({ activeLocationId: e.target.value || null })}
        className="min-w-0 flex-1 truncate bg-transparent outline-none disabled:opacity-100"
      >
        {!session.activeLocationId && <option value="">Default location</option>}
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserMenu() {
  const { db, session } = usePos();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const pending = useLiveQuery(() => db.outbox.count(), [db], 0);
  const initials = `${session.user.firstName[0] ?? ""}${session.user.lastName[0] ?? ""}`.toUpperCase();

  function doSignOut() {
    signOut();
    router.replace("/login");
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
        title={`${session.user.firstName} ${session.user.lastName} · ${session.user.email}`}
      >
        {initials || "?"}
      </button>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`${session.user.firstName} ${session.user.lastName}`}
        description={`${session.user.email} · ${session.businessName}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Stay signed in
            </Button>
            <Button variant="danger" onClick={doSignOut}>
              <LogOut /> Sign out
            </Button>
          </>
        }
      >
        {pending > 0 ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            {pending} change{pending === 1 ? "" : "s"} haven&apos;t synced yet. They stay on this device and will sync the
            next time anyone signs in to {session.businessName} here.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Everything on this device is synced.</p>
        )}
      </Modal>
    </>
  );
}

function ReauthPrompt() {
  const { session } = usePos();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!session.needsReauth) return null;

  async function submit() {
    setLoading(true);
    try {
      await reauthenticate(password);
      setPassword("");
      toast.success("Signed in again. Syncing…");
      void syncNow();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => {}}
      title="Your session expired"
      description={`Enter the password for ${session.user.email} to keep syncing. Your carts and unsynced orders are safe.`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              signOut();
              router.replace("/login");
            }}
          >
            Switch account
          </Button>
          <Button loading={loading} onClick={submit} disabled={!password}>
            Continue
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Password"
          className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-brand"
        />
      </form>
    </Modal>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session } = usePos();

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <nav className="order-last flex shrink-0 border-t bg-surface md:order-first md:w-20 md:flex-col md:border-t-0 md:border-r">
        <div className="hidden h-16 items-center justify-center md:flex">
          <Logo className="h-5" />
        </div>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground md:flex-none md:py-4",
                active && "text-brand",
              )}
            >
              <span className={cn("flex size-9 items-center justify-center rounded-xl", active && "bg-brand-soft")}>
                <Icon className="size-5" />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-surface px-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{session.businessName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {session.user.firstName} {session.user.lastName}
            </p>
          </div>
          <LocationPicker />
          <SyncIndicator />
          <UserMenu />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>

      <ReauthPrompt />
    </div>
  );
}
