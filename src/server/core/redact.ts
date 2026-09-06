/**
 * PII scrubber — every log line that may carry citizen data goes through here first.
 *
 * The platform records personal data in the database (that is the point of a case file),
 * but nothing personal may ever reach stdout, a log aggregator or an error tracker.
 * Deterministic regular expressions only: no model call, no network, works offline.
 */

/** DRC and international phone numbers, including local 0-prefixed and spaced forms. */
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g;
/**
 * A DRC subscriber number is nine digits (twelve with the country code). Requiring nine
 * keeps eight-character case references and short identifiers out of the phone rule.
 */
const MIN_PHONE_DIGITS = 9;
/** Anything that looks like an e-mail address. */
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** National identity / voter card style tokens. */
const ID_TOKEN = /\b[A-Z]{2,3}\d{6,12}\b/g;
/** UUIDs are pseudonymous but still identifiers: keep the first block only. */
const UUID = /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Titles that introduce a person's name in French free text. Names themselves cannot be
 * detected reliably, so we redact the capitalised run that follows a naming cue.
 */
const NAME_CUE =
  /\b(?:M\.|Mme|Mlle|Dr|Docteur|Monsieur|Madame|Mademoiselle|Papa|Maman|Mama|Tata|patient(?:e)?|enfant|apprenant(?:e)?|élève|nommé(?:e)?|s'appelle|je m'appelle|mon nom est)\s+((?:[A-ZÀ-Þ][\p{L}'’-]+(?:\s+|$)){1,3})/gu;

export const REDACTED = "[redacted]";

/** Replace phone numbers, e-mails, identity tokens and cued names in a free-text string. */
export function redactText(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(EMAIL, "[email]");
  out = out.replace(NAME_CUE, (match, name: string) => match.slice(0, match.length - name.length) + "[nom]");
  out = out.replace(ID_TOKEN, "[id]");
  out = out.replace(UUID, (_m, head: string) => `${head}…`);
  out = out.replace(PHONE, (match, offset: number, whole: string) => {
    if (countDigits(match) < MIN_PHONE_DIGITS) return match;
    // Never swallow part of a longer alphanumeric token (a case reference, a hash).
    if (isWordChar(whole[offset - 1]) || isWordChar(whole[offset + match.length])) return match;
    return "[tel]";
  });
  return out;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

function countDigits(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= "0" && ch <= "9") n++;
  return n;
}

/** Keys whose value is always personal data, whatever it looks like. */
const SENSITIVE_KEYS = new Set([
  "phone",
  "msisdn",
  "to",
  "name",
  "fullname",
  "email",
  "pin",
  "pinhash",
  "mfasecret",
  "secret",
  "token",
  "password",
  "authorization",
  "transcript",
  "originalinput",
  "valuehash",
  "address",
]);

/** Recursively redact an arbitrary value (objects, arrays, strings). Depth-limited. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 6) return "[deep]" as unknown as T;
  if (typeof value === "string") return redactText(value) as unknown as T;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1)) as unknown as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : redact(v, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

/** Console helpers used by the operations modules instead of raw `console.*`. */
export const safeLog = {
  info: (scope: string, ...parts: unknown[]) => console.info(`[${scope}]`, ...parts.map((p) => fmt(p))),
  warn: (scope: string, ...parts: unknown[]) => console.warn(`[${scope}]`, ...parts.map((p) => fmt(p))),
  error: (scope: string, ...parts: unknown[]) => console.error(`[${scope}]`, ...parts.map((p) => fmt(p))),
};

function fmt(p: unknown): unknown {
  if (p instanceof Error) return redactText(p.message);
  if (typeof p === "string") return redactText(p);
  return redact(p);
}

/** Keep only the last 3 digits of a phone number, for operational traceability. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 3 ? "***" : `***${digits.slice(-3)}`;
}
