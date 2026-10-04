"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { PosContext } from "@/components/pos-context";
import { Spinner } from "@/components/ui";
import { getDb } from "@/lib/db";
import { useSession } from "@/lib/session";
import { startSync } from "@/lib/sync";

export default function SignedInLayout({ children }: LayoutProps<"/">) {
  const router = useRouter();
  const session = useSession();
  const businessId = session?.businessId;

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  useEffect(() => {
    if (!businessId) return;
    return startSync();
  }, [businessId]);

  const db = useMemo(() => (businessId ? getDb(businessId) : null), [businessId]);

  if (!session || !db) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <PosContext.Provider value={{ session, db }}>
      <AppShell>{children}</AppShell>
    </PosContext.Provider>
  );
}
