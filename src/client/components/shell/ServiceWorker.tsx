"use client";
import { useEffect } from "react";

/** Registers the offline service worker (PWA shell cache, queued voice notes, background sync). */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
