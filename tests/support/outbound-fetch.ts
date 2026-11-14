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
};

export function stubOutboundFetch(responses: RecordedResponse[]) {
  const byUrl = new Map(responses.map((r) => [r.url, r]));
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    const hit = byUrl.get(url);
    if (!hit) throw new Error(`Unstubbed outbound fetch: ${url}`);
    const headers = hit.contentType ? { "content-type": hit.contentType } : undefined;
    return new Response(hit.body, { status: hit.status ?? 200, headers });
  });
}
