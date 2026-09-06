import { handle } from "@server/core/api";
import { badRequest } from "@server/core/errors";
import { env } from "@server/core/env";
import { getWeather, PROVINCE_CENTROIDS } from "@server/ai/tools/weather";
import { normaliseProvince, PROVINCES } from "@server/db/reference/agriculture";

/**
 * Seven-day weather for a province (FR-AG-06), rendered in plain language, with a seasonal
 * fallback when the forecast service cannot be reached. Public reference data.
 * `?province=Kongo-Central&days=7`
 */
export const GET = handle({ limit: "default" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const input = q.get("province");
  const province = normaliseProvince(input);
  if (input && !province) throw badRequest(`Province inconnue : ${input}`, { provinces: PROVINCES });
  const days = q.get("days") ? Number(q.get("days")) : 7;
  if (!Number.isFinite(days) || days < 1 || days > 10) throw badRequest("Le nombre de jours doit être compris entre 1 et 10");

  const weather = await getWeather(province ?? "Kinshasa", { days, offline: env.isTest || q.get("offline") === "1" });
  return { weather, centroid: PROVINCE_CENTROIDS[weather.province] ?? null };
});
