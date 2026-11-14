import { describe, expect, it } from "vitest";
import { get } from "../support/worker";

// Spec #20, story 117: the app installs as a PWA. The manifest, icons and
// service worker are static files from the build; every page links them.
describe("installable app", () => {
  it.each(["/athletes", "/calendar", "/championship", "/games"])("%s links the web app manifest and icons", async (path) => {
    const html = await (await get(path)).text();

    // Behind Cloudflare Access the manifest must be fetched with credentials.
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"/>');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>');
  });
});
