import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle } from "@/lib/core/api";
import { schema } from "@/lib/db/client";
import { captureFollowUp, scheduleFollowUp } from "@/lib/ai/agents/workflow";
import { loadCaseScoped } from "../../_shared";

export const GET = handle<{ id: string }>({ permission: "case:read" }, async ({ db, user, params }) => {
  const c = await loadCaseScoped(db, params.id, user.role);
  const followUps = await db.select().from(schema.followUps).where(eq(schema.followUps.caseId, c.id)).orderBy(desc(schema.followUps.scheduledFor));
  return { followUps };
});

const Body = z
  .object({
    /** Schedule a future follow-up… */
    scheduledFor: z.string().datetime().optional(),
    channel: z.enum(["in_app", "sms", "whatsapp", "email"]).optional(),
    /** …or record what the citizen answered (voice or SMS). */
    followUpId: z.string().uuid().optional(),
    outcome: z.string().max(120).optional(),
    outcomeText: z.string().max(4000).optional(),
    status: z.enum(["captured", "unreachable", "cancelled"]).optional(),
  })
  .refine((b) => b.scheduledFor || b.outcome, { message: "Fournissez scheduledFor (programmation) ou outcome (résultat recueilli)." });

/** Schedule a follow-up, or capture the citizen's answer against the case. */
export const POST = handle<{ id: string }>({ permission: "case:write" }, async ({ db, user, params, json }) => {
  const body = await json(Body);
  const c = await loadCaseScoped(db, params.id, user.role);
  if (body.outcome) {
    const followUp = await captureFollowUp({
      caseId: c.id,
      followUpId: body.followUpId,
      outcome: body.outcome,
      outcomeText: body.outcomeText,
      status: body.status,
      channel: body.channel,
      actor: { userId: user.userId, role: user.role },
    });
    return { followUp, captured: true };
  }
  const followUp = await scheduleFollowUp({
    caseId: c.id,
    userId: c.userId,
    scheduledFor: new Date(body.scheduledFor as string),
    channel: body.channel,
  });
  return { followUp, captured: false };
});
