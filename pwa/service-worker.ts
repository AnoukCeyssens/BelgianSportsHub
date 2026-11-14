/// <reference lib="webworker" />
// The installed app's service worker (spec #20, story 117), built by
// vite-plugin-pwa (injectManifest) into build/client/sw.js.
//
// - The app shell (JS, CSS, icons, offline pages) is precached.
// - Reader pages and their data are cached as they are viewed ("recently
//   viewed"), network first, so an online reader always sees fresh data and
//   an offline one sees the last copy.
// - Curation is never cached: offline, it shows an offline message instead of
//   a stale form.
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkFirst, NetworkOnly } from "workbox-strategies";
import { offlineReading } from "../app/domain/offline-reading";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

/** A same-origin page load or React Router data request ("<path>.data"). */
function isPageOrData({ request, url }: { request: Request; url: URL }) {
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    (request.mode === "navigate" || url.pathname.endsWith(".data"))
  );
}

registerRoute(
  (o) => isPageOrData(o) && offlineReading(o.url.pathname) === "reader",
  new NetworkFirst({
    cacheName: "reader-pages",
    // On a slow mobile connection, fall back to the last copy after a few seconds.
    networkTimeoutSeconds: 5,
    plugins: [
      // Only real pages: never Cloudflare Access redirects or error pages.
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true }),
    ],
  }),
);

registerRoute((o) => isPageOrData(o) && offlineReading(o.url.pathname) === "curation", new NetworkOnly());

// Offline with nothing cached: page loads get an offline page; data requests
// fail, and the app shows its own offline message.
setCatchHandler(async ({ request, url }) => {
  if (request.mode !== "navigate") return Response.error();
  const page = offlineReading(url.pathname) === "curation" ? "offline-curation.html" : "offline.html";
  return (await matchPrecache(page)) ?? Response.error();
});
