// Fixes "now" for the test and the Worker under test (same isolate). Only Date
// is faked, so timers and I/O keep working. Reset after every test by
// tests/support/setup.ts.
import { vi } from "vitest";

export function fixClock(isoInstant: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoInstant));
}
