/**
 * Reference data loader.
 *
 * Geography, the referral directory, the planting calendar and the notification template
 * catalogue are reference data, not demo data: they are loaded on every environment,
 * including production, and the loader is idempotent so it can be re-run after an update.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { getDb, schema } from "../client";
import { PROVINCES, GEOGRAPHY_STATS } from "./geography";
import { SERVICE_DIRECTORY } from "./service-directory";
import { PLANTING_CALENDAR } from "./calendars";
import { NOTIFICATION_TEMPLATES } from "./notification-templates";
import type { LanguageCode } from "../schema";

export * from "./geography";
export * from "./service-directory";
export * from "./calendars";
export * from "./notification-templates";

export interface ReferenceSeedResult {
  provinces: number;
  territories: number;
  services: number;
  plantingCalendars: number;
  templates: number;
  skipped: string[];
}

/** Load (or top up) every reference table. Safe to call repeatedly. */
export async function seedReferenceData(log: (m: string) => void = () => {}): Promise<ReferenceSeedResult> {
  const db = await getDb();
  const result: ReferenceSeedResult = { provinces: 0, territories: 0, services: 0, plantingCalendars: 0, templates: 0, skipped: [] };

  // Provinces and territories -------------------------------------------------------------
  const [{ n: provinceCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.provinces);
  if (provinceCount === 0) {
    for (const p of PROVINCES) {
      await db.insert(schema.provinces).values({ code: p.code, name: p.name, capital: p.capital }).onConflictDoNothing();
      result.provinces++;
      for (const t of p.territories) {
        await db.insert(schema.territories).values({ provinceCode: p.code, name: t.name, type: t.type });
        result.territories++;
      }
    }
    log(`Géographie : ${result.provinces} provinces, ${result.territories} entités (${GEOGRAPHY_STATS.status}).`);
  } else {
    result.skipped.push("provinces");
  }

  // Service directory ---------------------------------------------------------------------
  const [{ n: serviceCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.serviceDirectory);
  if (serviceCount === 0) {
    for (const s of SERVICE_DIRECTORY) {
      await db.insert(schema.serviceDirectory).values({
        type: s.type,
        name: s.name,
        province: s.province,
        territory: s.territory ?? null,
        healthZone: s.healthZone ?? null,
        phone: s.phone ?? null,
        notes: s.notes ?? null,
      });
      result.services++;
    }
    log(`Annuaire de services : ${result.services} structures de référence.`);
  } else {
    result.skipped.push("service_directory");
  }

  // Planting calendars --------------------------------------------------------------------
  const [{ n: calendarCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.plantingCalendars);
  if (calendarCount === 0) {
    for (const c of PLANTING_CALENDAR) {
      await db.insert(schema.plantingCalendars).values({
        province: c.province,
        crop: c.crop,
        sowWindows: c.windows,
        notes: c.notes ?? null,
        source: "Calendrier cultural programme — à valider",
      });
      result.plantingCalendars++;
    }
    log(`Calendriers culturaux : ${result.plantingCalendars} entrées.`);
  } else {
    result.skipped.push("planting_calendars");
  }

  // Notification templates in the five languages ------------------------------------------
  const [{ n: templateCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notificationTemplates);
  if (templateCount === 0) {
    const languages: LanguageCode[] = ["fr", "ln", "kg", "sw", "lua"];
    for (const t of NOTIFICATION_TEMPLATES) {
      for (const language of languages) {
        const text = t.text[language];
        await db.insert(schema.notificationTemplates).values({
          key: t.key,
          channel: t.channel,
          language,
          module: t.module,
          riskLevel: t.riskLevel ?? null,
          sensitivity: t.sensitivity,
          title: text.title,
          body: text.body,
          status: "approved",
        });
        result.templates++;
      }
    }
    log(`Modèles de notification : ${result.templates} entrées (${NOTIFICATION_TEMPLATES.length} clés × 5 langues).`);
  } else {
    result.skipped.push("notification_templates");
  }

  return result;
}
