/**
 * Canonical conversation service.
 *
 * Every channel — IVR, WhatsApp, USSD, SMS, PWA — creates or resumes a session here and
 * calls `runTurn()`. The channel adapters only translate transport formats; all identity,
 * consent, safety short-circuiting, turn sequencing and reply shaping live in this file so
 * that a citizen gets the same answer whatever device they used.
 */
import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { ChannelType, LanguageCode, ModuleType, Role } from "@server/db/schema";
import { env } from "@server/core/env";
import { emitEvent } from "@server/core/events";
import { runInteraction } from "@server/ai/agents/orchestrator";
import { detectEmergencyTerms, EMERGENCY_MESSAGES } from "@server/ai/safety";
import { ChannelError } from "./errors";
import {
  capabilitiesFromRecord,
  capabilitiesToRecord,
  negotiateCapabilities,
  type ChannelCapabilities,
} from "./capabilities";
import { LANGUAGES, t } from "./strings";

export type ChannelSession = typeof schema.sessions.$inferSelect;

/** Identifier kinds recorded in `citizen_identifiers`. */
export type IdentifierKind = "msisdn" | "whatsapp" | "pwa_account" | "ivr_caller";

/** Channel-specific, resumable state kept in `sessions.state`. */
export interface SessionState {
  /** Adapter step machine (IVR: language | module | question | answer). */
  step?: string;
  /** USSD walk position. */
  ussd?: { module?: ModuleType; startedAt?: string; providerSessionId?: string; askedLanguage?: boolean };
  /** Remaining chunks of a long reply (FR-CH-04). */
  continuation?: { chunks: string[]; index: number; interactionId: string | null };
  lastQuestion?: string;
  lastAnswer?: string;
  lastSummary?: string;
  lastInteractionId?: string;
  lastModule?: ModuleType;
  /** Shared-phone confirmation (FR-CH-41). */
  sharedPhonePrompted?: boolean;
  sharedPhoneAnswer?: "self" | "other";
  /** Opt-out state (FR-CH-14). */
  optedOut?: boolean;
  optedOutAt?: string;
  /** WhatsApp 24 h customer-service window (FR-CH-13). */
  lastInboundAt?: string;
  /** Rotating greeting index used by IVR. */
  greetingIndex?: number;
  [key: string]: unknown;
}

export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;
/** ~60 words ≈ 25 s of speech (FR-CH-04). */
export const SPOKEN_CHUNK_WORDS = 60;

/* ────────────────────────────── identity ────────────────────────────── */

/** Stable, non-reversible identifier hash. Peppered with the session secret. */
export function hashIdentifier(kind: IdentifierKind, value: string): string {
  const normalised = normaliseIdentifier(kind, value);
  return createHash("sha256").update(`${kind}:${normalised}:${env.sessionSecret ?? "cvos"}`).digest("hex");
}

