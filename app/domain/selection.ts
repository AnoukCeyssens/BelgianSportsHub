// Spec #20, stories 46, 81, 85 and 108; ticket #34; GLOSSARY "Selection".
// A Selection is the selector's final list for a competition: the national
// federation for a Championship, the Belgian Olympic Committee for the Games.
// The owner enters it from a press release (names found in the pasted text
// pre-ticked, the other candidates Not selected); the IF entry list replaces
// it when published.
import { normaliseName } from "./identity-match";
import { belgianDate } from "./monthly-checklist";

export const BOIC = "Belgian Olympic Committee";

/** Who selects: the BOIC for the Games; for a Championship the national federation, which the owner names (null). */
export function selectorFor(kind: string): string | null {
  return kind === "games" ? BOIC : null;
}

/** A candidate Entry and the names it goes by (an Athlete's name; a Team's name and each member's). */
export type SelectionCandidate = { id: string; names: readonly string[] };

/**
 * The ids of the candidates the text names, in candidate order. A name counts
 * as whole words in either order ("Lucas Verbeke", "VERBEKE Lucas"), case and
 * accents ignored. A Team is found by its own name, or when every member is
 * named (a partnership "A / B" = its members A and B).
 */
export function namesFoundIn(text: string, candidates: readonly SelectionCandidate[]): string[] {
  const haystack = ` ${normaliseName(text)} `;
  const named = (name: string) => orders(normaliseName(name)).some((n) => n !== "" && haystack.includes(` ${n} `));
  return candidates
    .filter((c) => {
      const [own, ...members] = c.names;
      return (own !== undefined && named(own)) || (members.length > 0 && members.every(named));
    })
    .map((c) => c.id);
}

/** A name in each rotation of its words: "lucas verbeke" and "verbeke lucas"; "niels van zandweghe" also as "van zandweghe niels". */
function orders(name: string): string[] {
  const words = name.split(" ");
  return words.map((_, i) => [...words.slice(i), ...words.slice(0, i)].join(" "));
}

/** How soon before a competition its Selection is expected. */
export const SELECTION_LOOKAHEAD_WEEKS = 8;

/**
 * Whether a competition's Selection belongs in this week's Selections & likely
 * step: it starts within eight weeks, or its qualification window has closed.
 */
export function selectionDue(c: { startDate: string; qualificationClosesOn: string | null }, now: Date): boolean {
  const today = belgianDate(now);
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + SELECTION_LOOKAHEAD_WEEKS * 7 * 86_400_000).toISOString().slice(0, 10);
  return c.startDate <= horizon || (c.qualificationClosesOn !== null && c.qualificationClosesOn <= today);
}

/**
 * What a published IF entry list makes of a competition's Entries: an
 * Athlete on it Selected, one left off it Not selected. The list names
 * Athletes, so Team Entries are left as they are.
 */
export function entryListSelection(
  entries: readonly { id: string; athleteId: string | null }[],
  listed: ReadonlySet<string>,
): { id: string; status: "selected" | "not-selected" }[] {
  return entries.flatMap((e) => (e.athleteId === null ? [] : [{ id: e.id, status: listed.has(e.athleteId) ? ("selected" as const) : ("not-selected" as const) }]));
}
