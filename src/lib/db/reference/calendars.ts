/**
 * Programme calendars: the national immunisation schedule (PEV/EPI), antenatal contacts,
 * the seasonal planting windows used for reminders, and the school examination dates.
 *
 * ⚠ REFERENCE DATA TO VALIDATE — the immunisation schedule follows the DRC Programme
 * Élargi de Vaccination and the WHO 2016 antenatal model; both must be confirmed against
 * the current national guidance before reminders are sent at scale. Reminders never give
 * a dose or a medical instruction: they say when and where to go.
 */

export interface VaccineDose {
  /** Stable key used in schedules and reports. */
  key: string;
  /** Citizen-facing label, French canonical. */
  label: string;
  /** Age at which the dose is due, in days from birth. */
  ageDays: number;
  antigens: string[];
}

/** DRC Programme Élargi de Vaccination — routine infant schedule. */
export const EPI_SCHEDULE: VaccineDose[] = [
  { key: "birth", label: "BCG et polio à la naissance", ageDays: 0, antigens: ["BCG", "VPO-0"] },
  { key: "week6", label: "1re série (6 semaines)", ageDays: 42, antigens: ["DTC-HepB-Hib 1", "VPO 1", "PCV13 1", "Rota 1"] },
  { key: "week10", label: "2e série (10 semaines)", ageDays: 70, antigens: ["DTC-HepB-Hib 2", "VPO 2", "PCV13 2", "Rota 2"] },
  { key: "week14", label: "3e série (14 semaines)", ageDays: 98, antigens: ["DTC-HepB-Hib 3", "VPO 3", "PCV13 3", "VPI"] },
  { key: "month9", label: "Rougeole et fièvre jaune (9 mois)", ageDays: 274, antigens: ["VAR 1", "VAA"] },
  { key: "month15", label: "Rappel rougeole (15 mois)", ageDays: 457, antigens: ["VAR 2"] },
];

/** Reminder sent this many days before the due date. */
export const VACCINATION_LEAD_DAYS = 3;

/** WHO 2016 antenatal care model: eight contacts, in weeks of gestation. */
export const ANC_CONTACTS: Array<{ key: string; label: string; gestationWeeks: number }> = [
  { key: "anc1", label: "1er contact prénatal", gestationWeeks: 12 },
  { key: "anc2", label: "2e contact prénatal", gestationWeeks: 20 },
  { key: "anc3", label: "3e contact prénatal", gestationWeeks: 26 },
  { key: "anc4", label: "4e contact prénatal", gestationWeeks: 30 },
  { key: "anc5", label: "5e contact prénatal", gestationWeeks: 34 },
  { key: "anc6", label: "6e contact prénatal", gestationWeeks: 36 },
  { key: "anc7", label: "7e contact prénatal", gestationWeeks: 38 },
  { key: "anc8", label: "8e contact prénatal", gestationWeeks: 40 },
];

/** Days before an examination at which a revision nudge is sent. */
export const REVISION_LEAD_DAYS = [30, 14, 7, 2];

export const EXAM_LABELS: Record<string, string> = {
  tenafep: "TENAFEP",
  examen_etat: "Examen d'État",
  none: "vos évaluations",
};

/**
 * Sowing windows per province and crop (month/day, southern and equatorial seasons).
 * Used to seed `planting_calendars` and to schedule planting reminders.
 */
export interface SowWindow {
  province: string;
  crop: string;
  windows: Array<{ from: string; to: string; label: string }>;
  notes?: string;
}

