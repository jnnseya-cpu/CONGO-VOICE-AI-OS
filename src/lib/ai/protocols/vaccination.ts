/**
 * DRC Expanded Programme on Immunisation (PEV) calendar — a deterministic lookup table,
 * not a model output. Used by the vaccination_schedule protocol and by
 * GET /api/v1/health/vaccination-schedule.
 */
import type { LocalisedText } from "./types";
import { t } from "./definitions/shared";

export interface EpiVaccine {
  /** Stable code, also the answer option value of the protocol. */
  code: string;
  label: LocalisedText;
  /** Age at which the dose is due, in weeks from birth. */
  dueAtWeeks: number;
  protects: string;
}

export const EPI_CALENDAR: EpiVaccine[] = [
  { code: "bcg", label: t("BCG (tuberculose), à la naissance", "BCG (tuberculose), na mbotama", "BCG (tuberculose), na mbutuka", "BCG (kifua kikuu), wakati wa kuzaliwa", "BCG (tuberculose), padi muana ulelabu"), dueAtWeeks: 0, protects: "Tuberculose (formes graves)" },
  { code: "vpo0", label: t("VPO-0 (polio orale), à la naissance", "VPO-0 (polio ya monoko), na mbotama", "VPO-0 (polio ya munoko), na mbutuka", "VPO-0 (polio ya mdomo), wakati wa kuzaliwa", "VPO-0 (polio wa ku mukana), padi muana ulelabu"), dueAtWeeks: 0, protects: "Poliomyélite" },
  { code: "vpo1", label: t("VPO-1, à 6 semaines", "VPO-1, na poso 6", "VPO-1, na mposo 6", "VPO-1, wiki 6", "VPO-1, ku mbingu 6"), dueAtWeeks: 6, protects: "Poliomyélite" },
  { code: "penta1", label: t("Penta-1 (DTC-HepB-Hib), à 6 semaines", "Penta-1 (DTC-HepB-Hib), na poso 6", "Penta-1 (DTC-HepB-Hib), na mposo 6", "Penta-1 (DTC-HepB-Hib), wiki 6", "Penta-1 (DTC-HepB-Hib), ku mbingu 6"), dueAtWeeks: 6, protects: "Diphtérie, tétanos, coqueluche, hépatite B, Hib" },
  { code: "pcv1", label: t("PCV-1 (pneumocoque), à 6 semaines", "PCV-1 (pneumocoque), na poso 6", "PCV-1 (pneumocoque), na mposo 6", "PCV-1 (pneumococcus), wiki 6", "PCV-1 (pneumocoque), ku mbingu 6"), dueAtWeeks: 6, protects: "Pneumonie et méningite à pneumocoque" },
  { code: "rota1", label: t("Rota-1 (rotavirus), à 6 semaines", "Rota-1 (rotavirus), na poso 6", "Rota-1 (rotavirus), na mposo 6", "Rota-1 (rotavirus), wiki 6", "Rota-1 (rotavirus), ku mbingu 6"), dueAtWeeks: 6, protects: "Diarrhée à rotavirus" },
  { code: "vpo2", label: t("VPO-2, à 10 semaines", "VPO-2, na poso 10", "VPO-2, na mposo 10", "VPO-2, wiki 10", "VPO-2, ku mbingu 10"), dueAtWeeks: 10, protects: "Poliomyélite" },
  { code: "penta2", label: t("Penta-2, à 10 semaines", "Penta-2, na poso 10", "Penta-2, na mposo 10", "Penta-2, wiki 10", "Penta-2, ku mbingu 10"), dueAtWeeks: 10, protects: "Diphtérie, tétanos, coqueluche, hépatite B, Hib" },
  { code: "pcv2", label: t("PCV-2, à 10 semaines", "PCV-2, na poso 10", "PCV-2, na mposo 10", "PCV-2, wiki 10", "PCV-2, ku mbingu 10"), dueAtWeeks: 10, protects: "Pneumonie et méningite à pneumocoque" },
  { code: "rota2", label: t("Rota-2, à 10 semaines", "Rota-2, na poso 10", "Rota-2, na mposo 10", "Rota-2, wiki 10", "Rota-2, ku mbingu 10"), dueAtWeeks: 10, protects: "Diarrhée à rotavirus" },
  { code: "vpo3", label: t("VPO-3, à 14 semaines", "VPO-3, na poso 14", "VPO-3, na mposo 14", "VPO-3, wiki 14", "VPO-3, ku mbingu 14"), dueAtWeeks: 14, protects: "Poliomyélite" },
  { code: "penta3", label: t("Penta-3, à 14 semaines", "Penta-3, na poso 14", "Penta-3, na mposo 14", "Penta-3, wiki 14", "Penta-3, ku mbingu 14"), dueAtWeeks: 14, protects: "Diphtérie, tétanos, coqueluche, hépatite B, Hib" },
  { code: "pcv3", label: t("PCV-3, à 14 semaines", "PCV-3, na poso 14", "PCV-3, na mposo 14", "PCV-3, wiki 14", "PCV-3, ku mbingu 14"), dueAtWeeks: 14, protects: "Pneumonie et méningite à pneumocoque" },
  { code: "vpi", label: t("VPI (polio injectable), à 14 semaines", "VPI (polio ya tonga), na poso 14", "VPI (polio ya tonga), na mposo 14", "VPI (polio ya sindano), wiki 14", "VPI (polio wa lushingu), ku mbingu 14"), dueAtWeeks: 14, protects: "Poliomyélite" },
  { code: "var1", label: t("VAR-1 (rougeole), à 9 mois", "VAR-1 (rougeole), na sanza 9", "VAR-1 (rougeole), na ngonda 9", "VAR-1 (surua), miezi 9", "VAR-1 (rougeole), ku ngondo 9"), dueAtWeeks: 39, protects: "Rougeole" },
  { code: "vaa", label: t("VAA (fièvre jaune), à 9 mois", "VAA (fièvre jaune), na sanza 9", "VAA (fièvre jaune), na ngonda 9", "VAA (homa ya manjano), miezi 9", "VAA (fièvre jaune), ku ngondo 9"), dueAtWeeks: 39, protects: "Fièvre jaune" },
  { code: "var2", label: t("VAR-2 (rougeole, 2ᵉ dose), à 15 mois", "VAR-2 (rougeole, dose 2), na sanza 15", "VAR-2 (rougeole, dose 2), na ngonda 15", "VAR-2 (surua, dozi ya pili), miezi 15", "VAR-2 (rougeole, dose 2), ku ngondo 15"), dueAtWeeks: 65, protects: "Rougeole" },
];

