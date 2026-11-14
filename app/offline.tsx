// Browser side of the installed app (spec #20, story 117): registers the
// service worker (pwa/service-worker.ts) and tracks the connection, so the
// root layout can replace a curation page with an offline message.
import { useEffect, useSyncExternalStore } from "react";

/** Registers the service worker in production builds (dev keeps plain network). */
export function useServiceWorker() {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
    }
  }, []);
}

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** False while the browser reports no connection; always true on the server. */
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** Shown instead of a curation page while offline: curation never works from an old copy. */
export function CurationOffline() {
  return (
    <>
      <h1>Curation needs a connection</h1>
      <p className="meta">You're offline. Curation works online only, so its forms are hidden until you reconnect.</p>
      <p className="sub">Reader pages you viewed recently still open offline.</p>
    </>
  );
}

/** Shown when a page's data can't be fetched because the device is offline. */
export function ReaderOffline() {
  return (
    <>
      <h1>You're offline</h1>
      <p className="meta">This page hasn't been viewed on this device recently, so there's no copy to read offline.</p>
      <p className="sub">Pages you viewed recently still open.</p>
    </>
  );
}