export const PLANTING_CALENDAR: SowWindow[] = [
  {
    province: "Kongo-Central",
    crop: "manioc",
    windows: [
      { from: "10-01", to: "11-30", label: "Saison A (pluies d'octobre)" },
      { from: "03-01", to: "04-15", label: "Saison B (pluies de mars)" },
    ],
    notes: "Boutures saines de 25 cm, variétés tolérantes à la mosaïque.",
  },
  {
    province: "Kongo-Central",
    crop: "maïs",
    windows: [
      { from: "09-15", to: "10-31", label: "Saison A" },
      { from: "02-15", to: "03-31", label: "Saison B" },
    ],
  },
  {
    province: "Kinshasa",
    crop: "maïs",
    windows: [
      { from: "09-15", to: "10-31", label: "Saison A" },
      { from: "02-15", to: "03-31", label: "Saison B" },
    ],
  },
  {
    province: "Kasaï-Oriental",
    crop: "maïs",
    windows: [{ from: "09-20", to: "11-15", label: "Saison des pluies" }],
  },
  {
    province: "Kasaï-Oriental",
    crop: "manioc",
    windows: [{ from: "10-01", to: "12-15", label: "Saison des pluies" }],
  },
  {
    province: "Haut-Katanga",
    crop: "maïs",
    windows: [{ from: "11-01", to: "12-15", label: "Saison unique (novembre–décembre)" }],
    notes: "Semis après 30 mm de pluies cumulées sur trois jours.",
  },
  {
    province: "Nord-Kivu",
    crop: "haricot",
    windows: [
      { from: "02-15", to: "03-31", label: "Saison B" },
      { from: "09-01", to: "10-15", label: "Saison A" },
    ],
  },
  {
    province: "Nord-Kivu",
    crop: "pomme de terre",
    windows: [
      { from: "02-01", to: "03-15", label: "Saison B" },
      { from: "08-15", to: "09-30", label: "Saison A" },
    ],
  },
  {
    province: "Tshopo",
    crop: "riz",
    windows: [{ from: "03-01", to: "04-30", label: "Saison équatoriale" }],
  },
];

/** Reminder sent this many days before a sowing window opens. */
export const PLANTING_LEAD_DAYS = 10;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

/** Due dates of every remaining dose for a child born on `dob`. */
export function vaccinationDueDates(dob: Date, from: Date = new Date()): Array<{ dose: VaccineDose; dueAt: Date; remindAt: Date }> {
  return EPI_SCHEDULE.map((dose) => {
    const dueAt = addDays(dob, dose.ageDays);
    return { dose, dueAt, remindAt: addDays(dueAt, -VACCINATION_LEAD_DAYS) };
  }).filter((d) => d.remindAt.getTime() > from.getTime());
}

/** Due dates of the remaining antenatal contacts, from the last menstrual period. */
export function ancDueDates(lmp: Date, from: Date = new Date()): Array<{ contact: (typeof ANC_CONTACTS)[number]; dueAt: Date; remindAt: Date }> {
  return ANC_CONTACTS.map((contact) => {
    const dueAt = addDays(lmp, contact.gestationWeeks * 7);
    return { contact, dueAt, remindAt: addDays(dueAt, -3) };
  }).filter((d) => d.remindAt.getTime() > from.getTime());
}

/** Next sowing window opening for a province and crop. */
export function nextSowWindow(province: string, crop: string, from: Date = new Date()): { opensAt: Date; label: string; remindAt: Date } | null {
  const entry = PLANTING_CALENDAR.find((p) => p.province === province && p.crop === crop);
  if (!entry) return null;
  const candidates: Array<{ opensAt: Date; label: string }> = [];
  for (const year of [from.getUTCFullYear(), from.getUTCFullYear() + 1]) {
    for (const w of entry.windows) {
      const [month, day] = w.from.split("-").map(Number);
      candidates.push({ opensAt: new Date(Date.UTC(year, month - 1, day)), label: w.label });
    }
  }
  const next = candidates
    .filter((c) => addDays(c.opensAt, -PLANTING_LEAD_DAYS).getTime() > from.getTime())
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime())[0];
  return next ? { ...next, remindAt: addDays(next.opensAt, -PLANTING_LEAD_DAYS) } : null;
}

/** Revision nudges before an examination. */
export function revisionNudges(examDate: Date, from: Date = new Date()): Array<{ remindAt: Date; daysLeft: number }> {
  return REVISION_LEAD_DAYS.map((daysLeft) => ({ remindAt: addDays(examDate, -daysLeft), daysLeft })).filter((n) => n.remindAt.getTime() > from.getTime());
}