export function normaliseIdentifier(kind: IdentifierKind, value: string): string {
  const trimmed = value.trim();
  if (kind === "pwa_account") return trimmed;
  // Phone-like identifiers: keep digits only, drop the leading "+" and any "whatsapp:" prefix.
  return trimmed.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

/** E.164 form of a phone-like identifier, used for outbound messages. */
export function toE164(value: string): string | null {
  const digits = value.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  return digits.length >= 8 ? `+${digits}` : null;
}

export function last4(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.slice(-4);
}

export interface CitizenIdentity {
  userId: string;
  role: Role;
  language: LanguageCode;
  province: string | null;
  consentStatus: string;
  isNew: boolean;
  identifierHash: string;
  /** True once the citizen picked a language explicitly (menu, keypad, button). */
  languageConfirmed: boolean;
}

/**
 * Finds — or creates — the anonymous citizen behind a channel identifier (FR-CH-01).
 * A phone number seen on IVR, SMS, USSD and WhatsApp resolves to the same citizen, so
 * history and language preference follow the person across channels (FR-CH-40).
 */
export async function identifyCitizen(input: {
  kind: IdentifierKind;
  value: string;
  language?: LanguageCode | null;
  province?: string | null;
}): Promise<CitizenIdentity> {
  const db = await getDb();
  const primaryHash = hashIdentifier(input.kind, input.value);

  // Aliases: the same digits reached through another channel are the same person.
  const aliasKinds: IdentifierKind[] =
    input.kind === "pwa_account" ? [input.kind] : (["msisdn", "whatsapp", "ivr_caller"] as IdentifierKind[]);
  const candidates = aliasKinds.map((k) => ({ kind: k, hash: hashIdentifier(k, input.value) }));

  const existing = await db
    .select()
    .from(schema.citizenIdentifiers)
    .where(inArray(schema.citizenIdentifiers.valueHash, candidates.map((c) => c.hash)));

  let userId = existing[0]?.userId ?? null;
  let isNew = false;
  const phone = input.kind === "pwa_account" ? null : toE164(input.value);

  if (!userId && phone) {
    // The number may already belong to a registered account (a worker calling the IVR).
    const [byPhone] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
    if (byPhone) userId = byPhone.id;
  }

  if (!userId) {
    const [user] = await db
      .insert(schema.users)
      .values({
        isAnonymous: true,
        role: "citizen",
        phone,
        languagePreference: input.language ?? "fr",
        province: input.province ?? null,
        consentStatus: "pending",
        lastActivityAt: new Date(),
      })
      .returning();
    userId = user.id;
    isNew = true;
  }

  // Record the identifier used now (and only that one) if it is not already known.
  if (!existing.some((e) => e.valueHash === primaryHash)) {
    await db.insert(schema.citizenIdentifiers).values({
      userId,
      kind: input.kind,
      valueHash: primaryHash,
      valueLast4: last4(input.value) || null,
    });
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  // The language remembered on the citizen row is the per-identifier preference (FR-CH-40).
  let language: LanguageCode = user?.languagePreference ?? "fr";
  let languageConfirmed = (user?.preferences as Record<string, unknown> | undefined)?.languageConfirmed === true;
  if (input.language) {
    language = input.language;
    await rememberIdentifierLanguage(userId, language);
    languageConfirmed = true;
  }
  await db.update(schema.users).set({ lastActivityAt: new Date() }).where(eq(schema.users.id, userId));

  return {
    userId,
    role: user?.role ?? "citizen",
    language,
    province: user?.province ?? input.province ?? null,
    consentStatus: user?.consentStatus ?? "pending",
    isNew,
    identifierHash: primaryHash,
    languageConfirmed,
  };
}

/**
 * Remembers the language chosen on a channel for this citizen (FR-CH-40) and marks it as
 * an explicit choice, so menus stop asking for it on the next call.
 */
export async function rememberIdentifierLanguage(userId: string, language: LanguageCode): Promise<void> {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const preferences = { ...((user?.preferences ?? {}) as Record<string, unknown>), languageConfirmed: true };
  await db.update(schema.users).set({ languagePreference: language, preferences }).where(eq(schema.users.id, userId));
}

/* ────────────────────────────── consent ────────────────────────────── */

export type ConsentPurpose = "service" | "reminders" | "precise_location" | "analytics" | "research" | "partner_sharing";

export const REQUIRED_CONSENTS: ConsentPurpose[] = ["service"];

export async function consentSnapshot(userId: string | null): Promise<Record<string, string>> {
  if (!userId) return {};
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.consents)
    .where(eq(schema.consents.userId, userId))
    .orderBy(desc(schema.consents.occurredAt));
  const snap: Record<string, string> = {};
  for (const row of rows) if (!(row.purpose in snap)) snap[row.purpose] = row.status;
  return snap;
}

export async function recordConsent(input: {
  userId: string;
  purpose: ConsentPurpose;
  status: "granted" | "revoked";
  method: "voice" | "button" | "ussd" | "worker_assisted";
  language: LanguageCode;
}): Promise<void> {
  const db = await getDb();
  await db.insert(schema.consents).values({
    userId: input.userId,
    purpose: input.purpose,
    status: input.status,
    method: input.method,
    language: input.language,
  });
  await db
    .update(schema.users)
    .set({ consentStatus: input.status === "granted" ? "granted" : "revoked" })
    .where(eq(schema.users.id, input.userId));
}

/** Purposes still missing a "granted" record. */
export async function missingConsents(userId: string | null): Promise<ConsentPurpose[]> {
  const snap = await consentSnapshot(userId);
  return REQUIRED_CONSENTS.filter((p) => snap[p] !== "granted");
}

/* ─────────────────────────── opt-out (FR-CH-14) ─────────────────────────── */

/** Stop words in the five platform languages, plus the operator-mandated STOP/ARRÊT. */
const OPT_OUT_WORDS = new Set([
  "stop",
  "stopp",
  "arret",
  "arrêt",
  "arrête",
  "arrete",
  "arreter",
  "arrêter",
  "tika", // Lingala — stop
  "tikala",
  "acha", // Swahili — stop
  "simama",
  "yambula", // Kikongo — leave off
  "kanga",
  "lekela", // Tshiluba — stop
  "imanyi",
  "unsubscribe",
  "desabonner",
  "désabonner",
]);

const OPT_IN_WORDS = new Set(["start", "oui", "reprendre", "kobanda", "anza", "yantika", "tuadija", "subscribe"]);

export function detectOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = text.trim().toLowerCase().replace(/[.!?,;:]/g, "");
  if (!cleaned) return false;
  const words = cleaned.split(/\s+/);
  // Only a short, standalone command counts, so "n'arrête pas de tousser" is not an opt-out.
  if (words.length > 2) return false;
  return words.every((w) => OPT_OUT_WORDS.has(w)) && words.some((w) => OPT_OUT_WORDS.has(w));
}

