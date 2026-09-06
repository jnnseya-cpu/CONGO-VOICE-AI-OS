import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { emitEvent } from "@/lib/core/events";
import { forbidden, notFound } from "@/lib/core/errors";
import { hasPermission } from "@/lib/core/rbac";
import { schema } from "@/lib/db/client";
import { cancelReminders } from "@/lib/core/scheduler";

const PURPOSES = [
  "service",
  "reminders",
  "precise_location",
  "analytics",
  "research",
  "partner_sharing",
  "pregnancy_data",
  "child_profile",
  "cross_programme_referral",
] as const;

/**
 * Purpose-specific consent (CON-001..004).
 *
 * Each purpose is granted or revoked on its own, with the script version, the language and
 * the method used, and — when a caregiver answers for someone else — the proxy basis.
 * Consent is a record of an event: nothing is ever updated in place.
 */
export const GET = handle({ auth: true }, async ({ req, db, user }) => {
  const target = req.nextUrl.searchParams.get("userId") ?? user.userId;
  if (target !== user.userId && !hasPermission(user.role, "user:manage")) throw forbidden();
  const rows = await db.select().from(schema.consents).where(eq(schema.consents.userId, target)).orderBy(desc(schema.consents.occurredAt));
  const current: Record<string, (typeof rows)[number]> = {};
  for (const r of rows) if (!current[r.purpose]) current[r.purpose] = r;
  return {
    userId: target,
    current: Object.fromEntries(Object.entries(current).map(([p, r]) => [p, { status: r.status, version: r.version, language: r.language, method: r.method, occurredAt: r.occurredAt, proxy: r.proxy }])),
    history: rows,
  };
});

const Body = z.object({
  purpose: z.enum(PURPOSES),
  status: z.enum(["granted", "revoked"]),
  /** Version of the consent script that was actually read to the person. */
  version: z.string().max(16).default("1.0"),
  method: z.enum(["voice", "button", "ussd", "worker_assisted"]).default("voice"),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).optional(),
  /** Caregiver or proxy answering for someone else. */
  proxy: z
    .object({ present: z.string().max(120).optional(), onBehalfOf: z.string().max(120).optional(), basis: z.string().max(240).optional() })
    .optional(),
  evidenceUri: z.string().max(500).optional(),
  /** Workers may record consent for a citizen they are assisting. */
  userId: z.string().uuid().optional(),
});

export const POST = handle({ auth: true }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  const target = body.userId ?? user.userId;
  if (target !== user.userId && !hasPermission(user.role, "case:write")) throw forbidden();
  if (target !== user.userId && body.method !== "worker_assisted") {
    // A worker recording someone else's decision must say so.
    body.method = "worker_assisted";
  }
  const [profile] = await db.select({ language: schema.users.languagePreference }).from(schema.users).where(eq(schema.users.id, target));
  if (!profile) throw notFound();

  const [row] = await db
    .insert(schema.consents)
    .values({
      userId: target,
      purpose: body.purpose,
      status: body.status,
      version: body.version,
      method: body.method,
      language: body.language ?? profile.language,
      proxy: body.proxy ?? null,
      evidenceUri: body.evidenceUri ?? null,
    })
    .returning();

  // Revoking the "reminders" purpose stops everything already scheduled.
  let cancelledReminders = 0;
  if (body.purpose === "reminders" && body.status === "revoked") {
    cancelledReminders = (await cancelReminders(target)).length;
  }
  if (body.purpose === "service") {
    await db.update(schema.users).set({ consentStatus: body.status }).where(eq(schema.users.id, target));
  }

  await audit({
    action: `consent.${body.status}`,
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "consent",
    entityId: row.id,
    after: { purpose: body.purpose, status: body.status, version: body.version, method: body.method, proxy: Boolean(body.proxy), cancelledReminders },
    purpose: "consent_management",
    ip,
  });
  await emitEvent({
    type: `consent.${body.status}`,
    aggregateType: "user",
    aggregateId: target,
    classification: "confidential",
    actor: { type: target === user.userId ? "citizen" : "worker", id: user.userId },
    payload: { purpose: body.purpose, version: body.version, method: body.method, cancelledReminders },
  });
  return { consent: row, cancelledReminders };
});
