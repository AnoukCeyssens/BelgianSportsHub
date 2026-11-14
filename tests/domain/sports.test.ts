import { describe, expect, it } from "vitest";
import { canonicalSport, olympicCycleOf, sameSport, SPORTS } from "~/domain";

// GLOSSARY "Athlete" (a sport on the Olympic programme, summer or winter),
// "Olympic cycle"; spec #20 review (sport names, finding A). One vocabulary:
// the Olympic programme's sports and disciplines (LA 2028, French Alps 2030,
// plus Paris 2024 and Milano-Cortina 2026 for the reference Games).

describe("canonicalSport: the one sport name the app stores and compares", () => {
  it.each([
    { name: "a canonical name stays", raw: "Athletics", expected: "Athletics" },
    { name: "case and spacing do not matter", raw: "  speed   SKATING ", expected: "Speed skating" },
    { name: "a timetable's bracketed note is dropped", raw: "Athletics (Track & Field)", expected: "Athletics" },
    { name: "track and field is athletics", raw: "Track and field", expected: "Athletics" },
    { name: "short track on its own is short track speed skating", raw: "Short track", expected: "Short track speed skating" },
    { name: "short track speed skating as the IOC writes it", raw: "Short Track Speed Skating", expected: "Short track speed skating" },
    { name: "a hyphen or not, cross-country skiing", raw: "Cross country skiing", expected: "Cross-country skiing" },
    { name: "UCI's discipline name: road", raw: "Road cycling", expected: "Cycling road" },
    { name: "UCI's discipline name: track", raw: "Track cycling", expected: "Cycling track" },
    { name: "UCI's discipline name: mountain bike", raw: "Mountain bike", expected: "Cycling mountain bike" },
    { name: "UCI's discipline name: BMX racing", raw: "BMX racing", expected: "Cycling BMX racing" },
    { name: "UCI's discipline name: BMX freestyle", raw: "BMX freestyle", expected: "Cycling BMX freestyle" },
    { name: "open water swimming is marathon swimming", raw: "Open water swimming", expected: "Marathon swimming" },
    { name: "synchronised swimming is artistic swimming", raw: "Synchronised swimming", expected: "Artistic swimming" },
    { name: "trampoline gymnastics is trampoline", raw: "Trampoline gymnastics", expected: "Trampoline" },
    { name: "baseball and softball are one sport", raw: "Softball", expected: "Baseball/softball" },
    { name: "basketball 3x3 written the other way round", raw: "Basketball 3x3", expected: "3x3 basketball" },
    { name: "show jumping is equestrian jumping", raw: "Show jumping", expected: "Equestrian jumping" },
    { name: "dressage alone is equestrian dressage", raw: "Dressage", expected: "Equestrian dressage" },
    { name: "bobsled is bobsleigh", raw: "Bobsled", expected: "Bobsleigh" },
    { name: "snowboarding is snowboard", raw: "Snowboarding", expected: "Snowboard" },
    { name: "climbing is sport climbing", raw: "Climbing", expected: "Sport climbing" },
    { name: "field hockey is hockey", raw: "Field hockey", expected: "Hockey" },
    { name: "rugby is rugby sevens", raw: "Rugby", expected: "Rugby sevens" },
    { name: "aquatics spans several sports: unknown", raw: "Aquatics", expected: null },
    { name: "cycling spans several sports: unknown", raw: "Cycling", expected: null },
    { name: "the Games are not a sport", raw: "Olympic Games", expected: null },
    { name: "a sport off the programme", raw: "Padel", expected: null },
  ])("$name", ({ raw, expected }) => {
    expect(canonicalSport(raw)).toBe(expected);
  });
});

describe("sameSport: two sport names name the same sport", () => {
  it.each([
    { name: "spelled the same", a: "Judo", b: "Judo", expected: true },
    { name: "an alias and its canonical name", a: "Short track", b: "Short track speed skating", expected: true },
    { name: "different sports", a: "Swimming", b: "Diving", expected: false },
    { name: "two unknown names compare as written, ignoring case", a: "Olympic Games", b: "olympic games", expected: true },
    { name: "an unknown name never equals a sport", a: "Aquatics", b: "Swimming", expected: false },
  ])("$name", ({ a, b, expected }) => {
    expect(sameSport(a, b)).toBe(expected);
  });
});

describe("olympicCycleOf: which Olympic cycle a sport follows", () => {
  it.each([
    { sport: "Athletics", expected: "summer" },
    { sport: "Hockey", expected: "summer" },
    { sport: "Cycling BMX freestyle", expected: "summer" },
    { sport: "Breaking", expected: "summer" },
    { sport: "Speed skating", expected: "winter" },
    { sport: "Short track", expected: "winter" },
    { sport: "Short track speed skating", expected: "winter" },
    { sport: "Alpine skiing", expected: "winter" },
    { sport: "Snowboard", expected: "winter" },
    { sport: "Biathlon", expected: "winter" },
    { sport: "Ice hockey", expected: "winter" },
    { sport: "Ski mountaineering", expected: "winter" },
    { sport: "Figure skating", expected: "winter" },
    { sport: "Freeride", expected: "winter" },
    { sport: "Nordic combined", expected: "winter" },
    { sport: "Aquatics", expected: null },
    { sport: "Padel", expected: null },
  ])("$sport: $expected", ({ sport, expected }) => {
    expect(olympicCycleOf(sport)).toBe(expected);
  });
});

describe("SPORTS: the vocabulary", () => {
  it("holds every LA 2028 discipline Team Belgium lists and every French Alps 2030 sport", () => {
    const names = SPORTS.map((s) => s.name);
    for (const sport of ["Swimming", "Diving", "Artistic swimming", "Water polo", "Marathon swimming", "Cycling road", "Cycling track", "Equestrian eventing", "Coastal rowing", "Surfing", "Lacrosse", "Squash", "Cricket", "Flag football", "Freeride", "Short track speed skating"]) {
      expect(names).toContain(sport);
    }
  });
});
