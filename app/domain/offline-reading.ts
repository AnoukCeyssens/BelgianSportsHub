// Which pages the installed app keeps for offline reading (spec #20, story 117).
// Pure: used by the service worker (pwa/service-worker.ts) and by the root
// layout, which swaps a curation page for an offline message when the
// connection drops, so the owner never fills in a stale form.

/** Every curation route lives under this path (owner-only, online only). */
export const CURATION_PATH = "/curate";

/**
 * - "reader": cache each page (and its data) as it is viewed; show the cached
 *   copy when offline.
 * - "curation": never cache; show an offline message when offline.
 */
export type OfflineReading = "reader" | "curation";

/** How a same-origin page or data request (React Router's "<path>.data") reads offline. */
export function offlineReading(pathname: string): OfflineReading {
  const page = pageOf(pathname);
  return page === CURATION_PATH || page.startsWith(`${CURATION_PATH}/`) ? "curation" : "reader";
}

/** "/athletes/x.data" → "/athletes/x"; "/_.data" → "/"; "/curate/_.data" → "/curate/". */
function pageOf(pathname: string) {
  if (pathname.endsWith("/_.data")) return pathname.slice(0, -"_.data".length);
  if (pathname.endsWith(".data")) return pathname.slice(0, -".data".length);
  return pathname;
}
