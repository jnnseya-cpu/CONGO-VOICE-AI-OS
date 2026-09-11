import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { ApiError } from "@server/core/errors";
import { stepUpStatus, verifyCode } from "@server/core/mfa";
import { checkLockout, clearFailures, recordFailure } from "@server/core/lockout";

const Body = z.object({ code: z.string().min(6).max(8) });

/**
 * Verify a six-digit code. The first successful verification completes enrolment; later
 * ones are the step-up used by severity overrides, identifiable exports and break-glass.
 */
export const POST = handle({ auth: true, limit: "auth" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);
  // A six-digit code is a million guesses, which an unthrottled attacker gets
  // through. Failures are counted against the account like a failed sign-in.
  const state = await checkLockout(db, "phone", `mfa:${user.userId}`);
  if (state.locked) {
    throw new ApiError(429, `Trop de codes incorrects. Réessayez dans ${Math.max(1, Math.ceil(state.retryAfterSeconds / 60))} minute(s).`, "mfa_locked", {
      retryAfterSeconds: state.retryAfterSeconds,
    });
  }
  const result = await verifyCode(user.userId, body.code);
  if (result.ok) await clearFailures(db, "phone", `mfa:${user.userId}`);
  else await recordFailure(db, "phone", `mfa:${user.userId}`);
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
