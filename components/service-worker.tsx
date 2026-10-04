"use client";

import { useEffect } from "react";

/** Registers public/sw.js so the app shell loads without a network (production only). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Offline reloads won't work, but the app itself is unaffected.
    });
  }, []);
  return null;
}
