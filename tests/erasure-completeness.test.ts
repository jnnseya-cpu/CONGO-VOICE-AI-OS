/**
 * Erasure, verified table by table.
 *
 * The delete-my-account endpoint tells the citizen, in French, that "les
 * enregistrements, les photos et le texte de vos échanges ont été effacés". That
 * sentence is a promise to a data subject, and eight tables were keeping their
 * words after it was made: the half-typed draft, the feedback comment, the
 * resumable channel state and the caller id, the cached API response holding the
 * full transcript, the offline sync payload, the case timeline note, the
 * follow-up text and the request log's IP address.
 *
 * This test plants a recognisable string in every place a person's own words can
 * land, erases the account, and then searches for that string. A promise about
 * erasure is either testable or it is marketing.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb, resetDbForTests, schema } from "@server/db/client";
import { tombstoneUser } from "@server/core/privacy";
import { openCase } from "@server/ai/agents/workflow";

/** Unmistakable, and nothing else in the fixture would produce it. */
const SECRET = "MonEnfantSAppelleKabeyaEtIlNeBoitPlus";

const ids: Record<string, string> = {};

describe("what is left after an account is erased", () => {
  beforeAll(async () => {
    resetDbForTests();
    const db = await getDb();

    const [user] = await db
      .insert(schema.users)
      .values({ role: "citizen", phone: "+243880000001", name: "Kabeya Mwamba", languagePreference: "fr", province: "Kinshasa" })
      .returning();
    ids.user = user.id;

    const [interaction] = await db
      .insert(schema.interactions)
      .values({ userId: user.id, module: "health", status: "completed", originalInput: SECRET, transcript: SECRET, response: SECRET, understanding: SECRET, summary: SECRET })
      .returning();
    ids.interaction = interaction.id;

    const c = await openCase({ module: "health", userId: user.id, interactionId: interaction.id, title: SECRET, severity: "high", province: "Kinshasa", notes: SECRET, autoAssign: false });
    ids.case = c.id;

    // Every store the erasure did not previously reach.
    await db.insert(schema.autosaveDrafts).values({ userId: user.id, clientKey: "voice-1", module: "health", payload: { question: SECRET } });
    await db.insert(schema.feedback).values({ userId: user.id, interactionId: interaction.id, rating: 4, useful: true, comment: SECRET });
    await db.insert(schema.sessions).values({ userId: user.id, channel: "ivr", channelRef: SECRET, language: "fr", state: { pending: SECRET } });
    await db.insert(schema.idempotencyKeys).values({ key: `k-${user.id}`, userId: user.id, requestHash: "h", responseStatus: 200, responseBody: { responseText: SECRET } });
    await db.insert(schema.syncEvents).values({ id: `ev-${user.id}`, deviceId: "dev-1", userId: user.id, localSeq: 1, clientTimestamp: new Date(), type: "turn", payload: { text: SECRET } });
    await db.insert(schema.caseEvents).values({ caseId: c.id, type: "note", note: SECRET, fromValue: SECRET, toValue: SECRET });
    await db.insert(schema.followUps).values({ caseId: c.id, userId: user.id, scheduledFor: new Date(), outcomeText: SECRET });
    await db.insert(schema.apiRequestLogs).values({ method: "POST", path: "/api/v1/interactions", userId: user.id, role: "citizen", statusCode: 200, durationMs: 120, ip: "41.243.10.7" });
    await db.insert(schema.languageCorpus).values({ interactionId: interaction.id, language: "fr", sourceText: SECRET });

    await tombstoneUser(user.id, { userId: user.id, role: "citizen" });
  });

  const gone = async (table: string, column: string) => {
    const db = await getDb();
    const res = await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM "${table}" WHERE ${column}::text LIKE '%${SECRET}%'`),
    );
    const rows = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
    return (rows[0] as { n: number }).n;
  };

  it("leaves nothing in the interaction", async () => {
    expect(await gone("interactions", "coalesce(original_input,'') || coalesce(transcript,'') || coalesce(response,'') || coalesce(understanding,'') || coalesce(summary,'')")).toBe(0);
  });

  it("leaves nothing in the case or its timeline", async () => {
    expect(await gone("cases", "coalesce(title,'') || coalesce(notes,'') || coalesce(resolution,'')")).toBe(0);
    expect(await gone("case_events", "coalesce(note,'') || coalesce(from_value,'') || coalesce(to_value,'')")).toBe(0);
  });

  it("leaves nothing in an unsent draft", async () => {
    expect(await gone("autosave_drafts", "payload")).toBe(0);
  });

  it("leaves nothing in a feedback comment", async () => {
    expect(await gone("feedback", "coalesce(comment,'')")).toBe(0);
  });

  it("leaves nothing in a channel session, including the caller id", async () => {
    expect(await gone("sessions", "coalesce(channel_ref,'') || state::text")).toBe(0);
  });

  it("leaves nothing in the cached API response", async () => {
    expect(await gone("idempotency_keys", "coalesce(response_body::text,'')")).toBe(0);
  });

  it("leaves nothing in an offline-captured event", async () => {
    expect(await gone("sync_events", "payload")).toBe(0);
  });

  it("leaves nothing in a follow-up record", async () => {
    expect(await gone("follow_ups", "coalesce(outcome_text,'')")).toBe(0);
  });

  it("leaves nothing in the language corpus", async () => {
    expect(await gone("language_corpus", "coalesce(source_text,'') || coalesce(translation_fr,'')")).toBe(0);
  });

  it("drops the IP address from the request log but keeps the request", async () => {
    const db = await getDb();
    const [row] = await db.select().from(schema.apiRequestLogs).where(eq(schema.apiRequestLogs.userId, ids.user));
    expect(row.ip, "an address identifies a person on its own").toBeNull();
    expect(row.path, "what the programme served is still countable").toBe("/api/v1/interactions");
    expect(row.statusCode).toBe(200);
  });

  it("replaces the account with an irreversible tombstone", async () => {
    const db = await getDb();
    const [account] = await db.select().from(schema.users).where(eq(schema.users.id, ids.user));
    expect(account.name).toBeNull();
    expect(account.phone).toBeNull();
    expect(account.pinHash).toBeNull();
    expect(account.status).toBe("erased");
    expect(account.pseudoId?.startsWith("erased-")).toBe(true);
  });

  it("keeps the audit trail, which is the point of keeping anything", async () => {
    const db = await getDb();
    const rows = await db.select().from(schema.auditLogs);
    expect(rows.length, "the record of what the programme did must survive the person").toBeGreaterThan(0);
    const erasure = rows.filter((r) => r.action === "privacy.erasure_executed");
    expect(erasure.length).toBe(1);
    // And it must not itself have become a copy of what was erased.
    expect(JSON.stringify(rows)).not.toContain(SECRET);
  });

  /**
   * The catch-all. Anything that still holds the string is a table somebody added
   * without extending erasure, which is exactly how this gap appeared.
   */
  it("leaves the string nowhere in the database at all", async () => {
    const db = await getDb();
    const tablesRes = await db.execute(
      sql.raw(`SELECT table_name, column_name FROM information_schema.columns
               WHERE table_schema='public' AND data_type IN ('text','character varying','jsonb')`),
    );
    const cols = (Array.isArray(tablesRes) ? tablesRes : ((tablesRes as { rows?: unknown[] }).rows ?? [])) as Array<{ table_name: string; column_name: string }>;
    const offenders: string[] = [];
    for (const { table_name, column_name } of cols) {
      const res = await db.execute(
        sql.raw(`SELECT count(*)::int AS n FROM "${table_name}" WHERE "${column_name}"::text LIKE '%${SECRET}%'`),
      );
      const rows = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
      if ((rows[0] as { n: number }).n > 0) offenders.push(`${table_name}.${column_name}`);
    }
    expect(offenders, `personal text survived erasure in: ${offenders.join(", ")}`).toEqual([]);
  });
});
