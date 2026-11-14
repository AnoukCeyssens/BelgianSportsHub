import { describe, expect, it } from "vitest";
import { accessCerts, accessJwt } from "../support/access";
import { getDeployed } from "../support/worker";

// Spec #20, stories 98 and 115; #20 review, finding M. On a deployed copy the
// owner gate trusts only a Cloudflare Access JWT it has verified against the
// team's certs (signature, audience, issuer, expiry), never a bare email header.
const CURATION = "/curate/run/source-health";
const OWNER = "owner@example.com";
const jwt = (token: string): RequestInit => ({ headers: { "Cf-Access-Jwt-Assertion": token } });
const hourAgo = () => Math.floor(Date.now() / 1000) - 3600;

describe("Owner gate on a deployed copy", () => {
  it("lets the owner in with a valid Access JWT, whatever the case of the email", async () => {
    expect((await getDeployed(CURATION, jwt(await accessJwt({ email: "Owner@Example.com" })))).status).toBe(200);
  });

  it.each([
    { name: "no Access JWT at all", init: async () => ({}) },
    { name: "only the email header, no JWT", init: async () => ({ headers: { "Cf-Access-Authenticated-User-Email": OWNER, "Cf-Access-Jwt-Assertion": "" } }) },
    { name: "a JWT for someone else", init: async () => jwt(await accessJwt({ email: "friend@example.com" })) },
    { name: "a JWT for another Access application", init: async () => jwt(await accessJwt({ email: OWNER, aud: ["another-app-aud"] })) },
    { name: "a JWT from another team", init: async () => jwt(await accessJwt({ email: OWNER, iss: "https://elsewhere.cloudflareaccess.com" })) },
    { name: "a JWT that expired", init: async () => jwt(await accessJwt({ email: OWNER, exp: hourAgo() })) },
    { name: "a JWT not valid yet", init: async () => jwt(await accessJwt({ email: OWNER, nbf: hourAgo() + 7200 })) },
    { name: "a JWT signed by a key Access never published", init: async () => jwt(await accessJwt({ email: OWNER }, { signedBy: "stranger" })) },
    { name: "a JWT whose payload was altered", init: async () => jwt(tampered(await accessJwt({ email: "friend@example.com" }))) },
    { name: "garbage", init: async () => jwt("not.a.jwt") },
  ])("refuses curation with $name", async ({ init }) => {
    expect((await getDeployed(CURATION, await init())).status).toBe(403);
  });

  it("fails closed when the copy's Access settings are missing", async () => {
    const token = jwt(await accessJwt({ email: OWNER }));
    expect((await getDeployed(CURATION, token, { vars: { ACCESS_AUD: "" } })).status).toBe(403);
    expect((await getDeployed(CURATION, token, { vars: { ACCESS_TEAM_DOMAIN: "" } })).status).toBe(403);
  });

  it("fails closed when the team's certs cannot be fetched", async () => {
    const team = "unreachable.cloudflareaccess.com";
    const token = jwt(await accessJwt({ email: OWNER, iss: `https://${team}` }));
    const down = { ...(await accessCerts(team)), status: 503, body: "Service Unavailable" };

    expect((await getDeployed(CURATION, token, { vars: { ACCESS_TEAM_DOMAIN: team }, certs: [down] })).status).toBe(403);
  });
});

/** The same signature over a payload naming the owner instead. */
function tampered(token: string) {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  const forged = btoa(JSON.stringify({ ...claims, email: OWNER })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [header, forged, signature].join(".");
}
