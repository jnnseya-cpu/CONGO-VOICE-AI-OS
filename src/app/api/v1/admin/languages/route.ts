import { z } from "zod";
import { handle } from "@server/core/api";
import { audit } from "@server/core/audit";
import { notifyRole } from "@server/core/notifications";
import { languageReadiness, recordLanguageQuality } from "@server/ai/language/gates";
import { LANGUAGES } from "@shared/types";

const MODULES = ["health", "agriculture", "education", "general"] as const;

/**
 * Which languages are live, in which modules, and why (AI-18, §6.5).
 *
 * The table an operator needs before saying a language is available, and the
 * one that explains why a citizen is getting menus instead of conversation.
 */
export const GET = handle({ permission: "admin:config" }, async () => {
  const rows = await languageReadiness(
    LANGUAGES.map((l) => l.code),
    [...MODULES],
  );
  return {
    readiness: rows,
    live: rows.filter((r) => r.mode === "full").length,
    scripted: rows.filter((r) => r.mode === "scripted").length,
    neverMeasured: rows.filter((r) => r.reason === "never_measured").length,
  };
});

const Measurement = z.object({
  language: z.enum(["fr", "ln", "kg", "sw", "lua"]),
  module: z.enum(MODULES),
  werClean: z.number().min(0).max(1).optional(),
  werField: z.number().min(0).max(1).optional(),
  intentAccuracy: z.number().min(0).max(1).optional(),
  emergencyRecall: z.number().min(0).max(1).optional(),
  ttsMos: z.number().min(1).max(5).optional(),
  languageIdAccuracy: z.number().min(0).max(1).optional(),
  sampleSize: z.number().int().min(0).default(0),
  source: z.string().max(64).default("evaluation"),
  notes: z.string().max(2000).optional(),
});

/**
 * Record an evaluation run. The verdict is derived here, not supplied: an
 * operator reports numbers, the gates decide what those numbers mean.
 */
export const POST = handle({ permission: "admin:config" }, async ({ user, json, ip }) => {
  const body = await json(Measurement);
  const status = await recordLanguageQuality({
    language: body.language,
    module: body.module,
    metrics: body,
    source: body.source,
    notes: body.notes ?? null,
  });

  await audit({
    action: status.mode === "full" ? "language.gate_passed" : "language.downgraded",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "language_quality",
    entityId: `${body.language}:${body.module}`,
    after: { mode: status.mode, failedGates: status.failedGates, sampleSize: body.sampleSize, source: body.source },
    ip,
  });

  // A language leaving service is an operational event, not a log line.
  if (status.mode === "scripted") {
    await notifyRole("platform_admin", {
      type: "alert",
      channel: "in_app",
      title: `Langue ramenée en mode scripté : ${body.language} / ${body.module}`,
      body: `Les seuils de qualité ne sont pas atteints : ${status.failedGates.join(" · ")}. Les réponses de ce module passent par les règles hors ligne jusqu'à une nouvelle évaluation.`,
      payload: { language: body.language, module: body.module, failedGates: status.failedGates },
      requiresAck: true,
      dedupeKey: `language-downgrade:${body.language}:${body.module}`,
    });
  }

  return { status };
});
