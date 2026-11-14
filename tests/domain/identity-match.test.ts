import { describe, expect, it } from "vitest";
import { identityMatch, type KnownIdentity } from "~/domain";

// Spec #20, story 4: identities are matched on an external ID first, then on
// name + date of birth, and otherwise go to the merge queue.
const roster: KnownIdentity[] = [
  {
    athleteId: "thiam",
    name: "Nafissatou Thiam",
    dateOfBirth: "1994-08-19",
    externalIds: [
      { scheme: "world-athletics", value: "14428253" },
      { scheme: "team-belgium", value: "Nafissatou-Thiam-347" },
    ],
  },
  { athleteId: "nafy", name: "Nafy Thiam", dateOfBirth: "2007-09-19", externalIds: [] },
  { athleteId: "swings", name: "Bart Swings", dateOfBirth: null, externalIds: [{ scheme: "isu", value: "692" }] },
  { athleteId: "desmet", name: "Hanne Desmet", dateOfBirth: "1996-10-26", externalIds: [] },
  { athleteId: "vanhoutte", name: "Fran Vanhoutte", dateOfBirth: null, externalIds: [] },
  { athleteId: "twin-a", name: "Jan Peeters", dateOfBirth: "2001-05-05", externalIds: [] },
  { athleteId: "twin-b", name: "Jan Peeters", dateOfBirth: "2001-05-05", externalIds: [] },
];

describe("identityMatch", () => {
  it.each([
    {
      name: "same external ID in the same scheme",
      incoming: { name: "THIAM Nafi", dateOfBirth: null, externalIds: [{ scheme: "world-athletics", value: "14428253" }] },
      expected: { kind: "external-id", athleteId: "thiam" },
    },
    {
      name: "an ISU skater ID remembered from an earlier run, even without a date of birth on the roster",
      incoming: { name: "Bart Swings", dateOfBirth: "1991-02-12", externalIds: [{ scheme: "isu", value: "692" }] },
      expected: { kind: "external-id", athleteId: "swings" },
    },
    {
      name: "the external ID wins over a different name + date of birth",
      incoming: {
        name: "Hanne Desmet",
        dateOfBirth: "1996-10-26",
        externalIds: [{ scheme: "team-belgium", value: "Nafissatou-Thiam-347" }],
      },
      expected: { kind: "external-id", athleteId: "thiam" },
    },
    {
      name: "same value in another scheme is not a match",
      incoming: { name: "Someone Else", dateOfBirth: null, externalIds: [{ scheme: "olympedia", value: "14428253" }] },
      expected: { kind: "queue" },
    },
    {
      name: "name + date of birth, ignoring case, accents and name order",
      incoming: { name: "DESMET Hanné", dateOfBirth: "1996-10-26", externalIds: [{ scheme: "isu", value: "1" }] },
      expected: { kind: "name-and-dob", athleteId: "desmet" },
    },
    {
      name: "same surname, different first name and date of birth",
      incoming: { name: "Nafy Thiam", dateOfBirth: "1994-08-19", externalIds: [] },
      expected: { kind: "queue" },
    },
    {
      name: "name alone is not enough without a date of birth",
      incoming: { name: "Hanne Desmet", dateOfBirth: null, externalIds: [] },
      expected: { kind: "queue" },
    },
    {
      name: "a roster Athlete without a date of birth cannot match by name",
      incoming: { name: "Fran Vanhoutte", dateOfBirth: "2003-05-24", externalIds: [] },
      expected: { kind: "queue" },
    },
    {
      name: "two Athletes with the same name and date of birth are ambiguous",
      incoming: { name: "Jan Peeters", dateOfBirth: "2001-05-05", externalIds: [] },
      expected: { kind: "queue" },
    },
  ])("$name", ({ incoming, expected }) => {
    expect(identityMatch(incoming, roster)).toEqual(expected);
  });
});
