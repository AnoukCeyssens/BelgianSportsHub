import { describe, expect, it } from "vitest";
import { isSeniorInternationalPerformance } from "~/domain";

// GLOSSARY "Senior international performance" and "Active": senior
// Championships, World Cups and the Games count; youth, junior and U23 events
// (YOG and EYOF included) do not; only appearing in the result counts, so DNS
// does not while DNF and DSQ do. Competition titles are as Team Belgium
// publishes them (Dutch, French or English).
describe("isSeniorInternationalPerformance", () => {
  it.each([
    { name: "Olympic Games (Dutch title)", competition: "Olympische Zomerspelen Parijs 2024", place: "1", expected: true },
    { name: "Winter Games", competition: "Olympische Winterspelen Milano Cortina 2026", place: "17", expected: true },
    { name: "senior European Championships", competition: "European Championships", place: "3", expected: true },
    { name: "World Cup circuit", competition: "ISU Short Track World Tour", place: "2", expected: true },
    { name: "DNF still counts as appearing in the result", competition: "World Championships", place: "DNF", expected: true },
    { name: "DSQ still counts", competition: "World Championships", place: "DSQ", expected: true },
    { name: "DNS does not count", competition: "Olympische Zomerspelen Rio 2016", place: "DNS", expected: false },
    { name: "U23 Championships", competition: "European Championships U23", place: "2", expected: false },
    { name: "junior Championships", competition: "European Junior Championships", place: "1", expected: false },
    { name: "EYOF (abbreviation)", competition: "2011 EYOF (S) Trabzon", place: "11", expected: false },
    { name: "EYOF (Dutch title)", competition: "Europees Jeugd Olympisch Zomerfestival Maribor 2023", place: "1", expected: false },
    { name: "Youth Olympic Games (Dutch title)", competition: "Jeugd Olympische Zomerspelen Dakar 2026", place: "1", expected: false },
    { name: "Youth Olympic Games (French title)", competition: "Jeux Olympiques de la Jeunesse d'été Dakar 2026", place: "3", expected: false },
    { name: "World Games are not on the Olympic programme", competition: "Wereldspelen Wroclaw 2017", place: "11", expected: false },
    { name: "Paralympic Games", competition: "Paralympische Spelen Parijs 2024", place: "1", expected: false },
    { name: "Universiade", competition: "Universiade Turijn 2025", place: "4", expected: false },
  ])("$name", ({ competition, place, expected }) => {
    expect(isSeniorInternationalPerformance({ competition, place })).toBe(expected);
  });
});
