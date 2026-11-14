// Owner-only curation (spec #20, stories 98 and 115). Cloudflare Access sits
// in front of the whole app (an email allowlist for the small circle) and puts
// the signed-in email on every request it lets through. Every route under
// /curate is refused unless that email is the owner's (OWNER_EMAIL). The local
// dev copy has no Access in front of it, so there a request without an Access
// identity counts as the owner's; the deployed copies fail closed.
import { isCurationPath } from "~/domain";

const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";

/** A 403 response when the request is for curation and does not come from the owner; null otherwise. */
export function refuseNonOwnerCuration(request: Request, env: Pick<Env, "APP_ENV" | "OWNER_EMAIL">): Response | null {
  if (!isCurationPath(new URL(request.url).pathname)) return null;
  if (isOwner(request, env)) return null;
  return new Response("Curation is for the owner only.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Whether the request comes from the owner (e.g. to offer a reader page's curation link). */
export function isOwner(request: Request, env: Pick<Env, "APP_ENV" | "OWNER_EMAIL">) {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  const email = request.headers.get(ACCESS_EMAIL_HEADER)?.trim().toLowerCase();
  if (!email) return env.APP_ENV === "dev";
  return email === owner;
}
