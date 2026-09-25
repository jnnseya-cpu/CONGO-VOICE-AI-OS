/**
 * Phone numbers at rest.
 *
 * A phone number is the one identifier that connects a health record to a
 * household. It is also the field a service has to search on, which is why it
 * usually stays in the clear: you cannot look up what you cannot read.
 *
 * The way out is to store two things. The number itself is encrypted, so a
 * leaked dump or a read-only view of the table yields nothing. Beside it sits a
 * keyed digest — not reversible, identical for identical numbers — which is
 * what every lookup uses. That leaks equality and nothing else: an attacker
 * holding the table can tell that two rows share a number, but not what it is,
 * and cannot test a guess without the key.
 */
import "server-only";
import { blindIndex, decryptIfEncrypted, encryptValue } from "./crypto";

/** Digits only, with the country code kept, so the same number always digests the same way. */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "").replace(/^00/, "+");
  return digits.startsWith("+") ? digits : `+${digits.replace(/^\+/, "")}`;
}

/** What goes in the two columns for a given number. */
export function phoneColumns(phone: string | null | undefined): { phone: string | null; phoneIndex: string | null } {
  if (!phone || !phone.trim()) return { phone: null, phoneIndex: null };
  const normalised = normalisePhone(phone);
  return { phone: encryptValue(normalised, "phone"), phoneIndex: blindIndex(normalised, "phone") };
}

/** The value to match on when looking an account up. */
export function phoneLookup(phone: string): string {
  return blindIndex(normalisePhone(phone), "phone");
}

/**
 * Reads a stored number back. Rows written before encryption was introduced
 * hold plain text and are returned as they are, so a deployment upgrades
 * without a migration window.
 */
export function readPhone(stored: string | null | undefined): string | null {
  return decryptIfEncrypted(stored, "phone");
}

/** For display and for logs: the last four digits are enough to recognise your own number. */
export function maskStoredPhone(stored: string | null | undefined): string | null {
  const plain = readPhone(stored);
  if (!plain) return null;
  return plain.length <= 4 ? plain : `…${plain.slice(-4)}`;
}
