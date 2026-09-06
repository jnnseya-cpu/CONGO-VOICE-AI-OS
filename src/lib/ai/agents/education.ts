import "server-only";
import { aiGateway } from "../gateway";
import { EducationAssessment } from "../schemas";
import { EDUCATION_AGENT_SYSTEM, messageEnvelope } from "../prompts";

export interface EducationContext {
  province?: string | null;
  ageHint?: string | null;
  history?: string | null;
}

export async function assessEducation(textFr: string, ctx: EducationContext, interactionId?: string): Promise<EducationAssessment> {
  const r = await aiGateway().generateJson(
    {
      system: EDUCATION_AGENT_SYSTEM,
      user: messageEnvelope(textFr, { province: ctx.province, age: ctx.ageHint, historique: ctx.history }),
      schema: EducationAssessment,
      schemaName: "education_assessment",
      maxTokens: 2500,
    },
    { interactionId },
  );
  return r.output;
}
