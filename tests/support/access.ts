// A stand-in for Cloudflare Access in tests: an RSA signing key whose public
// half is served as the team's certs, and Access JWTs signed with it. A
// "stranger" key signs tokens Access never issued (same kid, other key).
import type { RecordedResponse } from "./outbound-fetch";

/** The Access settings of the deployed copy getDeployed() runs as. */
export const ACCESS_TEAM_DOMAIN = "bsh-test.cloudflareaccess.com";
export const ACCESS_AUD = "test-access-aud-tag";
const KID = "test-access-key";

type SigningKey = { privateKey: CryptoKey; jwk: JsonWebKey };
const keys = new Map<string, Promise<SigningKey>>();

function signingKey(which: "access" | "stranger"): Promise<SigningKey> {
  let key = keys.get(which);
  if (!key) {
    key = (async () => {
      const pair = (await crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["sign", "verify"],
      )) as CryptoKeyPair;
      const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
      return { privateKey: pair.privateKey, jwk };
    })();
    keys.set(which, key);
  }
  return key;
}

/** The team's certs endpoint answering with the Access key, as Cloudflare publishes it. */
export async function accessCerts(teamDomain = ACCESS_TEAM_DOMAIN): Promise<RecordedResponse> {
  const { jwk } = await signingKey("access");
  return {
    url: `https://${teamDomain}/cdn-cgi/access/certs`,
    contentType: "application/json",
    body: JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }], public_cert: { kid: KID, cert: "-----BEGIN CERTIFICATE-----…" } }),
  };
}

export type AccessClaims = { email: string; aud?: string | string[]; iss?: string; exp?: number; nbf?: number; iat?: number };

/** A Cf-Access-Jwt-Assertion for this email, valid for an hour from now unless the claims say otherwise. */
export async function accessJwt(claims: AccessClaims, { signedBy = "access" }: { signedBy?: "access" | "stranger" } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: [ACCESS_AUD], iss: `https://${ACCESS_TEAM_DOMAIN}`, iat: now, nbf: now, exp: now + 3600, type: "app", sub: "user-id", ...claims };
  const header = { alg: "RS256", kid: KID, typ: "JWT" };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const { privateKey } = await signingKey(signedBy);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

function base64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
