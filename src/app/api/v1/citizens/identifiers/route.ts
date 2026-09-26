import { z } from "zod";
import { handle } from "@server/core/api";
import { ApiError, badRequest } from "@server/core/errors";
import { confirmIdentifierClaim, openClaims, requestIdentifierClaim } from "@server/core/identifiers";
import { hashIdentifier, toE164 } from "@server/channels/session";

/**
 * Adding a second way to reach the same citizen (FR-CH-40, SEC-04).
 *
 * A code is sent to the identifier being claimed and read back. Possession of
 * the number is the proof, because on a shared or recycled handset the word of
 * whoever is holding it is not.
 */
export const GET = handle({ auth: true, registered: true }, async ({ user }) => ({ claims: await openClaims(user.userId) }));

const Request = z.object({
  kind: z.enum(["msisdn", "whatsapp", "pwa_account", "ivr_caller"]),
  value: z.string().min(3).max(64),
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]).default("fr"),
  deliveredBy: z.enum(["voice", "sms"]).default("voice"),
});

export const POST = handle({ auth: true, registered: true, limit: "auth" }, async ({ user, json, ip }) => {
  const body = await json(Request);
  const valueHash = hashIdentifier(body.kind, body.value);
  // A web account cannot receive a spoken code; only phone-like identifiers can.
  const destination = body.kind === "pwa_account" ? null : toE164(body.value);
  if (!destination) throw badRequest("Ce type d'identifiant ne peut pas recevoir de code.");

  try {
    const issued = await requestIdentifierClaim({
      userId: user.userId,
      kind: body.kind,
      value: body.value,
      valueHash,
      destination,
      language: body.language,
      deliveredBy: body.deliveredBy,
      actorUserId: user.userId,
      ip,
    });
    return { claim: issued };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    if (reason === "identifier_already_linked") throw badRequest("Ce numéro est déjà lié à votre compte.");
    if (reason === "identifier_claimed_by_another_account") {
      // Never confirm whose account it is: that would turn this into a lookup service.
      throw new ApiError(409, "Ce numéro ne peut pas être ajouté. Demandez de l'aide à un agent.", "identifier_conflict");
    }
    throw err;
  }
});

const Confirm = z.object({ claimId: z.string().uuid(), code: z.string().min(4).max(8) });

export const PUT = handle({ auth: true, registered: true, limit: "auth" }, async ({ user, json, ip }) => {
  const body = await json(Confirm);
  const result = await confirmIdentifierClaim({ claimId: body.claimId, code: body.code, actorUserId: user.userId, ip });
  if (result.outcome === "linked") return { linked: true };

  const message: Record<Exclude<typeof result.outcome, "linked">, string> = {
    wrong_code: `Code incorrect. Il vous reste ${result.attemptsRemaining} essai(s).`,
    expired: "Ce code a expiré. Demandez-en un nouveau.",
    too_many_attempts: "Trop d'essais. Demandez un nouveau code.",
    unknown_claim: "Cette demande n'existe plus.",
  };
  throw new ApiError(result.outcome === "wrong_code" ? 400 : 410, message[result.outcome], result.outcome);
});
