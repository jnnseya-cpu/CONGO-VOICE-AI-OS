import { handle } from "@/lib/core/api";
import { badRequest } from "@/lib/core/errors";
import {
  CALENDAR_CROPS,
  calendarAdvice,
  normaliseProvince,
  plantingCalendars,
  PROVINCES,
  seasonFor,
  type CalendarCrop,
} from "@/lib/db/reference/agriculture";

/**
 * Planting calendars by province x crop (FR-AG-04). Public reference data.
 * `?province=Kwilu&crop=maïs` — omit `crop` for the whole province.
 */
export const GET = handle({ limit: "default" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const provinceInput = q.get("province");
  const province = normaliseProvince(provinceInput);
  if (provinceInput && !province) throw badRequest(`Province inconnue : ${provinceInput}`, { provinces: PROVINCES });

  const cropInput = q.get("crop");
  const crop = cropInput ? CALENDAR_CROPS.find((c) => c.toLowerCase() === cropInput.toLowerCase()) : null;
  if (cropInput && !crop) throw badRequest(`Culture inconnue : ${cropInput}`, { crops: CALENDAR_CROPS });

  const date = q.get("date") ? new Date(q.get("date") as string) : new Date();
  if (Number.isNaN(date.getTime())) throw badRequest("Date invalide");

  if (province && crop) return { calendar: calendarAdvice(province, crop as CalendarCrop, date) };
  if (province) {
    return {
      province,
      season: seasonFor(province, date),
      calendars: CALENDAR_CROPS.map((c) => calendarAdvice(province, c, date)),
    };
  }
  return { provinces: PROVINCES, crops: CALENDAR_CROPS, calendars: plantingCalendars().filter((c) => !crop || c.crop === crop) };
});
