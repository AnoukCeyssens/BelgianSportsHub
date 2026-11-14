// Owner-only curation (spec #20, stories 98 and 115). Cloudflare Access sits
// in front of the whole app (an email allowlist for the small circle) and puts
// a signed JWT (Cf-Access-Jwt-Assertion) on every request it lets through.
// Every route under /curate is refused unless that JWT verifies against the
// team's published certs (signature, the application's AUD tag, the team as
// issuer, not expired) and its email is the owner's (OWNER_EMAIL). The bare
// email header is never trusted on a deployed copy: anything that reaches the
// Worker without passing Access (another route, a misconfigured application)
// could set it. Deployed copies fail closed: no JWT, a bad one, missing
// ACCESS_TEAM_DOMAIN / ACCESS_AUD, or certs that cannot be fetched → not the
// owner. The local dev copy has no Access in front of it: there the email
// header (sent by tests) is taken as is, and a request without one counts as
// the owner's.
import { isCurationPath } from "~/domain";
import { now } from "~/clock";

const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
/** How long the team's certs are kept in this isolate; Access rotates its keys every six weeks, keeping the old one valid for a week. */
const CERTS_TTL_MS = 10 * 60_000;

type OwnerEnv = Pick<Env, "APP_ENV" | "OWNER_EMAIL" | "ACCESS_TEAM_DOMAIN" | "ACCESS_AUD">;

/** A 403 response when the request is for curation and does not come from the owner; null otherwise. */
export async function refuseNonOwnerCuration(request: Request, env: OwnerEnv): Promise<Response | null> {
  if (!isCurationPath(new URL(request.url).pathname)) return null;
  if (await isOwner(request, env)) return null;
  return new Response("Curation is for the owner only.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Whether the request comes from the owner (e.g. to offer a reader page's curation link). */
export async function isOwner(request: Request, env: OwnerEnv): Promise<boolean> {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  if (env.APP_ENV === "dev") {
    const email = request.headers.get(ACCESS_EMAIL_HEADER)?.trim().toLowerCase();
    return email ? email === owner : true;
  }
  const email = await verifiedAccessEmail(request.headers.get(ACCESS_JWT_HEADER), env);
  return email === owner;
}

type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };

/** The email of a Cloudflare Access JWT that verifies for this copy's application; null for anything else. */
async function verifiedAccessEmail(token: string | null, env: OwnerEnv): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const aud = env.ACCESS_AUD?.trim();
  if (!token || !team || !aud) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJson<JwtHeader>(parts[0]);
    const claims = decodeJson<JwtClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;

    const key = (await teamCerts(team)).get(header.kid);
    if (!key) return null;
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64urlBytes(parts[2]), signed))) return null;

    const seconds = Math.floor(now().getTime() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud)) return null;
    if (claims.iss !== `https://${team}`) return null;
    if (typeof claims.exp !== "number" || claims.exp <= seconds) return null;
    if (typeof claims.nbf === "number" && claims.nbf > seconds) return null;
    return claims.email?.trim().toLowerCase() || null;
  } catch {
    // Malformed token, unreachable certs, a key WebCrypto refuses: not the owner.
    return null;
  }
}

const certsCache = new Map<string, { keys: Map<string, CryptoKey>; fetchedAt: number }>();

/** The team's signing keys by kid, from https://<team>/cdn-cgi/access/certs (kept briefly per isolate). */
async function teamCerts(team: string): Promise<Map<string, CryptoKey>> {
  const cached = certsCache.get(team);
  const at = now().getTime();
  if (cached && at - cached.fetchedAt < CERTS_TTL_MS) return cached.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "RSA") continue;
    keys.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  certsCache.set(team, { keys, fetchedAt: at });
  return keys;
}

function decodeJson<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64urlBytes(part))) as T;
}

function base64urlBytes(part: string): Uint8Array<ArrayBuffer> {
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
