import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { SESSION_COOKIE, cookieOptions, encodeSession, hashPin, needsRehash, verifyPin } from "@server/core/auth";
import { ApiError, unauthorized } from "@server/core/errors";
import { checkLockout, clearFailures, recordFailure } from "@server/core/lockout";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";
import { publicUser } from "@server/core/users";

const Body = z.union([
  z.object({ phone: z.string().min(6).max(32), pin: z.string().min(4).max(12) }),
  z.object({ anonymous: z.literal(true), language: z.enum(["fr", "ln", "kg", "sw", "lua"]).default("fr"), province: z.string().max(120).optional(), consent: z.boolean().default(true) }),
]);

function locked(retryAfterSeconds: number): ApiError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new ApiError(429, `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`, "account_locked", {
    retryAfterSeconds,
  });
}

/** Phone + PIN login for registered users, or an anonymous citizen session (voice-first, no account needed). */
export const POST = handle({ limit: "auth" }, async ({ db, json, ip }) => {
  const body = await json(Body);
  let user: typeof schema.users.$inferSelect;

  if ("anonymous" in body) {
    [user] = await db
      .insert(schema.users)
      .values({ isAnonymous: true, role: "citizen", languagePreference: body.language, province: body.province ?? null, consentStatus: body.consent ? "granted" : "declined", lastActivityAt: new Date() })
      .returning();
  } else {
    // Two counters: the account under attack, and the address doing the attacking.
    const byAddress = await checkLockout(db, "ip", ip ?? "");
    if (byAddress.locked) throw locked(byAddress.retryAfterSeconds);
    const byAccount = await checkLockout(db, "phone", body.phone);
    if (byAccount.locked) throw locked(byAccount.retryAfterSeconds);

    const [found] = await db.select().from(schema.users).where(eq(schema.users.phone, body.phone));
    if (!found || found.status !== "active" || !verifyPin(body.pin, found.pinHash)) {
      const account = await recordFailure(db, "phone", body.phone);
      const address = await recordFailure(db, "ip", ip ?? "");
      await audit({ action: "auth.login_failed", ip, after: { phone: body.phone.slice(-4), failures: account.failures } });
      if (account.locked || address.locked) throw locked(Math.max(account.retryAfterSeconds, address.retryAfterSeconds));
      throw unauthorized("Numéro ou code PIN incorrect");
    }

    user = found;
    await clearFailures(db, "phone", body.phone);
    await clearFailures(db, "ip", ip ?? "");
    // A PIN set before the work factor was raised is upgraded on the next
    // successful sign-in, which is the only moment the plaintext is available.
    const patch: Partial<typeof schema.users.$inferInsert> = { lastActivityAt: new Date() };
    if (needsRehash(found.pinHash)) patch.pinHash = hashPin(body.pin);
    await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id));
  }

  const token = encodeSession({ userId: user.id, role: user.role, language: user.languagePreference, name: user.name, province: user.province, anonymous: user.isAnonymous });
  await audit({ action: "auth.login", actorUserId: user.id, actorRole: user.role, ip });
  const res = NextResponse.json({ user: publicUser(user), token });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
});
