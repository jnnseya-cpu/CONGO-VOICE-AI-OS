import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import { EPI_CALENDAR, TD_SCHEDULE_FR, vaccinationStatus } from "@/lib/ai/protocols/vaccination";
import type { LanguageCode } from "@/lib/db/schema";

const LANGS: LanguageCode[] = ["fr", "ln", "kg", "sw", "lua"];

/**
 * DRC EPI calendar lookup (FR-HE-13). Deterministic table, no model involved.
 * `ageMonths` and the already received doses give what is due, overdue and upcoming.
 */
export const GET = handle({ auth: true }, async ({ req }) => {
  const params = req.nextUrl.searchParams;
  const language = (params.get("language") ?? "fr") as LanguageCode;
  if (!LANGS.includes(language)) throw badRequest("Langue inconnue");
  const ageParam = params.get("ageMonths");
  const received = params.get("received")?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) ?? [];
  const calendar = EPI_CALENDAR.map((v) => ({ code: v.code, label: v.label[language], dueAtWeeks: v.dueAtWeeks, protects: v.protects }));
  if (ageParam === null) return { calendar, tetanusSchedule: TD_SCHEDULE_FR, citations: ["KB-HE-VACC-01"] };
  const ageMonths = Number(ageParam);
  if (!Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 1400) throw badRequest("ageMonths invalide");
  const status = vaccinationStatus(ageMonths, received);
  const render = (list: typeof EPI_CALENDAR) => list.map((v) => ({ code: v.code, label: v.label[language], dueAtWeeks: v.dueAtWeeks, protects: v.protects }));
  return {
    ageMonths: status.ageMonths,
    ageWeeks: status.ageWeeks,
    upToDate: status.upToDate,
    overdue: render(status.overdue),
    due: render(status.due),
    upcoming: render(status.upcoming),
    received: status.received,
    tetanusSchedule: TD_SCHEDULE_FR,
    citations: ["KB-HE-VACC-01"],
  };
});
