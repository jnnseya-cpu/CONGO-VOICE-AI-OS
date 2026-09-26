"use client";
import { useEffect } from "react";

/**
 * Registers the offline service worker, and makes sure a new one takes over.
 *
 * Registering is the easy half. The half that was missing is what happens when
 * a new version is deployed: the browser installs the new worker but leaves it
 * *waiting* while the old one still controls every open tab, so a citizen who
 * has used the app before keeps being served the previous build until they
 * close every tab. On a phone, where the app is never really closed, that is
 * indefinitely.
 *
 * So: ask for an update on load, tell a waiting worker to take over, and reload
 * once when control changes — exactly once, guarded, because a reload triggered
 * by a controller change that then triggers another is an infinite refresh and
 * the citizen cannot read anything at all.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // A worker already waiting means a previous visit installed an update
        // that never got to take over.
        if (registration.waiting) registration.waiting.postMessage({ type: "cvos-skip-waiting" });

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // "installed" with an existing controller means an update is ready
            // and is being held back. Without a controller it is the first
            // install, and reloading then would be a refresh for nothing.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage({ type: "cvos-skip-waiting" });
            }
          });
        });

        // The browser only checks for a new worker on its own schedule, which
        // can be a day. A citizen opening the app should not be that far behind.
        registration.update().catch(() => undefined);
      })
      .catch(() => undefined);

    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}
