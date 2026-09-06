import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { SESSION_COOKIE, cookieOptions, encodeSession, verifyPin } from "@server/core/auth";
import { unauthorized } from "@server/core/errors";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";
import { publicUser } from "@server/core/users";

const Body = z.union([
  z.object({ phone: z.string().min(6).max(32), pin: z.string().min(4).max(12) }),
  z.object({ anonymous: z.literal(true), language: z.enum(["fr", "ln", "kg", "sw", "lua"]).default("fr"), province: z.string().max(120).optional(), consent: z.boolean().default(true) }),
]);

/** Phone + PIN login for registered users, or an anonymous citizen session (voice-first, no account needed). */
export const POST = handle({}, async ({ db, json, ip }) => {
  const body = await json(Body);
  let user: typeof schema.users.$inferSelect;
  if ("anonymous" in body) {
    [user] = await db
      .insert(schema.users)
      .values({ isAnonymous: true, role: "citizen", languagePreference: body.language, province: body.province ?? null, consentStatus: body.consent ? "granted" : "declined", lastActivityAt: new Date() })
      .returning();
  } else {
    const [found] = await db.select().from(schema.users).where(eq(schema.users.phone, body.phone));
    if (!found || !verifyPin(body.pin, found.pinHash)) {
      await audit({ action: "auth.login_failed", ip, after: { phone: body.phone.slice(-4) } });
      throw unauthorized("Numéro ou code PIN incorrect");
    }
    user = found;
    await db.update(schema.users).set({ lastActivityAt: new Date() }).where(eq(schema.users.id, user.id));
  }
  const token = encodeSession({ userId: user.id, role: user.role, language: user.languagePreference, name: user.name, province: user.province, anonymous: user.isAnonymous });
  await audit({ action: "auth.login", actorUserId: user.id, actorRole: user.role, ip });
  const res = NextResponse.json({ user: publicUser(user), token });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
});

