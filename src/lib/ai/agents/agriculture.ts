import "server-only";
import { aiGateway } from "../gateway";
import { AgricultureAssessment } from "../schemas";
import { AGRICULTURE_AGENT_SYSTEM, messageEnvelope } from "../prompts";
import { detectAgriUrgentTerms } from "../safety";
import type { ImageInput } from "../types";

export interface AgricultureContext {
  province?: string | null;
  season?: string | null;
  history?: string | null;
}

export async function assessAgriculture(textFr: string, ctx: AgricultureContext, images: ImageInput[], interactionId?: string): Promise<AgricultureAssessment> {
  const r = await aiGateway().generateJson(
    {
      system: AGRICULTURE_AGENT_SYSTEM,
      user: messageEnvelope(textFr || "(message vocal vide, seule une image est fournie)", {
        province: ctx.province,
        saison: ctx.season,
        historique: ctx.history,
        pieces_jointes: images.length ? `${images.length} image(s)` : null,
      }),
      schema: AgricultureAssessment,
      schemaName: "agriculture_assessment",
      images,
      maxTokens: 2000,
    },
    { interactionId },
  );
  const a = { ...r.output };
  if (detectAgriUrgentTerms(textFr).length > 0) {
    a.urgent = true;
    if (a.severity === "low" || a.severity === "medium") a.severity = "high";
  }
  return a;
}
