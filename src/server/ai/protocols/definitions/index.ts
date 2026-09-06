/** The approved protocol set. Adding a protocol here makes it available to triage and to the admin API. */
import type { HealthProtocol } from "../types";
import { adultFever, childFeverU5 } from "./fever";
import { coughBreathing } from "./respiratory";
import { diarrhoeaDehydration } from "./diarrhoea";
import { newbornDangerSigns, pregnancyDangerSigns } from "./maternal";
import { injuryBleeding } from "./injury";
import { malnutritionScreening } from "./nutrition";
import { vaccinationSchedule } from "./vaccination";
import { generalSymptomIntake } from "./general-intake";

export const HEALTH_PROTOCOLS: HealthProtocol[] = [
  childFeverU5,
  adultFever,
  coughBreathing,
  diarrhoeaDehydration,
  pregnancyDangerSigns,
  newbornDangerSigns,
  injuryBleeding,
  malnutritionScreening,
  vaccinationSchedule,
  generalSymptomIntake,
];

export const PROTOCOL_BY_ID: Record<string, HealthProtocol> = Object.fromEntries(HEALTH_PROTOCOLS.map((p) => [p.id, p]));

export type HealthProtocolId = (typeof HEALTH_PROTOCOLS)[number]["id"];

export function getProtocol(id: string): HealthProtocol | null {
  return PROTOCOL_BY_ID[id] ?? null;
}

export {
  adultFever,
  childFeverU5,
  coughBreathing,
  diarrhoeaDehydration,
  generalSymptomIntake,
  injuryBleeding,
  malnutritionScreening,
  newbornDangerSigns,
  pregnancyDangerSigns,
  vaccinationSchedule,
};