export function detectOptIn(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = text.trim().toLowerCase().replace(/[.!?,;:]/g, "");
  const words = cleaned.split(/\s+/);
  return words.length === 1 && OPT_IN_WORDS.has(words[0]);
}

export async function applyOptOut(session: ChannelSession, language: LanguageCode): Promise<string> {
  const db = await getDb();
  if (session.userId) {
    for (const purpose of ["service", "reminders", "analytics"] as ConsentPurpose[]) {
      await recordConsent({
        userId: session.userId,
        purpose,
        status: "revoked",
        method: session.channel === "ussd" ? "ussd" : session.channel === "ivr" ? "voice" : "button",
        language,
      });
    }
  }
  const state = readState(session);
  await db
    .update(schema.sessions)
    .set({
      status: "ended",
      endedAt: new Date(),
      state: { ...state, optedOut: true, optedOutAt: new Date().toISOString() },
    })
    .where(eq(schema.sessions.id, session.id));
  await emitEvent({
    type: "cvos.consent.revoked",
    aggregateType: "session",
    aggregateId: session.id,
    actor: { type: "citizen", id: session.userId },
    channel: session.channel,
    language,
    classification: "confidential",
    payload: { reason: "opt_out_keyword" },
  });
  return t("optOutAck", language);
}

export async function applyOptIn(session: ChannelSession, language: LanguageCode): Promise<string> {
  const db = await getDb();
  if (session.userId) {
    await recordConsent({
      userId: session.userId,
      purpose: "service",
      status: "granted",
      method: session.channel === "ussd" ? "ussd" : session.channel === "ivr" ? "voice" : "button",
      language,
    });
  }
  const state = readState(session);
  await db
    .update(schema.sessions)
    .set({ status: "active", endedAt: null, state: { ...state, optedOut: false } })
    .where(eq(schema.sessions.id, session.id));
  return t("optInAck", language);
}

/* ────────────────────────────── sessions ────────────────────────────── */

export function readState(session: ChannelSession): SessionState {
  return (session.state ?? {}) as SessionState;
}

