import "server-only";
import { aiGateway } from "../gateway";
import { HealthAssessment } from "../schemas";
import { HEALTH_AGENT_SYSTEM, messageEnvelope } from "../prompts";
import { detectEmergencyTerms, sanitiseHealthGuidance } from "../safety";

export interface HealthContext {
  province?: string | null;
  ageHint?: string | null;
  history?: string | null;
}

export async function assessHealth(textFr: string, ctx: HealthContext, interactionId?: string): Promise<HealthAssessment & { safetyViolations: string[] }> {
  const r = await aiGateway().generateJson(
    {
      system: HEALTH_AGENT_SYSTEM,
      user: messageEnvelope(textFr, { province: ctx.province, historique: ctx.history }),
      schema: HealthAssessment,
      schemaName: "health_assessment",
      maxTokens: 2000,
    },
    { interactionId },
  );
  const a = { ...r.output };
  // Deterministic overrides: keyword danger signs always win over the model.
  const keywordFlags = detectEmergencyTerms(textFr);
  if (keywordFlags.length > 0) {
    a.emergencyFlags = Array.from(new Set([...a.emergencyFlags, ...keywordFlags]));
    a.severity = "critical";
    a.clinicReferral = "immediately";
  }
  const safety = sanitiseHealthGuidance(a.guidance);
  a.guidance = safety.sanitised || "Consultez le centre de santé le plus proche pour un avis adapté.";
  return { ...a, safetyViolations: safety.violations };
}
