import { z } from "zod";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { ApiError } from "@/lib/core/errors";
import { stepUpStatus, verifyCode } from "@/lib/core/mfa";

const Body = z.object({ code: z.string().min(6).max(8) });

/**
 * Verify a six-digit code. The first successful verification completes enrolment; later
 * ones are the step-up used by severity overrides, identifiable exports and break-glass.
 */
export const POST = handle({ auth: true, limit: "ai" }, async ({ user, json, ip }) => {
  const body = await json(Body);
  const result = await verifyCode(user.userId, body.code);
  await audit({
    action: result.ok ? "auth.mfa_verified" : "auth.mfa_failed",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "user",
    entityId: user.userId,
    after: { reason: result.reason ?? null },
    ip,
  });
  if (!result.ok) {
    throw new ApiError(401, result.reason === "not_enrolled" ? "Double authentification non configurée." : "Code invalide ou expiré.", "mfa_failed");
  }
  return { ...result, stepUp: await stepUpStatus(user.userId, user.role) };
});
