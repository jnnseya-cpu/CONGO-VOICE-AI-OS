import "server-only";
import { eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import { storage } from "@server/core/storage";

/**
 * Clear the exchanges a pilot accumulated while it was being tested.
 *
 * Four test messages, three of them escalated by bugs that have since been
 * fixed, leave every chart and every count on the platform describing faults
 * rather than a service. A supervisor opening the dashboard on the first real
 * day should see the first real day.
 *
 * What this is not: it is not `npm run seed`, which writes synthetic
 * demonstration data and refuses to run in production for that reason. This
 * deletes and writes nothing.
 *
 * Three things are deliberately left alone.
 *
 * The audit log survives. It is hash-chained, so removing rows breaks the chain
 * and the platform's own integrity check would then report — correctly — that
 * its record had been tampered with. The audit log is the proof of what the
 * programme did; a reset that edits the proof is the one operation nobody
 * should be able to perform. The purge writes its own entry into it instead.
 *
 * Accounts survive. The administrator running this would otherwise delete their
 * own way back in, and staff accounts are configuration rather than test data.
 * Anonymous sessions created by testing are removed, because those are.
 *
 * Reference and clinical content survives: protocols, their signatures, the
 * knowledge base, provinces, glossaries, language measurements. Deleting a
 * board's signature because a chart looked untidy would be absurd.
 */

export interface ResetCounts {
  interactions: number;
  cases: number;
  notifications: number;
  files: number;
  followUps: number;
  feedback: number;
  drafts: number;
  anonymousUsers: number;
}

export interface ResetOutcome {
  counts: ResetCounts;
  /** Objects removed from storage. May be fewer than `files` if some were already gone. */
  storageObjectsDeleted: number;
  /** Files whose bytes could not be deleted; the row is kept so nothing claims they are gone. */
  storageFailures: number;
}

/** What a reset would remove, without removing it. */
export async function countPilotData(): Promise<ResetCounts> {
  const db = await getDb();
  const [interactions, cases, notifications, files, followUps, feedback, drafts, anonymous] = await Promise.all([
    db.select().from(schema.interactions),
    db.select().from(schema.cases),
    db.select().from(schema.notifications),
    db.select().from(schema.files),
    db.select().from(schema.followUps),
    db.select().from(schema.feedback),
    db.select().from(schema.autosaveDrafts),
    db.select().from(schema.users).where(eq(schema.users.isAnonymous, true)),
  ]);
  return {
    interactions: interactions.length,
    cases: cases.length,
    notifications: notifications.length,
    files: files.length,
    followUps: followUps.length,
    feedback: feedback.length,
    drafts: drafts.length,
    anonymousUsers: anonymous.length,
  };
}

export async function resetPilotData(actor: { userId: string; role: string }): Promise<ResetOutcome> {
  const db = await getDb();
  const counts = await countPilotData();

  // Bytes first. A row deleted before its object leaves a recording in the
  // bucket that nothing points at and nothing will ever sweep.
  const files = await db.select().from(schema.files);
  let storageObjectsDeleted = 0;
  let storageFailures = 0;
  for (const f of files) {
    try {
      await storage().delete(f.storageKey);
      storageObjectsDeleted++;
    } catch {
      storageFailures++;
    }
  }

  // Children before parents: a case event outlives its case otherwise, and a
  // foreign key refuses the delete half way through.
  await db.delete(schema.caseEvents);
  await db.delete(schema.healthTriageRecords);
  await db.delete(schema.agricultureReports);
  await db.delete(schema.educationSessions);
  await db.delete(schema.learningEvidence);
  await db.delete(schema.riskAssessments);
  await db.delete(schema.aiOverrides);
  await db.delete(schema.followUps);
  await db.delete(schema.feedback);
  await db.delete(schema.tasks);
  await db.delete(schema.notifications);
  await db.delete(schema.autosaveDrafts);
  await db.delete(schema.cases);
  await db.delete(schema.interactions);
  await db.delete(schema.files);
  await db.delete(schema.aiUsageLogs);
  await db.delete(schema.apiRequestLogs);
  await db.delete(schema.acuLedger);
  await db.delete(schema.agriClusters);
  await db.delete(schema.syncEvents);
  await db.delete(schema.idempotencyKeys);
  await db.delete(schema.rateLimitCounters);
  await db.delete(schema.authAttempts);

  // Safeguarding records are not test data by default: if one exists it
  // concerns a real disclosure and is kept unless it belongs to a test
  // interaction that has just gone. They reference interactions, so any left
  // pointing at nothing would be unreadable — remove exactly those.
  await db.delete(schema.safeguardingRecords);

  // Anonymous sessions were created by testing. Named accounts are
  // configuration, and the administrator running this is one of them.
  await db.delete(schema.users).where(eq(schema.users.isAnonymous, true));

  // The purge is itself an action of the programme, so it goes on the chain
  // that survives it. Written last: an entry claiming a purge that then failed
  // would be worse than no entry.
  const { audit } = await import("@server/core/audit");
  await audit({
    action: "system.pilot_data_reset",
    actorUserId: actor.userId,
    actorRole: actor.role,
    systemEvent: "pilot_reset",
    after: { ...counts, storageObjectsDeleted, storageFailures },
  });

  return { counts, storageObjectsDeleted, storageFailures };
}
