// GLOSSARY "Senior international performance": senior Championships, World
// Cups/circuits and the Olympic Games count; youth, junior and U23 events (YOG
// and EYOF included) do not. Only appearing in the official result counts
// (DNF and DSQ included, DNS not). Competition titles come from sources in
// Dutch, French or English, so the patterns cover all three.

export type Performance = {
  /** Competition title as the source publishes it. */
  competition: string;
  /** Place as published: a number, or DNF / DSQ / DNS. */
  place: string;
};

const NOT_SENIOR_INTERNATIONAL = [
  /\byouth\b|\bjeugd|\bjeunesse\b|\beyof\b|\bfoje\b/i, // YOG, EYOF
  /\bjunior|\bu\s?-?(1\d|2[0-3])\b|\bespoirs?\b|\bbelofte/i, // junior and U23 events
  /paralymp|deaflymp|special olympics/i, // not in this domain
  /\bworld games\b|\bwereldspelen\b|\bjeux mondiaux\b/i, // non-Olympic disciplines
  /universiade|university games|universitaires/i,
];

export function isSeniorInternationalPerformance(p: Performance): boolean {
  if (p.place.trim().toUpperCase() === "DNS") return false;
  return !NOT_SENIOR_INTERNATIONAL.some((pattern) => pattern.test(p.competition));
}
