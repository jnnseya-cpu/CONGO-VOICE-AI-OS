/**
 * Linking a second way of reaching the same citizen (FR-CH-40, SEC-04).
 *
 * Phones are shared inside a household and recycled between households. If
 * adding an identifier to an account only took the word of whoever is holding
 * the handset, the next owner of a recycled number would inherit someone
 * else's health history. So the proof is possession: a short code is sent to
 * the identifier being claimed, and only someone who can receive it can
 * complete the link.
 *
 * The code is spoken by default rather than texted, because the citizens this
 * is for are on feature phones and some cannot read.
 */
import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { hashPin, verifyPin } from "./auth";
import { audit } from "./audit";
import { notify } from "./notifications";
import type { LanguageCode } from "@server/db/schema";

/** How long a code is good for. Long enough to answer a call, short enough to be useless later. */
export const CLAIM_TTL_MS = 10 * 60 * 1000;

/** Wrong codes allowed before the claim is void and a new one must be requested. */
export const MAX_CLAIM_ATTEMPTS = 3;

export type IdentifierKind = "msisdn" | "whatsapp" | "pwa_account" | "ivr_caller";

const SPOKEN_CODE: Record<LanguageCode, (code: string) => string> = {
  fr: (c) => `Votre code de confirmation CONGO VOICE AI OS est le ${c.split("").join(" ")}. Il est valable dix minutes.`,
  ln: (c) => `Code na yo ya kondimisa CONGO VOICE AI OS ezali ${c.split("").join(" ")}. Ezali malamu miniti zomi.`,
  kg: (c) => `Kodi na nge ya kundimisa CONGO VOICE AI OS kele ${c.split("").join(" ")}. Yo ke sala minuti kumi.`,
  sw: (c) => `Nambari yako ya uthibitisho CONGO VOICE AI OS ni ${c.split("").join(" ")}. Inafaa kwa dakika kumi.`,
  lua: (c) => `Nomba webe wa kujadika CONGO VOICE AI OS ndi ${c.split("").join(" ")}. Udi ne mushindu wa minite dikumi.`,
};

export interface ClaimRequest {
  userId: string;
  kind: IdentifierKind;
  /** The identifier being claimed, as the citizen gave it. */
  value: string;
  /** Keyed digest of the identifier, computed by the channel layer. */
  valueHash: string;
  /** Where to send the code. Absent for identifiers that cannot receive one. */
  destination?: string | null;
  language?: LanguageCode;
  deliveredBy?: "voice" | "sms";
  actorUserId?: string | null;
  ip?: string | null;
}

export interface ClaimIssued {
  claimId: string;
  expiresAt: string;
  deliveredBy: "voice" | "sms";
  /** Returned only outside production, so a developer can complete the flow. */
  code?: string;
}

/** Issues a code and sends it to the identifier being claimed. */
export async function requestIdentifierClaim(input: ClaimRequest): Promise<ClaimIssued> {
  const db = await getDb();

  // Already linked to this account: nothing to prove.
  const [existing] = await db
    .select()
    .from(schema.citizenIdentifiers)
    .where(and(eq(schema.citizenIdentifiers.userId, input.userId), eq(schema.citizenIdentifiers.valueHash, input.valueHash)));
  if (existing) throw new Error("identifier_already_linked");

  // Linked to somebody else: a merge, which a citizen may not do alone.
  const [elsewhere] = await db.select().from(schema.citizenIdentifiers).where(eq(schema.citizenIdentifiers.valueHash, input.valueHash));
  if (elsewhere && elsewhere.userId !== input.userId) throw new Error("identifier_claimed_by_another_account");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const deliveredBy = input.deliveredBy ?? "voice";
  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);

  const [claim] = await db
    .insert(schema.identifierClaims)
    .values({
      userId: input.userId,
      kind: input.kind,
      valueHash: input.valueHash,
      valueLast4: input.value.replace(/\D/g, "").slice(-4) || null,
      // Hashed with the same work factor as a PIN: a leaked table of live codes
      // would otherwise be a table of live keys.
      codeHash: hashPin(code),
      deliveredBy,
      expiresAt,
    })
    .returning();

  if (input.destination) {
    const language = input.language ?? "fr";
    await notify({
      userId: input.userId,
      to: input.destination,
      channel: deliveredBy === "voice" ? "sms" : "sms",
      type: "reminder",
      title: "Code de confirmation",
      body: SPOKEN_CODE[language](code),
      // A confirmation code is useless after ten minutes; it must not sit in a queue.
      emergency: false,
    });
  }

  await audit({
    action: "identifier.claim_requested",
    actorUserId: input.actorUserId ?? input.userId,
    entityType: "identifier_claim",
    entityId: claim.id,
    after: { kind: input.kind, last4: claim.valueLast4, deliveredBy },
    ip: input.ip ?? null,
  });

  return {
    claimId: claim.id,
    expiresAt: expiresAt.toISOString(),
    deliveredBy,
    ...(process.env.NODE_ENV === "production" ? {} : { code }),
  };
}

