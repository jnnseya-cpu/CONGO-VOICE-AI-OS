import { z } from "zod";
import { handle } from "@server/core/api";
import { badRequest, forbidden } from "@server/core/errors";
import { countPilotData, resetPilotData } from "@server/core/reset";

/**
 * Clear the exchanges a pilot accumulated while it was being tested.
 *
 * Irreversible, and the confirmation is built around that. A word typed into a
 * box is a habit; somebody who has done it once does it again without reading.
 * So the caller must echo back the exact number of interactions that will be
 * destroyed, which is only knowable by asking first — the dry run is not a
 * convenience, it is the mechanism.
 *
 * Platform administrators only. A government administrator supervises the
 * service and does not get to erase its record of itself.
 */
const Body = z.object({
  /** True asks what would go. False requires `confirmCount` to match it exactly. */
  dryRun: z.boolean().default(true),
  /** The number of interactions the dry run reported, as a number. */
  confirmCount: z.number().int().nonnegative().optional(),
});

export const POST = handle({ permission: "admin:config", registered: true, limit: "auth" }, async ({ user, json, ip }) => {
  if (user.role !== "platform_admin") {
    throw forbidden("Seul un administrateur de la plateforme peut effacer les données d'essai.");
  }

  const body = await json(Body);
  const counts = await countPilotData();

  if (body.dryRun) {
    return {
      dryRun: true,
      counts,
      confirmWith: counts.interactions,
      note:
        "Rien n'a été supprimé. Pour exécuter, rappelez cette route avec dryRun=false et confirmCount égal au nombre d'échanges ci-dessus.",
    };
  }

  if (body.confirmCount !== counts.interactions) {
    // Not merely wrong: the count moved between the dry run and now, which
    // means somebody used the service in between and the operator is about to
    // delete something they have not seen.
    throw badRequest(
      `Confirmation incorrecte : ${counts.interactions} échange(s) seraient supprimés, ${body.confirmCount ?? "aucun nombre"} confirmé(s). Relancez l'aperçu.`,
    );
  }

  const outcome = await resetPilotData({ userId: user.userId, role: user.role });
  return {
    dryRun: false,
    ...outcome,
    ip,
    note:
      "Le journal d'audit est conservé : il est chaîné par hachage et constitue la preuve de ce que le programme a fait. La purge y est enregistrée.",
  };
});