export async function patchState(sessionId: string, patch: SessionState): Promise<ChannelSession> {
  const db = await getDb();
  const [current] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
  if (!current) throw new ChannelError("NOT_FOUND");
  const [row] = await db
    .update(schema.sessions)
    .set({ state: { ...readState(current), ...patch } })
    .where(eq(schema.sessions.id, sessionId))
    .returning();
  return row;
}

export async function getSessionById(id: string): Promise<ChannelSession | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
  return row ?? null;
}

export interface CreateSessionInput {
  channel: ChannelType;
  language?: LanguageCode | null;
  province?: string | null;
  territory?: string | null;
  capabilities?: Record<string, unknown> | null;
  userId?: string | null;
  channelRef?: string | null;
  module?: ModuleType | null;
  state?: SessionState;
}

export async function createSession(input: CreateSessionInput): Promise<ChannelSession> {
  const db = await getDb();
  const caps = negotiateCapabilities(input.channel, input.capabilities ?? null);
  const snapshot = await consentSnapshot(input.userId ?? null);
  const [row] = await db
    .insert(schema.sessions)
    .values({
      userId: input.userId ?? null,
      channel: input.channel,
      channelRef: input.channelRef ?? null,
      language: input.language ?? null,
      module: input.module ?? null,
      status: "active",
      province: input.province ?? null,
      territory: input.territory ?? null,
      capabilities: capabilitiesToRecord(caps),
      consentSnapshot: snapshot,
      state: (input.state ?? {}) as Record<string, unknown>,
    })
    .returning();
  await emitEvent({
    type: "cvos.session.started",
    aggregateType: "session",
    aggregateId: row.id,
    actor: { type: "citizen", id: row.userId },
    channel: row.channel,
    language: row.language,
    module: row.module,
    payload: { capabilities: row.capabilities, resumed: false },
  });
  return row;
}

