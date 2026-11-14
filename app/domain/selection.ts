// Spec #20, stories 46, 81, 85 and 108; ticket #34; GLOSSARY "Selection".
// A Selection is the selector's final list for a competition: the national
// federation for a Championship, the Belgian Olympic Committee for the Games.
// The owner enters it from a press release (names found in the pasted text
// pre-ticked, the other candidates Not selected); the IF entry list replaces
// it when published.
import { normaliseName } from "./identity-match";
import { belgianDate } from "./monthly-checklist";
import { sameEvent } from "./timetable";

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

/** An Athlete the IF entry list names, with the events it names them in (null when the list names no events). */
export type ListedEntrant = { athleteId: string; events: readonly string[] | null };

/** A competition's Entry as the entry list rule sees it: an Athlete, or a Team with its members (Athlete ids). */
export type EntryListEntry = {
  id: string;
  event: string;
  athleteId: string | null;
  teamId: string | null;
  /** A Team's members: a partnership's pair, or everyone a roster of Belgium's Team has credited. */
  members: readonly string[];
  partnership: boolean;
};

/**
 * What a published IF entry list makes of a competition's Entries (GLOSSARY
 * "Selection"; ADR 0001). Only what the list says is decided; the rest is
 * left as it is:
 * - an Athlete Entry: on the list in its event → Selected; on the list in
 *   other events only, or not on it → Not selected. A list that names no
 *   events selects an Athlete's Entry only when it is their one Entry at the
 *   competition (it cannot tell which of several it means);
 * - a partnership: Selected when the list names every member (in its event,
 *   where the list names events); Belgium's Team in an event: Selected when
 *   the list names a member in that event. A Team the list does not name is
 *   Not selected only when another Team in its event is named (the place
 *   passed to a new partnership), and otherwise left alone.
 */
export function entryListSelection(
  entries: readonly EntryListEntry[],
  listed: readonly ListedEntrant[],
): { id: string; status: "selected" | "not-selected" }[] {
  const byAthlete = new Map(listed.map((l) => [l.athleteId, l]));
  const namedIn = (athleteId: string, event: string) => {
    const l = byAthlete.get(athleteId);
    return l !== undefined && (l.events === null || l.events.some((e) => sameEvent(e, event)));
  };
  const teamNamed = (e: EntryListEntry) => {
    if (e.members.length === 0) return false;
    if (e.partnership) return e.members.every((m) => namedIn(m, e.event));
    return e.members.some((m) => byAthlete.get(m)?.events?.some((x) => sameEvent(x, e.event)) ?? false);
  };
  const named = new Set(entries.filter((e) => e.teamId !== null && teamNamed(e)).map((e) => e.id));

  return entries.flatMap((e) => {
    if (e.athleteId !== null) {
      const l = byAthlete.get(e.athleteId);
      if (l === undefined) return [{ id: e.id, status: "not-selected" as const }];
      if (l.events === null) {
        const own = entries.filter((x) => x.athleteId === e.athleteId);
        return own.length === 1 ? [{ id: e.id, status: "selected" as const }] : [];
      }
      return [{ id: e.id, status: l.events.some((x) => sameEvent(x, e.event)) ? ("selected" as const) : ("not-selected" as const) }];
    }
    if (named.has(e.id)) return [{ id: e.id, status: "selected" as const }];
    const rival = entries.some((x) => x.id !== e.id && x.teamId !== null && named.has(x.id) && sameEvent(x.event, e.event));
    return rival ? [{ id: e.id, status: "not-selected" as const }] : [];
  });
}
