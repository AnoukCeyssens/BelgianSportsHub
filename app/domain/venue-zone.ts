// Ticket #39. Sessions are stored as venue-local times plus the venue's IANA
// zone (spec #20, Data model), but some federations (World Athletics, World
// Archery) give only the host's IOC country code and city. This is the zone
// for the usual hosts of Championships; a country that spans several zones
// needs its city. Unknown → null: the timetable then waits for the owner.

/** IOC code → zone, for hosts in one zone. */
const COUNTRY_ZONE: Record<string, string> = {
  // Europe
  AUT: "Europe/Vienna",
  BEL: "Europe/Brussels",
  BIH: "Europe/Sarajevo",
  BLR: "Europe/Minsk",
  BUL: "Europe/Sofia",
  CRO: "Europe/Zagreb",
  CYP: "Asia/Nicosia",
  CZE: "Europe/Prague",
  DEN: "Europe/Copenhagen",
  ESP: "Europe/Madrid",
  EST: "Europe/Tallinn",
  FIN: "Europe/Helsinki",
  FRA: "Europe/Paris",
  GBR: "Europe/London",
  GER: "Europe/Berlin",
  GRE: "Europe/Athens",
  HUN: "Europe/Budapest",
  IRL: "Europe/Dublin",
  ISL: "Atlantic/Reykjavik",
  ITA: "Europe/Rome",
  LAT: "Europe/Riga",
  LTU: "Europe/Vilnius",
  LUX: "Europe/Luxembourg",
  MLT: "Europe/Malta",
  MNE: "Europe/Podgorica",
  MON: "Europe/Monaco",
  NED: "Europe/Amsterdam",
  NOR: "Europe/Oslo",
  POL: "Europe/Warsaw",
  POR: "Europe/Lisbon",
  ROU: "Europe/Bucharest",
  SLO: "Europe/Ljubljana",
  SMR: "Europe/San_Marino",
  SRB: "Europe/Belgrade",
  SUI: "Europe/Zurich",
  SVK: "Europe/Bratislava",
  SWE: "Europe/Stockholm",
  TUR: "Europe/Istanbul",
  UKR: "Europe/Kyiv",
  // Asia and Oceania
  BRN: "Asia/Bahrain",
  CHN: "Asia/Shanghai",
  HKG: "Asia/Hong_Kong",
  IND: "Asia/Kolkata",
  JPN: "Asia/Tokyo",
  KOR: "Asia/Seoul",
  KSA: "Asia/Riyadh",
  KUW: "Asia/Kuwait",
  MAS: "Asia/Kuala_Lumpur",
  NZL: "Pacific/Auckland",
  PHI: "Asia/Manila",
  QAT: "Asia/Qatar",
  SGP: "Asia/Singapore",
  THA: "Asia/Bangkok",
  TPE: "Asia/Taipei",
  UAE: "Asia/Dubai",
  UZB: "Asia/Tashkent",
  // Africa and the Americas
  ARG: "America/Argentina/Buenos_Aires",
  CHI: "America/Santiago",
  COL: "America/Bogota",
  EGY: "Africa/Cairo",
  JAM: "America/Jamaica",
  KEN: "Africa/Nairobi",
  MAR: "Africa/Casablanca",
  PER: "America/Lima",
  RSA: "Africa/Johannesburg",
};

/** Hosts in several zones: city → zone. */
const CITY_ZONE: Record<string, Record<string, string>> = {
  USA: {
    eugene: "America/Los_Angeles",
    "los angeles": "America/Los_Angeles",
    "san diego": "America/Los_Angeles",
    seattle: "America/Los_Angeles",
    "salt lake city": "America/Denver",
    "colorado springs": "America/Denver",
    milwaukee: "America/Chicago",
    "fort lauderdale": "America/New_York",
    indianapolis: "America/Indiana/Indianapolis",
    "new york": "America/New_York",
    "lake placid": "America/New_York",
    orlando: "America/New_York",
  },
  CAN: {
    calgary: "America/Edmonton",
    edmonton: "America/Edmonton",
    vancouver: "America/Vancouver",
    whistler: "America/Vancouver",
    montreal: "America/Toronto",
    "montréal": "America/Toronto",
    quebec: "America/Toronto",
    toronto: "America/Toronto",
    markham: "America/Toronto",
    windsor: "America/Toronto",
  },
  AUS: {
    "gold coast": "Australia/Brisbane",
    brisbane: "Australia/Brisbane",
    sydney: "Australia/Sydney",
    melbourne: "Australia/Melbourne",
    adelaide: "Australia/Adelaide",
    perth: "Australia/Perth",
  },
  MEX: { "mexico city": "America/Mexico_City", guadalajara: "America/Mexico_City", monterrey: "America/Monterrey", puebla: "America/Mexico_City", saltillo: "America/Monterrey" },
  BRA: { "rio de janeiro": "America/Sao_Paulo", "são paulo": "America/Sao_Paulo", "sao paulo": "America/Sao_Paulo" },
  KAZ: { astana: "Asia/Almaty", almaty: "Asia/Almaty" },
};

/** The IANA zone of a venue from its host's IOC code and city, or null when this table does not know it. */
export function venueZoneOf(country: string | null, city: string | null): string | null {
  if (!country) return null;
  const byCity = CITY_ZONE[country];
  if (byCity) return city ? (byCity[city.trim().toLowerCase()] ?? null) : null;
  return COUNTRY_ZONE[country] ?? null;
}