/** Sessions of the same identifier stay resumable for 24 hours (FR-CH-06). */
export async function findResumableSession(channel: ChannelType, channelRef: string): Promise<ChannelSession | null> {
  const db = await getDb();
  const since = new Date(Date.now() - RESUME_WINDOW_MS);
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.channel, channel),
        eq(schema.sessions.channelRef, channelRef),
        gte(schema.sessions.startedAt, since),
        inArray(schema.sessions.status, ["active", "resumable"]),
      ),
    )
    .orderBy(desc(schema.sessions.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export interface ResumeResult {
  session: ChannelSession;
  resumed: boolean;
  identity: CitizenIdentity;
  /** Localised "where we left off" line, null for a fresh session. */
  summary: string | null;
}

/**
 * Creates or resumes the session behind a channel identifier. Used by every telephony
 * adapter: one call, one WhatsApp number, one USSD dial resolves to the same citizen.
 */
export async function startOrResume(input: {
  channel: ChannelType;
  kind: IdentifierKind;
  identifier: string;
  language?: LanguageCode | null;
  province?: string | null;
  capabilities?: Record<string, unknown> | null;
  state?: SessionState;
}): Promise<ResumeResult> {
  const identity = await identifyCitizen({
    kind: input.kind,
    value: input.identifier,
    language: input.language ?? null,
    province: input.province ?? null,
  });
  const channelRef = identity.identifierHash;
  const existing = await findResumableSession(input.channel, channelRef);
  if (existing) {
    const db = await getDb();
    const [row] = await db
      .update(schema.sessions)
      .set({
        status: "active",
        language: input.language ?? existing.language ?? identity.language,
        state: { ...readState(existing), ...(input.state ?? {}) },
      })
      .where(eq(schema.sessions.id, existing.id))
      .returning();
    await emitEvent({
      type: "cvos.session.resumed",
      aggregateType: "session",
      aggregateId: row.id,
      actor: { type: "citizen", id: row.userId },
      channel: row.channel,
      language: row.language,
      payload: { turnCount: row.turnCount },
    });
    return { session: row, resumed: true, identity, summary: resumeSummary(row) };
  }
  const session = await createSession({
    channel: input.channel,
    language: input.language ?? identity.language,
    province: identity.province,
    capabilities: input.capabilities ?? null,
    userId: identity.userId,
    channelRef,
    state: input.state,
  });
  return { session, resumed: false, identity, summary: null };
}

/** "Where we left off" line (FR-CH-06). */
export function resumeSummary(session: ChannelSession): string | null {
  const state = readState(session);
  const language = session.language ?? "fr";
  const last = state.lastQuestion ?? state.lastSummary;
  if (!last || session.turnCount === 0) return null;
  const trimmed = last.length > 160 ? `${last.slice(0, 157)}…` : last;
  return `${t("resumePrefix", language)} « ${trimmed} »`;
}

/** Lightweight shared-phone confirmation (FR-CH-41): asked once per session on phone channels. */
export function shouldConfirmSharedPhone(session: ChannelSession): boolean {
  const state = readState(session);
  if (state.sharedPhonePrompted || state.sharedPhoneAnswer) return false;
  return ["ivr", "whatsapp", "ussd", "sms"].includes(session.channel);
}

export async function recordSharedPhoneAnswer(session: ChannelSession, answer: "self" | "other"): Promise<ChannelSession> {
  const db = await getDb();
  const state = readState(session);
  const [row] = await db
    .update(schema.sessions)
    .set({
      state: { ...state, sharedPhonePrompted: true, sharedPhoneAnswer: answer },
      proxy: answer === "other" ? { onBehalfOf: "other_person", basis: "declared_by_caller" } : null,
    })
    .where(eq(schema.sessions.id, session.id))
    .returning();
  return row;
}

export async function endSession(sessionId: string, reason: "ended" | "abandoned" = "ended"): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .update(schema.sessions)
    .set({ status: reason === "abandoned" ? "abandoned" : "ended", endedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId))
    .returning();
  if (!row) return;
  if (reason === "abandoned") {
    await emitEvent({
      type: "cvos.session.abandoned",
      aggregateType: "session",
      aggregateId: row.id,
      actor: { type: "citizen", id: row.userId },
      channel: row.channel,
      language: row.language,
      payload: { turnCount: row.turnCount },
    });
  }
}

/** Marks sessions untouched for 24 h as abandoned and emits session.abandoned. */
export async function sweepAbandonedSessions(now = new Date()): Promise<number> {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - RESUME_WINDOW_MS);
  const stale = await db
    .select()
    .from(schema.sessions)
    .where(and(inArray(schema.sessions.status, ["active", "resumable"]), lte(schema.sessions.startedAt, cutoff)));
  for (const s of stale) await endSession(s.id, "abandoned");
  return stale.length;
}

/* ────────────────────────────── turns ────────────────────────────── */

/** Splits a reply into ~25 s spoken chunks on sentence boundaries (FR-CH-04). */
export function chunkForSpeech(text: string, maxWords = SPOKEN_CHUNK_WORDS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current: string[] = [];
  let count = 0;
  const push = () => {
    if (current.length) chunks.push(current.join(" ").trim());
    current = [];
    count = 0;
  };
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) {
      push();
      for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords).join(" "));
      continue;
    }
    if (count + words.length > maxWords) push();
    current.push(sentence);
    count += words.length;
  }
  push();
  return chunks.length ? chunks : [clean];
}

export interface RunTurnInput {
  session: ChannelSession;
  text?: string | null;
  audio?: { data: Buffer; mimeType: string } | null;
  images?: Array<{ data: Buffer; mimeType: string; fileId: string }>;
  moduleHint?: ModuleType | null;
  /** Force chunking on or off; defaults to the channel capability. */
  chunk?: boolean;
  wantsAudio?: boolean;
  idempotencyKey?: string | null;
}

export type TurnStatus = "completed" | "failed" | "emergency" | "opted_out" | "opted_in" | "continuation";

