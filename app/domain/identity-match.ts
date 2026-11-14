// Spec #20, story 4: the same person is never split across sports or sources.
// Match on an external ID (same scheme, same value) first, then on normalised
// name + date of birth; anything else goes to the merge queue.

export type ExternalId = { scheme: string; value: string };

export type IncomingIdentity = {
  name: string;
  /** YYYY-MM-DD, when the source gives it. */
  dateOfBirth: string | null;
  externalIds: ExternalId[];
};

export type KnownIdentity = IncomingIdentity & { athleteId: string };

export type IdentityMatch =
  | { kind: "external-id"; athleteId: string }
  | { kind: "name-and-dob"; athleteId: string }
  | { kind: "queue" };

export function identityMatch(incoming: IncomingIdentity, roster: readonly KnownIdentity[]): IdentityMatch {
  const byExternalId = roster.find((known) =>
    known.externalIds.some((k) => incoming.externalIds.some((i) => i.scheme === k.scheme && i.value === k.value)),
  );
  if (byExternalId) return { kind: "external-id", athleteId: byExternalId.athleteId };

  if (!incoming.dateOfBirth) return { kind: "queue" };
  const key = nameKey(incoming.name);
  const candidates = roster.filter((known) => known.dateOfBirth === incoming.dateOfBirth && nameKey(known.name) === key);
  return candidates.length === 1 ? { kind: "name-and-dob", athleteId: candidates[0].athleteId } : { kind: "queue" };
}

/**
 * A name reduced for comparison and search: lower case, no accents, no
 * punctuation. "Hanné DESMET" → "hanne desmet".
 */
export function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Order-insensitive, so "DESMET Hanne" (IF style) equals "Hanne Desmet". */
function nameKey(name: string): string {
  return normaliseName(name).split(" ").sort().join(" ");
}
