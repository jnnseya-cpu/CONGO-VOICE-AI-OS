import { handle } from "@server/core/api";
import { HEALTH_PROTOCOLS } from "@server/ai/protocols/definitions";
import { badRequest } from "@server/core/errors";
import type { LanguageCode } from "@server/db/schema";

const LANGS: LanguageCode[] = ["fr", "ln", "kg", "sw", "lua"];

/**
 * Questionnaires for health workers: the questions of every approved protocol in one language,
 * so a triage can be completed offline on a device. Outcomes and severity stay server-side.
 */
export const GET = handle({ permission: "dashboard:health" }, async ({ req }) => {
  const language = (req.nextUrl.searchParams.get("language") ?? "fr") as LanguageCode;
  if (!LANGS.includes(language)) throw badRequest("Langue inconnue");
  return {
    language,
    protocols: HEALTH_PROTOCOLS.map((p) => ({
      id: p.id,
      version: p.version,
      title: p.title,
      entry: p.entry,
      citations: p.citations,
      questions: Object.values(p.questions).map((q) => ({
        id: q.id,
        type: q.type,
        optional: Boolean(q.optional),
        ask: q.ask[language] ?? q.ask.fr,
        options: q.options?.map((o) => ({ value: o.value, label: o.label[language] ?? o.label.fr })) ?? null,
        next: q.next ?? null,
      })),
    })),
  };
});
