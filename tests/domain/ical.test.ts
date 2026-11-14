import { describe, expect, it } from "vitest";
import { icalFeed, icalFold, icalText } from "~/domain";

// Spec #20, story 39; RFC 5545 §3.1 (folding) and §3.3.11 (TEXT escaping).

describe("icalText", () => {
  it.each([
    { name: "plain text unchanged", value: "Judo Grand Slam Tokyo", expected: "Judo Grand Slam Tokyo" },
    { name: "comma escaped", value: "World Cup, Calgary", expected: "World Cup\\, Calgary" },
    { name: "semicolon escaped", value: "Likely: added by hand; kept", expected: "Likely: added by hand\\; kept" },
    { name: "backslash escaped", value: "A\\B", expected: "A\\\\B" },
    { name: "newline escaped", value: "line one\nline two", expected: "line one\\nline two" },
    { name: "accents kept as they are", value: "Montréal · Östersund", expected: "Montréal · Östersund" },
  ])("$name", ({ value, expected }) => {
    expect(icalText(value)).toBe(expected);
  });
});

describe("icalFold", () => {
  it.each([
    { name: "75 octets stay on one line", line: "x".repeat(75), expected: "x".repeat(75) },
    { name: "76 octets continue after CRLF and a space", line: "x".repeat(76), expected: `${"x".repeat(75)}\r\n x` },
    {
      name: "continuation lines hold 74 octets after their space",
      line: "x".repeat(75 + 74 + 1),
      expected: `${"x".repeat(75)}\r\n ${"x".repeat(74)}\r\n x`,
    },
    // "é" is two octets in UTF-8: 74 x's + "é" would be 76, so "é" moves down whole.
    { name: "a multi-octet character is never split", line: `${"x".repeat(74)}é`, expected: `${"x".repeat(74)}\r\n é` },
  ])("$name", ({ line, expected }) => {
    expect(icalFold(line)).toBe(expected);
  });
});

describe("icalFeed", () => {
  it("writes a one-day competition as an all-day event ending the next day", () => {
    const ics = icalFeed(
      {
        name: "Test",
        timeZone: "Europe/Brussels",
        refreshHours: 12,
        events: [{ uid: "c1@belgiansportshub", startDate: "2026-12-31", endDate: "2026-12-31", summary: "New Year Race" }],
      },
      new Date("2026-11-14T04:05:06.789Z"),
    );

    expect(ics).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//BelgianSportsHub//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Test",
        "X-WR-TIMEZONE:Europe/Brussels",
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
        "X-PUBLISHED-TTL:PT12H",
        "BEGIN:VEVENT",
        "UID:c1@belgiansportshub",
        "DTSTAMP:20261114T040506Z",
        "DTSTART;VALUE=DATE:20261231",
        "DTEND;VALUE=DATE:20270101",
        "SUMMARY:New Year Race",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });
});
