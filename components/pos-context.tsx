"use client";

import { createContext, useContext } from "react";
import type { PosDb } from "@/lib/db";
import type { Session } from "@/lib/session";

export interface PosContextValue {
  session: Session;
  db: PosDb;
}

export const PosContext = createContext<PosContextValue | null>(null);

/** The signed-in session and its business's local database. Only valid under app/(app). */
export function usePos(): PosContextValue {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used inside the signed-in app layout");
  return ctx;
}
