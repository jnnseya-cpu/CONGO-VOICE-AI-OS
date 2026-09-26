import { z } from "zod";
import { eq } from "drizzle-orm";
import { handle } from "@server/core/api";
import { badRequest, forbidden } from "@server/core/errors";
import { verifyPin } from "@server/core/auth";
import { SESSION_COOKIE, cookieOptions } from "@server/core/auth";
import { tombstoneUser } from "@server/core/privacy";
import { schema } from "@server/db/client";
import { NextResponse } from "next/server";

/**
 * Delete my own account.
 *
 * Erasure already existed, reachable only through the formal data-rights
 * request the help page describes — thirty days, handled by staff. That is the
 * right route for "send me everything you hold", and the wrong one for somebody
 * who wants to be gone now. A person who has decided to leave should not have
 * to ask permission and wait a month.
 *
 * It uses the same tombstone as the staff-processed path, so the guarantees are
 * identical: recordings and photographs are deleted from storage, the words of
 * every exchange are emptied, the identity becomes a token that cannot be
 * reversed, and the hash-chained audit log — which holds no personal text —
 * survives, because the record of what the programme did to whom must stay
 * provable after the who is gone.
 *
 * The PIN is required. A phone left unlocked on a table is the realistic threat
 * to an irreversible button, and re-authenticating is the only thing that
 * distinguishes the account's owner from whoever is holding the device.
 */
const Body = z.object({
  pin: z.string().min(4).max(12),
  /** Typed confirmation, so the button alone cannot do it. */
  confirm: z.literal("SUPPRIMER"),
});

export const POST = handle({ auth: true, registered: true, limit: "auth" }, async ({ db, user, json, ip }) => {
  const body = await json(Body);

  const [account] = await db.select().from(schema.users).where(eq(schema.users.id, user.userId));
  if (!account) throw forbidden();
  if (!verifyPin(body.pin, account.pinHash)) throw badRequest("Code PIN incorrect.");

  // The last platform administrator cannot delete themselves: it would leave
  // the deployment with no way to appoint anyone, which is the deadlock the
  // bootstrap endpoint exists to break and refuses to break twice.
  if (account.role === "platform_admin") {
    const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "platform_admin"));
    const others = admins.filter((a) => a.id !== user.userId && a.id);
    if (others.length === 0) {
      throw badRequest(
        "Vous êtes le seul administrateur de la plateforme. Nommez un autre administrateur avant de supprimer ce compte.",
      );
    }
  }

  const result = await tombstoneUser(user.userId, { userId: user.userId, role: user.role }, { ip });

  // The session is a signed token, so it outlives the row unless it is cleared.
  const res = NextResponse.json({
    deleted: true,
    ...result,
    message:
      "Votre compte est supprimé. Les enregistrements, les photos et le texte de vos échanges ont été effacés. Le journal d'audit conserve la trace des actions du programme, sans aucune donnée personnelle.",
  });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return res;
});
