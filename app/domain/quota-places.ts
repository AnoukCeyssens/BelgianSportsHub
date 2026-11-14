// GLOSSARY "Quota place"; ADR 0002; spec #20, stories 78–81, 85, 86; ticket #36.
//
// A Quota place is one place for Belgium in one event at one Olympic Games.
// It is a separate fact from any Entry's Qualification status (ADR 0002):
// either NOC-owned (Belgium decides who fills it; linked to an Entry at
// Selection) or named (linked to the Entry that earned it). Championships
// have no Quota places.
import type { QualificationStatus } from "./qualification";

export const QUOTA_PLACE_STATES = ["provisional", "allocated", "accepted", "entered", "declined", "lost"] as const;

export type QuotaPlaceState = (typeof QUOTA_PLACE_STATES)[number];

export const QUOTA_PLACE_STATE_LABELS: Record<QuotaPlaceState, string> = {
  provisional: "Provisional",
  allocated: "Allocated",
  accepted: "Accepted",
  entered: "Entered",
  declined: "Declined",
  lost: "Lost",
};

/** "noc": NOC-owned, Belgium decides who fills it; "named": named to the Entry that earned it. */
export type QuotaPlaceKind = "noc" | "named";

export const QUOTA_PLACE_KIND_LABELS: Record<QuotaPlaceKind, string> = { noc: "NOC-owned", named: "Named" };

/**
 * What happens to a place:
 * - `hold`: a new place held on today's list or ranking (Provisional);
 * - `allocate`: the federation confirms it, or a new place won outright (Allocated);
 * - `reallocate`: a new place gained through reallocation (starts Allocated);
 * - `accept`: Belgium confirms it will use it;
 * - `enter`: a selected Entry fills it at the entries deadline;
 * - `decline`: Belgium turns it down or gives it back;
 * - `lose`: it drops off the list, is taken away, or goes unfilled.
 */
export const QUOTA_PLACE_EVENTS = ["hold", "allocate", "reallocate", "accept", "enter", "decline", "lose"] as const;

export type QuotaPlaceEvent = (typeof QUOTA_PLACE_EVENTS)[number];

/** The events that start a new place. */
export const NEW_QUOTA_PLACE_EVENTS = ["hold", "allocate", "reallocate"] as const satisfies readonly QuotaPlaceEvent[];

export function isQuotaPlaceState(value: unknown): value is QuotaPlaceState {
  return typeof value === "string" && (QUOTA_PLACE_STATES as readonly string[]).includes(value);
}

export function isQuotaPlaceEvent(value: unknown): value is QuotaPlaceEvent {
  return typeof value === "string" && (QUOTA_PLACE_EVENTS as readonly string[]).includes(value);
}

/** Declined, Lost and Entered places no longer move. */
export function quotaPlaceEnded(state: QuotaPlaceState): boolean {
  return state === "entered" || state === "declined" || state === "lost";
}

/**
 * Whether a place can be linked to an Entry with this Qualification status
 * (story 81): a named place to the Entry that earned it, when earned; an
 * NOC-owned place only at Selection, so Eligible Entries chasing it never
 * hold it.
 */
export function quotaPlaceLinkable(kind: QuotaPlaceKind, status: QualificationStatus | null): boolean {
  return kind === "named" || status === "selected";
}

export type QuotaPlaceNow ={ state: QuotaPlaceState; kind: QuotaPlaceKind; linked: boolean };

export type QuotaPlaceMove = { ok: true; state: QuotaPlaceState } | { ok: false; reason: string };

const FROM: Record<Exclude<QuotaPlaceEvent, "hold" | "reallocate">, { from: readonly QuotaPlaceState[]; to: QuotaPlaceState }> = {
  allocate: { from: ["provisional"], to: "allocated" },
  accept: { from: ["allocated"], to: "accepted" },
  enter: { from: ["accepted"], to: "entered" },
  decline: { from: ["allocated", "accepted"], to: "declined" },
  lose: { from: ["provisional", "allocated", "accepted"], to: "lost" },
};

/**
 * The only legal lifecycle moves (stories 78, 79): Provisional → Allocated →
 * Accepted → Entered, or ending Declined (Belgium held it) / Lost. `place` is
 * null for a place not recorded yet: it starts Provisional (`hold`) or
 * Allocated (`allocate`, `reallocate`). Entered needs the place linked to its
 * Entry (a named place always is; an NOC-owned one is linked at Selection).
 */
export function quotaPlaceTransition(place: QuotaPlaceNow | null, event: QuotaPlaceEvent): QuotaPlaceMove {
  if (place === null) {
    if (event === "hold") return { ok: true, state: "provisional" };
    if (event === "allocate" || event === "reallocate") return { ok: true, state: "allocated" };
    return { ok: false, reason: "Record the place first: held (Provisional), allocated or reallocated" };
  }
  if (event === "hold" || event === "reallocate") return { ok: false, reason: "Only a new place can be held or reallocated" };
  if (quotaPlaceEnded(place.state)) return { ok: false, reason: `${QUOTA_PLACE_STATE_LABELS[place.state]} is final` };
  const move = FROM[event];
  if (!move.from.includes(place.state)) {
    return { ok: false, reason: `A ${QUOTA_PLACE_STATE_LABELS[place.state]} place cannot become ${QUOTA_PLACE_STATE_LABELS[move.to]}` };
  }
  if (event === "enter" && !place.linked) return { ok: false, reason: "Link the place to its selected Entry before it is Entered" };
  return { ok: true, state: move.to };
}
