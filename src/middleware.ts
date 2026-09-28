import { NextResponse, type NextRequest } from "next/server";

/**
 * One address for the service.
 *
 * congovoicecd.com and www.congovoicecd.com are different hosts, and both were
 * serving the whole application with nothing pointing at the other. Three things
 * follow from that, none of them visible until somebody hits them:
 *
 *  - The session cookie is set without a domain, so it belongs to whichever host
 *    issued it. Sign in on www, follow a link to the apex, and you are silently
 *    signed out; sign in again there and you are signed out on the way back.
 *  - NEXT_PUBLIC_SITE_URL names one host, so canonical tags, the sitemap and
 *    share images name it too — for everyone, including the people on the other
 *    host.
 *  - A search engine sees two complete copies of a national health service.
 *
 * So the alias is redirected to the canonical host, permanently, keeping the path
 * and the query.
 *
 * What is deliberately never redirected, because redirecting it breaks things
 * that are hard to see failing:
 *
 *  - The readiness and health probes. Cloud Run calls them on the container's own
 *    address, not through the load balancer. A redirect there is a failed
 *    startup probe and a revision that never serves — which is a worse outage
 *    than the one this fixes.
 *  - Telephony and messaging webhooks. Their signatures are computed over the
 *    exact URL the provider was given, so moving them to another host invalidates
 *    the signature and the call is refused.
 *  - Any host that is not the specific alias of the canonical one: the Cloud Run
 *    *.run.app address, localhost, an internal probe, a health checker. Matching
 *    the alias exactly rather than "anything unexpected" is what keeps this from
 *    catching traffic it was never meant to see.
 */

/** The host this service calls itself, from the origin baked in at build time. */
function canonicalHost(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).host.toLowerCase();
  } catch {
    return null;
  }
}

/** The one other spelling of the same site: apex ↔ www. */
export function aliasOf(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : `www.${host}`;
}

const NEVER_REDIRECT = [
  "/api/v1/system/ready",
  "/api/v1/system/health",
  "/api/hooks/",
];

export function middleware(req: NextRequest) {
  const canonical = canonicalHost();
  if (!canonical) return NextResponse.next();

  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (!host || host === canonical) return NextResponse.next();
  if (host !== aliasOf(canonical)) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (NEVER_REDIRECT.some((p) => path === p || path.startsWith(p))) return NextResponse.next();

  const target = new URL(req.nextUrl.toString());
  target.host = canonical;
  target.port = "";
  target.protocol = "https:";
  // 308 rather than 301: a POST keeps its method and body, so a citizen who
  // submitted a question on the wrong spelling of the address does not lose it.
  return NextResponse.redirect(target, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
