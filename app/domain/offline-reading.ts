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
  return isCurationPath(pathname) ? "curation" : "reader";
}

/**
 * Whether a page or its data request ("<path>.data") belongs to the
 * (owner-only) curation area. Route matching ignores case and decodes the
 * path, so this does too: "/Curate" or "/%63urate" are still curation.
 */
export function isCurationPath(pathname: string): boolean {
  const page = pageOf(decoded(pathname).replace(/\/{2,}/g, "/").toLowerCase());
  return page === CURATION_PATH || page.startsWith(`${CURATION_PATH}/`);
}

function decoded(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** "/athletes/x.data" → "/athletes/x"; "/_.data" → "/"; "/curate/_.data" → "/curate/". */
function pageOf(pathname: string) {
  if (pathname.endsWith("/_.data")) return pathname.slice(0, -"_.data".length);
  if (pathname.endsWith(".data")) return pathname.slice(0, -".data".length);
  return pathname;
}
