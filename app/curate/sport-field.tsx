// The owner types sports in several forms (Games sport days, paste imports,
// Quota places, reference Games results, Sources). Each is stored by its
// canonical name (app/domain/sports.ts), and a name outside the vocabulary is
// refused rather than stored as typed.
import { canonicalSport, SPORTS } from "~/domain";

/** The canonical name of a typed sport; a 400 for anything else. */
export function typedSport(raw: string): string {
  const sport = canonicalSport(raw);
  if (sport === null) throw new Response(`Unknown sport "${raw}": use a sport of the Olympic programme, e.g. Athletics, Swimming, Cycling road`, { status: 400 });
  return sport;
}

export const SPORT_LIST_ID = "olympic-sports";

/** Suggestions for every sport input (`list={SPORT_LIST_ID}`). */
export function SportOptions() {
  return (
    <datalist id={SPORT_LIST_ID}>
      {SPORTS.map((s) => (
        <option key={s.name} value={s.name} />
      ))}
    </datalist>
  );
}
