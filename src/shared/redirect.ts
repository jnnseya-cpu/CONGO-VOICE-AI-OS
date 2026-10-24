/**
 * Where a redirect is allowed to send somebody.
 *
 * `/connexion?next=…` exists so that a worker who was sent to the sign-in page
 * lands back on the page they wanted. The value arrives in a query string,
 * which means an attacker chooses it: a link to
 * `https://<our host>/connexion?next=https://look-alike.example/` sends the
 * person to a site of their choosing *immediately after a successful sign-in*,
 * which is the moment a person is least likely to re-read the address bar.
 *
 * So the rule is a whitelist of shape, not a blacklist of hosts: one leading
 * slash, no second one (`//host` is protocol-relative and leaves the site), no
 * backslash (browsers normalise `\` to `/`), no control characters, no scheme.
 * Anything else becomes the fallback.
 *
 * It lives in shared because both halves need the same answer: the page that
 * renders the form must not hand a hostile value to the browser, and the form
 * must not trust what it was handed.
 */

/** A path this application may navigate to after sign-in, or the fallback. */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return fallback;
  // One leading slash and not a second: "//evil.example" is a URL, not a path.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // "/\evil.example" is normalised to "//evil.example" by browsers.
  if (value.includes("\\")) return fallback;
  // A control character can truncate or smuggle a header or a URL.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