export type ClaimOutcome = "linked" | "wrong_code" | "expired" | "too_many_attempts" | "unknown_claim";

export interface ClaimResult {
  outcome: ClaimOutcome;
  attemptsRemaining: number;
}

/** Completes the link when the code matches, and refuses in every other case. */
export async function confirmIdentifierClaim(input: { claimId: string; code: string; actorUserId?: string | null; ip?: string | null }): Promise<ClaimResult> {
  const db = await getDb();
  const [claim] = await db.select().from(schema.identifierClaims).where(eq(schema.identifierClaims.id, input.claimId));
  if (!claim || claim.consumedAt) return { outcome: "unknown_claim", attemptsRemaining: 0 };
  if (claim.expiresAt.getTime() < Date.now()) return { outcome: "expired", attemptsRemaining: 0 };
  if (claim.attempts >= MAX_CLAIM_ATTEMPTS) return { outcome: "too_many_attempts", attemptsRemaining: 0 };

  if (!verifyPin(input.code, claim.codeHash)) {
    const attempts = claim.attempts + 1;
    await db.update(schema.identifierClaims).set({ attempts }).where(eq(schema.identifierClaims.id, claim.id));
    await audit({
      action: "identifier.claim_failed",
      actorUserId: input.actorUserId ?? claim.userId,
      entityType: "identifier_claim",
      entityId: claim.id,
      after: { attempts },
      ip: input.ip ?? null,
    });
    return { outcome: attempts >= MAX_CLAIM_ATTEMPTS ? "too_many_attempts" : "wrong_code", attemptsRemaining: Math.max(0, MAX_CLAIM_ATTEMPTS - attempts) };
  }

  await db.insert(schema.citizenIdentifiers).values({
    userId: claim.userId,
    kind: claim.kind,
    valueHash: claim.valueHash,
    valueLast4: claim.valueLast4,
    verifiedAt: new Date(),
  });
  await db.update(schema.identifierClaims).set({ consumedAt: new Date() }).where(eq(schema.identifierClaims.id, claim.id));

  await audit({
    action: "identifier.linked",
    actorUserId: input.actorUserId ?? claim.userId,
    entityType: "user",
    entityId: claim.userId,
    after: { kind: claim.kind, last4: claim.valueLast4 },
    ip: input.ip ?? null,
  });
  return { outcome: "linked", attemptsRemaining: MAX_CLAIM_ATTEMPTS };
}

/** Drops codes that have expired. Called by the scheduler; a spent code is not evidence of anything. */
export async function pruneIdentifierClaims(now = new Date()): Promise<number> {
  const db = await getDb();
  const rows = await db
    .delete(schema.identifierClaims)
    .where(and(lt(schema.identifierClaims.expiresAt, now), isNull(schema.identifierClaims.consumedAt)))
    .returning();
  return rows.length;
}

/** Claims still open for an account, for the settings screen. */
export async function openClaims(userId: string, now = new Date()) {
  const db = await getDb();
  return db
    .select({ id: schema.identifierClaims.id, kind: schema.identifierClaims.kind, last4: schema.identifierClaims.valueLast4, expiresAt: schema.identifierClaims.expiresAt })
    .from(schema.identifierClaims)
    .where(and(eq(schema.identifierClaims.userId, userId), isNull(schema.identifierClaims.consumedAt), gt(schema.identifierClaims.expiresAt, now)));
}
