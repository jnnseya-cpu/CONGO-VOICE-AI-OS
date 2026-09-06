import { eq } from "drizzle-orm";
import { handle } from "@/lib/core/api";
import { audit } from "@/lib/core/audit";
import { notFound } from "@/lib/core/errors";
import { schema } from "@/lib/db/client";
import { beginEnrolment, mfaRequiredFor, stepUpStatus } from "@/lib/core/mfa";

/** Current MFA state for the signed-in user. */
export const GET = handle({ auth: true }, async ({ db, user }) => {
  const [u] = await db.select({ mfaEnabled: schema.users.mfaEnabled }).from(schema.users).where(eq(schema.users.id, user.userId));
  if (!u) throw notFound();
  return { enabled: u.mfaEnabled, required: mfaRequiredFor(user.role), stepUp: await stepUpStatus(user.userId, user.role) };
});

/**
 * Start TOTP enrolment (RFC 6238). Returns the shared secret and the otpauth:// URI once;
 * enrolment only completes when a valid code is posted to /auth/mfa/verify.
 */
export const POST = handle({ auth: true }, async ({ db, user, ip }) => {
  const [u] = await db.select({ phone: schema.users.phone, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, user.userId));
  if (!u) throw notFound();
  const account = u.phone ?? u.name ?? user.userId;
  const { secret, otpauthUri } = await beginEnrolment(user.userId, account);
  await audit({ action: "auth.mfa_enrolment_started", actorUserId: user.userId, actorRole: user.role, entityType: "user", entityId: user.userId, ip });
  return { secret, otpauthUri, digits: 6, periodSeconds: 30, algorithm: "SHA1" };
});