export interface TurnResult {
  sessionId: string;
  seq: number;
  status: TurnStatus;
  interactionId: string | null;
  language: LanguageCode;
  module: ModuleType;
  /** What the channel must say or send now. */
  text: string;
  /** The whole reply, before chunking. */
  fullText: string;
  hasMore: boolean;
  continuationPrompt: string | null;
  followUpQuestions: string[];
  audioUrl: string | null;
  caseId: string | null;
  emergency: boolean;
  escalated: boolean;
  /** The answer was given with low confidence: the citizen should be asked to clarify. */
  lowConfidence: boolean;
  /** Present when processing continues after the reply was already returned. */
  background?: Promise<unknown>;
}

const CONTINUE_WORDS = new Set(["continuer", "continue", "oui", "ok", "1", "iyo", "ee", "ndiyo", "eyowa", "kokoba", "endelea"]);

export function isContinuationRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = text.trim().toLowerCase().replace(/[.!?,;:]/g, "");
  return cleaned.length > 0 && cleaned.split(/\s+/).every((w) => CONTINUE_WORDS.has(w));
}

/**
 * One conversational turn. Wraps `runInteraction()` with channel concerns:
 * opt-out, emergency short-circuit (FR-CH-07), turn sequencing, continuation chunks.
 */
export async function runTurn(input: RunTurnInput): Promise<TurnResult> {
  const db = await getDb();
  const session = input.session;
  const state = readState(session);
  const capabilities: ChannelCapabilities = capabilitiesFromRecord(session.channel, session.capabilities);
  const language: LanguageCode = session.language ?? "fr";
  const seq = session.turnCount + 1;
  const text = input.text?.trim() || null;

  await emitEvent({
    type: "cvos.session.turn.received",
    aggregateType: "session",
    aggregateId: session.id,
    aggregateVersion: seq,
    actor: { type: "citizen", id: session.userId },
    channel: session.channel,
    language,
    module: session.module,
    classification: "confidential",
    payload: { seq, hasAudio: !!input.audio, hasImages: (input.images ?? []).length > 0, hasText: !!text },
  });

  // 1. Opt-out / opt-in keywords take precedence over everything else (FR-CH-14).
  if (detectOptOut(text)) {
    const message = await applyOptOut(session, language);
    return baseResult(session, seq, {
      status: "opted_out",
      language,
      text: message,
      fullText: message,
    });
  }
  if (detectOptIn(text) && state.optedOut) {
    const message = await applyOptIn(session, language);
    return baseResult(session, seq, { status: "opted_in", language, text: message, fullText: message });
  }

  // 2. Continuation of a previous long reply.
  if (text && isContinuationRequest(text) && (state.continuation?.chunks.length ?? 0) > (state.continuation?.index ?? 0) + 1) {
    return continueTurn(session);
  }

  // 3. Consent gate.
  const user = session.userId
    ? (await db.select().from(schema.users).where(eq(schema.users.id, session.userId)))[0]
    : undefined;
  if (user?.consentStatus === "declined") {
    throw new ChannelError("CONSENT_REQUIRED", { language, fields: ["consent.service"], extra: { session_id: session.id } });
  }

  const wantsAudio = input.wantsAudio ?? capabilities.audio;
  const interactionInput = {
    user: session.userId
      ? { userId: session.userId, role: (user?.role ?? "citizen") as Role, language, province: session.province }
      : null,
    moduleHint: input.moduleHint ?? session.module ?? null,
    text,
    audio: input.audio ?? null,
    images: input.images ?? [],
    province: session.province,
    clientKey: input.idempotencyKey ?? null,
    wantsAudio,
  };

  // 4. Emergency short-circuit (FR-CH-07): deterministic keywords, before any model call.
  const emergencyHits = text ? detectEmergencyTerms(text) : [];
  if (emergencyHits.length > 0) {
    const message = EMERGENCY_MESSAGES[language] ?? EMERGENCY_MESSAGES.fr;
    // The full pipeline still runs — the CHW alert and the case must be created.
    const background = runInteraction(interactionInput)
      .then(async (out) => {
        await linkInteraction(out.interactionId, session.id, seq, input.idempotencyKey ?? null);
        await finishTurn(session, seq, {
          language,
          module: out.module,
          question: text,
          answer: out.responseText,
          summary: out.answer.summary,
          interactionId: out.interactionId,
          continuation: null,
        });
        await emitEvent({
          type: "cvos.session.turn.completed",
          aggregateType: "session",
          aggregateId: session.id,
          aggregateVersion: seq,
          actor: { type: "ai" },
          channel: session.channel,
          language,
          module: out.module,
          classification: "confidential",
          payload: { seq, interactionId: out.interactionId, emergency: true, caseId: out.caseId, escalated: out.answer.escalation.required },
        });
        return out;
      })
      .catch((err: unknown) => {
        console.error("[channels] emergency background pipeline failed", err);
        return null;
      });

    await emitEvent({
      type: "cvos.safety.emergency_shortcircuit",
      aggregateType: "session",
      aggregateId: session.id,
      aggregateVersion: seq,
      actor: { type: "system" },
      channel: session.channel,
      language,
      classification: "sensitive",
      payload: { seq, flags: emergencyHits.slice(0, 5) },
    });

    return baseResult(session, seq, {
      status: "emergency",
      language,
      module: "health",
      text: message,
      fullText: message,
      emergency: true,
      background,
    });
  }

  // 5. Normal path.
  const out = await runInteraction(interactionInput);
  await linkInteraction(out.interactionId, session.id, seq, input.idempotencyKey ?? null);

  const shouldChunk = input.chunk ?? (!capabilities.longText || capabilities.spokenReply);
  const chunks = shouldChunk ? chunkForSpeech(out.responseText) : [out.responseText];
  const hasMore = chunks.length > 1;
  const continuation = hasMore ? { chunks, index: 0, interactionId: out.interactionId } : null;

  await finishTurn(session, seq, {
    language: out.language,
    module: out.module,
    question: out.transcript || text,
    answer: out.responseText,
    summary: out.answer.summary,
    interactionId: out.interactionId,
    continuation,
  });

  await emitEvent({
    type: "cvos.session.turn.completed",
    aggregateType: "session",
    aggregateId: session.id,
    aggregateVersion: seq,
    actor: { type: "ai" },
    channel: session.channel,
    language: out.language,
    module: out.module,
    classification: "confidential",
    payload: {
      seq,
      interactionId: out.interactionId,
      status: out.status,
      caseId: out.caseId,
      escalated: out.answer.escalation.required,
      latencyMs: out.latencyMs,
      chunks: chunks.length,
    },
  });

  return {
    sessionId: session.id,
    seq,
    status: out.status,
    interactionId: out.interactionId,
    language: out.language,
    module: out.module,
    text: chunks[0] ?? out.responseText,
    fullText: out.responseText,
    hasMore,
    continuationPrompt: hasMore ? t(capabilities.spokenReply ? "continuePrompt" : "continueHint", out.language) : null,
    followUpQuestions: out.followUpQuestions,
    audioUrl: out.audioUrl,
    caseId: out.caseId,
    emergency: false,
    escalated: out.answer.escalation.required,
    lowConfidence: out.answer.confidence.low,
  };
}

