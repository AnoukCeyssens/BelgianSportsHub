import { normaliseName } from "./identity-match";

/** Search by name: every word typed starts a word of the name (case and accents ignored). */
export function matchesNameSearch(name: string, query: string): boolean {
  const words = normaliseName(name).split(" ");
  const typed = normaliseName(query).split(" ").filter(Boolean);
  return typed.every((t) => words.some((w) => w.startsWith(t)));
}
