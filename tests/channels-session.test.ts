import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@/lib/db/client";
import { EMERGENCY_MESSAGES } from "@/lib/ai/safety";
import {
  capabilitiesFromRecord,
  negotiateCapabilities,
} from "@/lib/channels/capabilities";
import {
  chunkForSpeech,
  consentSnapshot,
  continueTurn,
  detectOptOut,
  findResumableSession,
  identifyCitizen,
  missingConsents,
  readState,
  resumeSummary,
  runTurn,
  settleTurn,
  setSessionLanguage,
  shouldConfirmSharedPhone,
  startOrResume,
} from "@/lib/channels/session";
import { splitSms } from "@/lib/channels/sms";
import { uuidv7 } from "@/lib/channels/offline-queue";
import { withIdempotency } from "@/lib/core/idempotency";

describe("channel session service", () => {
  beforeAll(async () => {
    resetDbForTests();
    await getDb();
  });

  it("negotiates capabilities per channel and never widens them", () => {
    const ussd = negotiateCapabilities("ussd", { audio: true, images: true, maxTextLength: 1000 });
    expect(ussd.audio).toBe(false);
    expect(ussd.images).toBe(false);
    expect(ussd.maxTextLength).toBe(160);

    const whatsapp = negotiateCapabilities("whatsapp");
    expect(whatsapp.audio).toBe(true);
    expect(whatsapp.maxButtons).toBe(3);
    expect(whatsapp.maxListItems).toBe(10);

    const pwa = negotiateCapabilities("pwa", { backgroundSync: false });
    expect(pwa.backgroundSync).toBe(false);
    expect(pwa.longText).toBe(true);

    expect(capabilitiesFromRecord("ivr", { audio: true, longText: true }).longText).toBe(false);
  });

  it("resolves the same citizen across IVR, SMS and WhatsApp and remembers the language", async () => {
    const db = await getDb();
    const phone = "+243810000101";
    const viaIvr = await identifyCitizen({ kind: "ivr_caller", value: phone });
    const viaWhatsapp = await identifyCitizen({ kind: "whatsapp", value: "243810000101" });
    const viaSms = await identifyCitizen({ kind: "msisdn", value: "243 81 000 0101" });

    expect(viaWhatsapp.userId).toBe(viaIvr.userId);
    expect(viaSms.userId).toBe(viaIvr.userId);
    expect(viaIvr.isNew).toBe(true);
    expect(viaWhatsapp.isNew).toBe(false);
    expect(viaIvr.languageConfirmed).toBe(false);

    const identifiers = await db
      .select()
      .from(schema.citizenIdentifiers)
      .where(eq(schema.citizenIdentifiers.userId, viaIvr.userId));
    expect(identifiers).toHaveLength(3);
    expect(new Set(identifiers.map((i) => i.kind))).toEqual(new Set(["ivr_caller", "whatsapp", "msisdn"]));
    expect(identifiers.every((i) => i.valueLast4 === "0101")).toBe(true);
    // Raw numbers are never stored.
    expect(identifiers.every((i) => !i.valueHash.includes("243"))).toBe(true);

    const { session } = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: phone });
    await setSessionLanguage(session, "ln");
    const again = await identifyCitizen({ kind: "msisdn", value: phone });
    expect(again.language).toBe("ln");
    expect(again.languageConfirmed).toBe(true);
  });

  it("chunks a long reply into ~25 s pieces and continues on request", async () => {
    const sentence = "Donnez de l'eau propre à votre enfant après chaque selle liquide et surveillez les signes de danger.";
    const long = Array.from({ length: 8 }, () => sentence).join(" ");
    const chunks = chunkForSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(long);
  });

  it("splits an SMS answer into at most three concatenated parts", () => {
    expect(splitSms("Réponse courte")).toEqual(["Réponse courte"]);
    const parts = splitSms("mot ".repeat(400));
    expect(parts.length).toBeLessThanOrEqual(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(160);
    expect(parts[0]).toContain("(1/3)");
  });

  it("detects opt-out keywords in the five languages without false positives", () => {
    for (const word of ["STOP", "arrêt", "Tika", "acha", "LEKELA", "yambula"]) {
      expect(detectOptOut(word)).toBe(true);
    }
    expect(detectOptOut("Mon enfant n'arrête pas de tousser depuis trois jours")).toBe(false);
    expect(detectOptOut("stop la fièvre continue")).toBe(false);
    expect(detectOptOut("")).toBe(false);
  });

  it("short-circuits an emergency before any AI call and still opens the case", async () => {
    const db = await getDb();
    const { session } = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: "+243810000102" });
    const result = await runTurn({ session, text: "Mon enfant a des convulsions et ne respire pas bien", wantsAudio: false });

    expect(result.status).toBe("emergency");
    expect(result.emergency).toBe(true);
    expect(result.text).toBe(EMERGENCY_MESSAGES.fr);
    expect(result.background).toBeDefined();

    const settled = await settleTurn(result);
    expect(settled.interactionId).toBeTruthy();
    expect(settled.caseId).toBeTruthy();

    const [c] = await db.select().from(schema.cases).where(eq(schema.cases.id, settled.caseId as string));
    expect(c.severity).toBe("critical");
    const notifications = await db.select().from(schema.notifications);
    expect(notifications.some((n) => n.type === "escalation" || n.type === "emergency")).toBe(true);

    const rows = await db.select().from(schema.interactions).where(eq(schema.interactions.sessionId, session.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].seq).toBe(1);
  });

  it("records a turn, chunks it for a spoken channel and resumes with a summary", async () => {
    const { session } = await startOrResume({ channel: "ivr", kind: "ivr_caller", identifier: "+243810000103" });
    const result = await runTurn({ session, text: "Quel engrais utiliser pour mon champ d'arachide ?", wantsAudio: false });
    expect(result.status).toBe("completed");
    expect(result.module).toBe("agriculture");
    expect(result.interactionId).toBeTruthy();

    const resumable = await findResumableSession("ivr", session.channelRef as string);
    expect(resumable?.id).toBe(session.id);
    expect(resumable?.turnCount).toBe(1);

    const summary = resumeSummary(resumable!);
    expect(summary).toContain("arachide");

    // A returning caller is asked once whether the phone is shared (FR-CH-41).
    expect(shouldConfirmSharedPhone(resumable!)).toBe(true);

    if (result.hasMore) {
      const next = await continueTurn(resumable!);
      expect(next.status).toBe("continuation");
      expect(next.text.length).toBeGreaterThan(0);
      expect(next.text).not.toBe(result.text);
    }
  });

  it("revokes consent on opt-out and refuses further turns", async () => {
    const db = await getDb();
    const { session } = await startOrResume({ channel: "sms", kind: "msisdn", identifier: "+243810000104" });
    const ack = await runTurn({ session, text: "STOP", wantsAudio: false });
    expect(ack.status).toBe("opted_out");
    expect(ack.text).toContain("START");

    const consents = await db.select().from(schema.consents).where(eq(schema.consents.userId, session.userId as string));
    expect(consents.length).toBeGreaterThanOrEqual(3);
    expect(consents.every((c) => c.status === "revoked")).toBe(true);

    const snapshot = await consentSnapshot(session.userId);
    expect(snapshot.service).toBe("revoked");
    expect(await missingConsents(session.userId)).toContain("service");

    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, session.id));
    expect(row.status).toBe("ended");
    expect(readState(row).optedOut).toBe(true);
  });

  it("generates time-ordered UUIDv7 ids for the offline queue", () => {
    const early = uuidv7(1_700_000_000_000);
    const late = uuidv7(1_800_000_000_000);
    expect(early).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(early < late).toBe(true);
    expect(uuidv7()).not.toBe(uuidv7());
  });

  it("runs work once per idempotency key and replays the stored response", async () => {
    let calls = 0;
    const work = async () => {
      calls += 1;
      return { value: calls };
    };
    const first = await withIdempotency("key-1", null, work);
    const second = await withIdempotency("key-1", null, work);
    expect(calls).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual({ value: 1 });

    // Different user, same key: independent.
    const other = await withIdempotency("key-1", "00000000-0000-4000-8000-000000000000", work);
    expect(other.replayed).toBe(false);
    expect(calls).toBe(2);
  });
});