/**
 * Waits for the work that continued after an emergency reply was already sent, then fills
 * in what only the finished pipeline knows (interaction id, case id, escalation).
 */
export async function settleTurn(result: TurnResult): Promise<TurnResult> {
  if (!result.background) return result;
  await result.background;
  if (result.interactionId) return result;
  const session = await getSessionById(result.sessionId);
  const interactionId = session ? (readState(session).lastInteractionId ?? null) : null;
  if (!interactionId) return { ...result, background: undefined };
  const db = await getDb();
  const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, interactionId));
  return {
    ...result,
    background: undefined,
    interactionId,
    caseId: row?.caseId ?? result.caseId,
    escalated: row?.escalationRequired ?? result.escalated,
    module: row?.module ?? result.module,
  };
}

/** Next chunk of a long reply (FR-CH-04). */
export async function continueTurn(session: ChannelSession): Promise<TurnResult> {
  const db = await getDb();
  const state = readState(session);
  const language = session.language ?? "fr";
  const cont = state.continuation;
  if (!cont || cont.index + 1 >= cont.chunks.length) {
    return baseResult(session, session.turnCount, {
      status: "completed",
      language,
      text: "",
      fullText: "",
    });
  }
  const index = cont.index + 1;
  const hasMore = index + 1 < cont.chunks.length;
  const [row] = await db
    .update(schema.sessions)
    .set({ state: { ...state, continuation: { ...cont, index } }, lastTurnAt: new Date() })
    .where(eq(schema.sessions.id, session.id))
    .returning();
  const capabilities = capabilitiesFromRecord(row.channel, row.capabilities);
  return {
    sessionId: session.id,
    seq: session.turnCount,
    status: "continuation",
    interactionId: cont.interactionId,
    language,
    module: (row.module ?? "general") as ModuleType,
    text: cont.chunks[index],
    fullText: cont.chunks.join(" "),
    hasMore,
    continuationPrompt: hasMore ? t(capabilities.spokenReply ? "continuePrompt" : "continueHint", language) : null,
    followUpQuestions: [],
    audioUrl: null,
    caseId: null,
    emergency: false,
    escalated: false,
    lowConfidence: false,
  };
}

