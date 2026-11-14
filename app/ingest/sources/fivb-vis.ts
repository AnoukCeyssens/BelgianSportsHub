// The FIVB VIS web service (fivb.org/Vis2009/XmlRequest.asmx, documented at
// fivb.org/VisSDK/VisWebService; research/summer-sport-sources), shared by the
// volleyball and beach volleyball adapters. Public requests need no
// authentication; each is an XML <Request> element passed in the query string,
// so every request has a stable URL for its raw copy.
import type { Person } from "../source-adapter";

const ENDPOINT = "https://www.fivb.org/Vis2009/XmlRequest.asmx";

/** The GET URL for one VIS request, e.g. visUrl('<Request Type="GetBeachTournamentList" …/>'). */
export function visUrl(request: string): string {
  return `${ENDPOINT}?Request=${encodeURIComponent(request)}`;
}

/**
 * The attributes of every <tag …> element in a VIS response, in document
 * order. VIS answers are flat elements whose data is all in attributes
 * (a relation such as a registration's <Player> is a child element of the
 * same shape), so this is all the XML reading the adapters need.
 */
export function elements(xml: string, tag: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const [, attributes] of xml.matchAll(new RegExp(`<${tag}\\s([^>]*?)/?>`, "g"))) {
    const element: Record<string, string> = {};
    for (const [, name, value] of attributes.matchAll(/([\w:]+)="([^"]*)"/g)) element[name] = decodeEntities(value);
    found.push(element);
  }
  return found;
}

/** A VIS player as a Person; VIS player numbers are FIVB IDs across both disciplines. */
export function visPerson(p: { no: string; firstName: string; lastName: string; birthdate: string; federation: string }): Person {
  return {
    name: `${p.firstName} ${p.lastName}`.trim(),
    dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(p.birthdate) ? p.birthdate : null,
    nationality: p.federation,
    ifId: { scheme: "fivb", value: p.no },
  };
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()];
    return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  });
}
