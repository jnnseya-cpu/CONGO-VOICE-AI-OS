import { z } from "zod";
import { handle } from "@/lib/core/api";
import { aiGateway } from "@/lib/ai/gateway";

const Body = z.object({ text: z.string().min(1).max(2000), language: z.enum(["fr", "ln", "kg", "sw", "lua"]).default("fr") });

/** Spoken version of a text. 204 means: use on-device speech synthesis. */
export const POST = handle({ permission: "interaction:create", limit: "ai" }, async ({ json }) => {
  const body = await json(Body);
  const speech = await aiGateway().synthesize({ text: body.text, language: body.language });
  if (!speech) return new Response(null, { status: 204 });
  return new Response(new Uint8Array(speech.audio), { headers: { "Content-Type": speech.mimeType, "Cache-Control": "private, max-age=600" } });
});