async function linkInteraction(interactionId: string, sessionId: string, seq: number, idempotencyKey: string | null) {
  const db = await getDb();
  await db
    .update(schema.interactions)
    .set({ sessionId, seq, idempotencyKey })
    .where(eq(schema.interactions.id, interactionId));
}

async function finishTurn(
  session: ChannelSession,
  seq: number,
  info: {
    language: LanguageCode;
    module: ModuleType;
    question: string | null;
    answer: string;
    summary: string;
    interactionId: string;
    continuation: SessionState["continuation"] | null;
  },
) {
  const db = await getDb();
  const state = readState(session);
  await db
    .update(schema.sessions)
    .set({
      turnCount: seq,
      lastTurnAt: new Date(),
      language: info.language,
      module: info.module,
      status: "active",
      state: {
        ...state,
        lastQuestion: info.question ?? state.lastQuestion,
        lastAnswer: info.answer,
        lastSummary: info.summary,
        lastInteractionId: info.interactionId,
        lastModule: info.module,
        continuation: info.continuation ?? undefined,
      },
    })
    .where(eq(schema.sessions.id, session.id));
}

function baseResult(
  session: ChannelSession,
  seq: number,
  over: Partial<TurnResult> & { status: TurnStatus; language: LanguageCode; text: string; fullText: string },
): TurnResult {
  return {
    sessionId: session.id,
    seq,
    interactionId: null,
    module: (session.module ?? "general") as ModuleType,
    hasMore: false,
    continuationPrompt: null,
    followUpQuestions: [],
    audioUrl: null,
    caseId: null,
    emergency: false,
    escalated: false,
    lowConfidence: false,
    ...over,
  };
}

/** Language chosen through a keypad or menu digit, remembered for next time. */
export async function setSessionLanguage(session: ChannelSession, language: LanguageCode): Promise<ChannelSession> {
  if (!LANGUAGES.includes(language)) throw new ChannelError("LANGUAGE_UNSUPPORTED", { fields: ["language"] });
  const db = await getDb();
  const [row] = await db
    .update(schema.sessions)
    .set({ language })
    .where(eq(schema.sessions.id, session.id))
    .returning();
  if (session.userId) await rememberIdentifierLanguage(session.userId, language);
  return row;
}

export async function setSessionModule(session: ChannelSession, module: ModuleType): Promise<ChannelSession> {
  const db = await getDb();
  const [row] = await db.update(schema.sessions).set({ module }).where(eq(schema.sessions.id, session.id)).returning();
  return row;
}
