import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { SESSION_COOKIE } from "@server/core/auth";
import { audit } from "@server/core/audit";
import { schema } from "@server/db/client";

/**
 * Clearing the cookie only stops the browser from sending the token; the token
 * itself stays valid wherever else it was copied. Moving the account's session
 * epoch forward is what actually withdraws it, everywhere, immediately.
 */
export const POST = handle({}, async ({ db, session, ip }) => {
  if (session && !session.anonymous) {
    await db.update(schema.users).set({ sessionEpoch: new Date() }).where(eq(schema.users.id, session.userId));
    await audit({ action: "auth.logout", actorUserId: session.userId, actorRole: session.role, ip });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
