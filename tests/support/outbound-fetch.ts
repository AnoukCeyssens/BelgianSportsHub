// Replaces the Worker's outbound fetch() with recorded source payloads. The
// Worker under test runs in the same isolate as the tests, so stubbing the
// global fetch covers it. Any request for an URL that has no fixture fails the
// call loudly, so a test can never reach the real internet.
// Restored after every test by tests/support/setup.ts.
import { vi } from "vitest";

export type RecordedResponse = {
  url: string;
  body: BodyInit;
  status?: number;
  contentType?: string | null;
  /** For a recorded POST: the form it sent, url-encoded. A request matches on URL and this body. */
  requestBody?: string;
};

export function stubOutboundFetch(responses: RecordedResponse[]) {
  const key = (url: string, requestBody?: string | null) => (requestBody ? `POST ${url} ${requestBody}` : url);
  const byRequest = new Map(responses.map((r) => [key(r.url, r.requestBody), r]));
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const requestBody = typeof init?.body === "string" ? init.body : null;
    const hit = byRequest.get(key(url, requestBody));
    if (!hit) throw new Error(`Unstubbed outbound fetch: ${requestBody ? `POST ${url} ${requestBody}` : url}`);
    const headers = new Headers(hit.contentType ? { "content-type": hit.contentType } : undefined);
    // Binary bodies (FIS ZIPs) come with their length, as a real download does.
    if (hit.body instanceof Uint8Array) headers.set("content-length", String(hit.body.byteLength));
    return new Response(hit.body, { status: hit.status ?? 200, headers });
  });
}