export const EPI_CODES = EPI_CALENDAR.map((v) => v.code);

/** Tetanus-diphtheria doses recommended for women of childbearing age and pregnant women. */
export const TD_SCHEDULE_FR = [
  "Td-1 : au premier contact ou à la première consultation prénatale.",
  "Td-2 : au moins 4 semaines après Td-1.",
  "Td-3 : au moins 6 mois après Td-2.",
  "Td-4 : au moins 1 an après Td-3.",
  "Td-5 : au moins 1 an après Td-4 — la protection couvre alors toute la vie féconde.",
];

export interface VaccinationStatus {
  ageWeeks: number;
  ageMonths: number;
  due: EpiVaccine[];
  overdue: EpiVaccine[];
  upcoming: EpiVaccine[];
  received: string[];
  upToDate: boolean;
}

/** Pure lookup: which doses are due, overdue or still to come at this age (FR-HE-13). */
export function vaccinationStatus(ageMonths: number, received: string[] = []): VaccinationStatus {
  const ageWeeks = Math.round(ageMonths * 4.345);
  const has = new Set(received.map((c) => c.toLowerCase()));
  const due: EpiVaccine[] = [];
  const overdue: EpiVaccine[] = [];
  const upcoming: EpiVaccine[] = [];
  for (const v of EPI_CALENDAR) {
    if (has.has(v.code)) continue;
    if (ageWeeks >= v.dueAtWeeks + 4) overdue.push(v);
    else if (ageWeeks >= v.dueAtWeeks) due.push(v);
    else upcoming.push(v);
  }
  return { ageWeeks, ageMonths, due, overdue, upcoming, received: [...has], upToDate: due.length === 0 && overdue.length === 0 };
}
