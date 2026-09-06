/**
 * Agriculture Agent (FR-AG-01..10, AGR-001..005).
 *
 * The model extracts farm context and ranks hypotheses; every safety-bearing decision is
 * deterministic code here:
 *   - image quality gate before any vision call (AGR-002);
 *   - "possible match" wording and a second-photo request below the confidence threshold;
 *   - the chemical guard: no product without an authorised input_registry entry (AGR-003);
 *   - the notifiable list, extension-officer referral and zoonotic escalation;
 *   - season, planting calendar, market prices and weather, which come from data, never
 *     from the model.
 * Every recommendation cites at least one approved knowledge document.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { notifyRole } from "@/lib/core/notifications";
import { emitEvent } from "@/lib/core/events";
import { aiGateway } from "../gateway";
import { AgricultureFieldAssessment, type AgricultureAssessment, type AgriCandidate, type FarmContext } from "../schemas";
import { AGRICULTURE_AGENT_SYSTEM, messageEnvelope } from "../prompts";
import { detectAgriUrgentTerms } from "../safety";
import { knowledgePromptFragment, searchKnowledge, type KnowledgeHit } from "../knowledge";
import type { ImageInput } from "../types";
import { reviewEvidence, type EvidenceReview } from "../tools/image-quality";
import { guardChemicalAdvice, type ChemicalGuardResult } from "../tools/input-registry";
import { getPrices, renderPrices, type PriceQuote } from "../tools/market";
import { getWeather, type WeatherAnswer } from "../tools/weather";
import {
  calendarAdvice,
  ensureAgricultureReference,
  normaliseProvince,
  seasonFor,
  NOTIFIABLE_DEFAULT,
  CALENDAR_CROPS,
  type CalendarCrop,
  type NotifiableEntry,
} from "@/lib/db/reference/agriculture";

/** Below this top-1 probability the answer stays a "possible match" and asks for more evidence. */
export const CANDIDATE_CONFIDENT_THRESHOLD = 0.6;
/** Below this the case goes to a human extension officer regardless of urgency. */
export const EXTENSION_UNCERTAINTY_THRESHOLD = 0.4;

export interface AgricultureContext {
  province?: string | null;
  season?: string | null;
  history?: string | null;
  /** Additive: supplied by the orchestrator when available. */
  userId?: string | null;
  territory?: string | null;
  date?: Date;
  evidenceFileIds?: string[];
}

export interface TieredActions {
  noCost: string[];
  lowCost: string[];
  purchase: string[];
}

export interface ExtensionReferral {
  required: boolean;
  reasons: string[];
  role: "agri_officer";
  message: string | null;
}

export interface NotifiableMatch {
  key: string;
  label: string;
  kind: "crop" | "livestock";
}

export interface AgricultureAssessmentPlus extends AgricultureAssessment {
  /* Farm context (FR-AG-01) */
  farmContext: FarmContext;
  season: string;
  seasonCode: string;
  growthStage: string;
  affectedProportion: string;
  recentInputs: string;
  territory: string | null;
  /* Differential diagnosis (FR-AG-02) */
  candidates: Array<AgriCandidate & { wording: string }>;
  topProb: number;
  confident: boolean;
  missingEvidence: string[];
  secondPhotoRequested: boolean;
  /* Recommendations (FR-AG-03) */
  tieredActions: TieredActions;
  actionsToAvoid: string[];
  followUpCapture: string;
  /* Safety and escalation */
  isNotifiable: boolean;
  notifiable: NotifiableMatch[];
  zoonotic: { flagged: boolean; signs: string[] };
  extensionReferral: ExtensionReferral;
  chemicalGuard: { blocked: ChemicalGuardResult["blocked"]; products: string[]; referral: string | null };
  /* Evidence */
  evidenceQuality: {
    visionUsed: boolean;
    attachments: number;
    usable: number;
    videoOnly: boolean;
    summary: string;
    recaptureGuidance: string | null;
    exifNotes: string[];
    details: EvidenceReview["results"];
  };
  /* Data tools */
  citations: string[];
  prices: PriceQuote[] | null;
  weather: WeatherAnswer | null;
  calendar: ReturnType<typeof calendarAdvice> | null;
}

/* ------------------------------------------------------------------------------------------
 * Configuration: the notifiable list is editable in admin_config ("agri.notifiable")
 * ---------------------------------------------------------------------------------------- */

interface RawNotifiable {
  key?: unknown;
  label?: unknown;
  kind?: unknown;
  keywords?: unknown;
}

export async function notifiableList(): Promise<NotifiableEntry[]> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.adminConfig).where(eq(schema.adminConfig.key, "agri.notifiable"));
    const value = row?.value;
    if (Array.isArray(value)) {
      const parsed = (value as RawNotifiable[])
        .map((v) => ({
          key: String(v.key ?? v.label ?? ""),
          label: String(v.label ?? v.key ?? ""),
          kind: v.kind === "livestock" ? ("livestock" as const) : ("crop" as const),
          keywords: Array.isArray(v.keywords) ? v.keywords.map(String) : [String(v.label ?? v.key ?? "")],
        }))
        .filter((v) => v.key && v.label);
      if (parsed.length) return parsed;
    }
  } catch (err) {
    console.warn("[agriculture] notifiable config unavailable, using defaults", err);
  }
  return NOTIFIABLE_DEFAULT;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function matchNotifiable(list: NotifiableEntry[], haystack: string[]): NotifiableMatch[] {
  const hay = norm(haystack.join(" | "));
  const out: NotifiableMatch[] = [];
  for (const entry of list) {
    if (entry.keywords.some((k) => k.length >= 3 && hay.includes(norm(k)))) {
      out.push({ key: entry.key, label: entry.label, kind: entry.kind });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------
 * Zoonotic red flags (livestock intake)
 * ---------------------------------------------------------------------------------------- */

const ZOONOTIC_TERMS = [
  "rage",
  "chien qui mord",
  "morsure",
  "charbon",
  "anthrax",
  "avortement",
  "avortements",
  "brucellose",
  "tuberculose bovine",
  "lait cru",
  "viande d'animal malade",
  "manger un animal mort",
  "grippe aviaire",
  "mort brutale des poules",
  "personne malade aussi",
];

export function detectZoonoticSigns(text: string, modelSigns: string[]): string[] {
  const t = norm(text);
  const found = ZOONOTIC_TERMS.filter((k) => t.includes(norm(k)));
  return Array.from(new Set([...found, ...modelSigns.filter((s) => s.trim().length > 0)]));
}

const LIVESTOCK_TERMS = ["chèvre", "chevre", "mouton", "poule", "poulet", "volaille", "porc", "cochon", "vache", "bœuf", "boeuf", "bétail", "betail", "mbuzi", "kuku", "ngombe", "ntaba", "nsoso", "nguruwe", "lapin", "canard"];

export function isLivestockCase(text: string, cropOrAnimal: string): boolean {
  const t = norm(`${text} ${cropOrAnimal}`);
  return LIVESTOCK_TERMS.some((k) => t.includes(norm(k)));
}

/* ------------------------------------------------------------------------------------------
 * Main entry point
 * ---------------------------------------------------------------------------------------- */

export async function assessAgriculture(
  textFr: string,
  ctx: AgricultureContext,
  images: ImageInput[],
  interactionId?: string,
): Promise<AgricultureAssessmentPlus> {
  await ensureAgricultureReference();
  const date = ctx.date ?? new Date();
  const province = normaliseProvince(ctx.province) ?? ctx.province ?? null;
  const season = seasonFor(province, date);

  // 1. Evidence gate: never spend a vision call on an unusable photo (AGR-002).
  const evidence = reviewEvidence(images);
  const usableImages = evidence.usableIndexes.map((i) => images[i]);
  const visionUsed = usableImages.length > 0;

  // 2. Approved knowledge for this question.
  const kbQuery = `${textFr} ${province ?? ""}`.trim();
  const hits = await searchKnowledge("agriculture", kbQuery, 5);

  // 3. One model call: understanding, farm context, ranked candidates, tiered actions.
  const r = await aiGateway().generateJson(
    {
      system: AGRICULTURE_AGENT_SYSTEM,
      user: `${knowledgePromptFragment(hits)}\n${messageEnvelope(textFr || "(message vocal vide, seules des pièces jointes sont fournies)", {
        province,
        territoire: ctx.territory,
        saison: `${season.label} (${season.code})`,
        date: date.toISOString().slice(0, 10),
        historique: ctx.history,
        pieces_jointes: images.length ? evidence.summary : null,
        qualite_photo: evidence.recaptureGuidance ? "photo inexploitable, analyse visuelle impossible" : null,
      })}`,
      schema: AgricultureFieldAssessment,
      schemaName: "agriculture_field_assessment",
      images: usableImages,
      maxTokens: 2500,
    },
    { interactionId },
  );
  const m = r.output;

  // 4. Candidates: sorted, capped at three, worded as possible matches below threshold.
  const candidates = [...m.candidates]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map((c) => ({ ...c, probability: Number(c.probability.toFixed(2)) }));
  const topProb = candidates[0]?.probability ?? 0;
  const confident = topProb >= CANDIDATE_CONFIDENT_THRESHOLD;
  const worded = candidates.map((c, i) => ({
    ...c,
    wording:
      i === 0 && confident
        ? `Correspondance la plus probable : ${c.label} (${Math.round(c.probability * 100)} %). À confirmer sur le terrain.`
        : `Correspondance possible : ${c.label} (${Math.round(c.probability * 100)} %).`,
  }));

  const missingEvidence = [...m.missingEvidence];
  let secondPhotoRequested = false;
  if (!confident) {
    secondPhotoRequested = true;
    const ask = visionUsed
      ? "Envoyez une deuxième photo sous un autre angle (face inférieure des feuilles, ou l'animal entier puis la partie atteinte)."
      : "Envoyez une photo nette de la partie atteinte, prise à la lumière du jour et à environ 30 cm.";
    if (!missingEvidence.includes(ask)) missingEvidence.unshift(ask);
  }
  if (evidence.recaptureGuidance && !missingEvidence.includes(evidence.recaptureGuidance)) missingEvidence.push(evidence.recaptureGuidance);

  // 5. Deterministic urgency and severity.
  const urgentTerms = detectAgriUrgentTerms(textFr);
  const wideSpread = m.farmContext.affectedProportion === "plus_de_la_moitie" || m.farmContext.affectedProportion === "tout_le_champ";
  const livestock = isLivestockCase(textFr, m.farmContext.cropOrAnimal);
  const zoonoticSigns = detectZoonoticSigns(textFr, m.zoonoticSigns);
  const zoonotic = livestock && zoonoticSigns.length > 0;

  // 6. Notifiable pests and diseases.
  const list = await notifiableList();
  const notifiable = matchNotifiable(list, [textFr, ...candidates.map((c) => c.label), ...m.farmContext.symptoms]);
  const isNotifiable = notifiable.length > 0;

  const urgent = urgentTerms.length > 0 || wideSpread || zoonotic || isNotifiable;
  const severity: AgricultureAssessment["severity"] = zoonotic
    ? "critical"
    : urgent || isNotifiable
      ? "high"
      : m.issueType === "crop_disease" || m.issueType === "pest" || m.issueType === "livestock_illness"
        ? "medium"
        : "low";

  // 7. Chemical guard (AGR-003) on every tier that could name a product.
  const guardCrop = m.farmContext.cropOrAnimal;
  const guardIssue = candidates[0]?.label ?? m.issueType;
  const [noCost, lowCost, purchase] = await Promise.all([
    guardChemicalAdvice(m.noCostActions, { crop: guardCrop, issue: guardIssue }),
    guardChemicalAdvice(m.lowCostActions, { crop: guardCrop, issue: guardIssue }),
    guardChemicalAdvice(m.purchaseActions, { crop: guardCrop, issue: guardIssue }),
  ]);
  const guards = [noCost, lowCost, purchase];
  const blocked = guards.flatMap((g) => g.blocked);
  const products = guards.flatMap((g) => g.actions.map((a) => a.product?.name).filter((n): n is string => !!n));
  const tieredActions: TieredActions = {
    noCost: noCost.actions.map((a) => a.text),
    lowCost: lowCost.actions.map((a) => a.text),
    purchase: purchase.actions.map((a) => a.text),
  };
  if (blocked.length > 0 && guards[2].referral) {
    tieredActions.purchase = [...tieredActions.purchase.filter((t) => t !== guards[2].referral), guards[2].referral];
  }

  const actionsToAvoid = Array.from(new Set([...m.actionsToAvoid, ...guards.flatMap((g) => g.avoid)]));
  if (isNotifiable) actionsToAvoid.push("Ne déplacez pas de plants, de boutures ou d'animaux hors de la parcelle avant le passage de l'agent agricole.");

  // 8. Extension officer referral threshold.
  const referralReasons: string[] = [];
  if (isNotifiable) referralReasons.push(`Maladie ou ravageur à déclaration obligatoire : ${notifiable.map((n) => n.label).join(", ")}`);
  if (zoonotic) referralReasons.push("Signes pouvant concerner la santé humaine (zoonose)");
  if (wideSpread) referralReasons.push("Plus de la moitié de la parcelle ou du troupeau est touchée");
  if (urgentTerms.length > 0) referralReasons.push("Propagation rapide ou mortalité signalée");
  if (topProb < EXTENSION_UNCERTAINTY_THRESHOLD) referralReasons.push("Diagnostic à distance trop incertain");
  if (blocked.length > 0) referralReasons.push("Un produit a été évoqué sans correspondance homologuée vérifiée");
  const extensionReferral: ExtensionReferral = {
    required: referralReasons.length > 0,
    reasons: referralReasons,
    role: "agri_officer",
    message: referralReasons.length
      ? "Contactez l'agent agricole de votre secteur : il doit voir la parcelle ou les animaux avant toute décision d'achat ou de traitement."
      : null,
  };

  // 9. Data tools: prices, weather, planting calendar — never model-invented values.
  let prices: PriceQuote[] | null = null;
  let weather: WeatherAnswer | null = null;
  let calendar: ReturnType<typeof calendarAdvice> | null = null;
  if (m.issueType === "market_price") {
    const commodity = guessCommodity(textFr, m.farmContext.cropOrAnimal);
    prices = (await getPrices({ commodity, province, limit: 5 })).prices;
    if (prices.length === 0 && commodity) prices = (await getPrices({ province, limit: 5 })).prices;
  }
  if (m.issueType === "weather" || m.issueType === "planting_calendar") {
    weather = await getWeather(province, { date });
  }
  if (m.issueType === "planting_calendar" || m.issueType === "seed_selection") {
    const crop = matchCalendarCrop(m.farmContext.cropOrAnimal) ?? matchCalendarCrop(textFr);
    if (crop) calendar = calendarAdvice(province, crop, date);
  }

  // 10. Citations: every recommendation is backed by at least one approved document.
  const citations = await ensureCitations(m.citations, hits, `${m.issueType} ${guardCrop} ${candidates[0]?.label ?? ""}`);

  // 11. Compose the citizen-facing recommendation.
  const recommendation = composeRecommendation({
    worded,
    confident,
    tieredActions,
    extensionReferral,
    followUpCapture: m.followUpCapture,
    evidence,
    secondPhotoRequested,
    notifiable,
    zoonotic,
    prices,
    weather,
    calendar,
    citations,
  });

  const likelyDiagnosis = worded.length
    ? `${worded[0].wording}${worded[0].evidenceFor.length ? ` Indices retenus : ${worded[0].evidenceFor.join(", ")}.` : ""}${
        worded[0].evidenceAgainst.length ? ` Indices contraires ou manquants : ${worded[0].evidenceAgainst.join(", ")}.` : ""
      }`
    : "Les informations reçues ne permettent pas encore de proposer une hypothèse. Envoyez une photo nette et décrivez ce que vous observez.";

  // 12. Alerts: notifiable findings reach the extension network immediately.
  if (isNotifiable || zoonotic) {
    await raiseExtensionAlert({ province, territory: ctx.territory ?? null, interactionId, notifiable, zoonotic, crop: guardCrop, candidateLabel: candidates[0]?.label ?? null });
  }

  const confidence = Number(Math.min(m.confidence, visionUsed ? 1 : 0.85, confident ? 1 : 0.6).toFixed(2));

  return {
    // legacy AgricultureAssessment surface (unchanged shape)
    understanding: m.understanding,
    cropType: m.farmContext.cropOrAnimal,
    issueType: m.issueType,
    likelyDiagnosis,
    urgent,
    severity,
    recommendation,
    lowCostInterventions: tieredActions.lowCost.slice(0, 4),
    followUpQuestions: m.followUpQuestions.slice(0, 3),
    confidence,
    // additive fields
    farmContext: m.farmContext,
    season: season.label,
    seasonCode: season.code,
    growthStage: m.farmContext.growthStage,
    affectedProportion: m.farmContext.affectedProportion,
    recentInputs: m.farmContext.recentInputs,
    territory: ctx.territory ?? (m.farmContext.locationHint !== "non précisé" ? m.farmContext.locationHint : null),
    candidates: worded,
    topProb,
    confident,
    missingEvidence,
    secondPhotoRequested,
    tieredActions,
    actionsToAvoid,
    followUpCapture: m.followUpCapture,
    isNotifiable,
    notifiable,
    zoonotic: { flagged: zoonotic, signs: zoonoticSigns },
    extensionReferral,
    chemicalGuard: { blocked, products: Array.from(new Set(products)), referral: blocked.length ? guards.find((g) => g.referral)?.referral ?? null : null },
    evidenceQuality: {
      visionUsed,
      attachments: images.length,
      usable: usableImages.length,
      videoOnly: evidence.videoOnly,
      summary: evidence.summary,
      recaptureGuidance: evidence.recaptureGuidance,
      exifNotes: Array.from(new Set(evidence.results.map((e) => e.exif.note))),
      details: evidence.results,
    },
    citations,
    prices,
    weather,
    calendar,
  };
}

/* ------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------- */

const COMMODITY_HINTS: Array<[RegExp, string]> = [
  [/manioc|mihogo|cossette/i, "manioc"],
  [/maïs|mais|mahindi/i, "maïs"],
  [/riz|mchele|loso/i, "riz"],
  [/haricot|maharagwe|madesu/i, "haricot"],
  [/arachide|karanga|nguba/i, "arachide"],
  [/plantain|banane|ndizi/i, "banane plantain"],
  [/pomme de terre|viazi/i, "pomme de terre"],
];

function guessCommodity(text: string, cropOrAnimal: string): string | null {
  const hay = `${text} ${cropOrAnimal}`;
  return COMMODITY_HINTS.find(([re]) => re.test(hay))?.[1] ?? null;
}

export function matchCalendarCrop(text: string): CalendarCrop | null {
  const t = norm(text);
  const direct = CALENDAR_CROPS.find((c) => t.includes(norm(c)));
  if (direct) return direct;
  if (/mihogo|cossette|kwanga/.test(t)) return "manioc";
  if (/mahindi|masangu/.test(t)) return "maïs";
  if (/mchele|loso/.test(t)) return "riz";
  if (/maharagwe|madesu/.test(t)) return "haricot";
  if (/karanga|nguba/.test(t)) return "arachide";
  if (/ndizi|plantain/.test(t)) return "banane plantain";
  if (/legume|maraich|tomate|amarante|oignon/.test(t)) return "maraîchage";
  return null;
}

/** At least one approved docId backs every answer (FR-AG-09). */
async function ensureCitations(modelCitations: string[], hits: KnowledgeHit[], fallbackQuery: string): Promise<string[]> {
  const available = new Set(hits.map((h) => h.docId));
  const kept = modelCitations.map((c) => c.replace(/[[\]]/g, "").trim()).filter((c) => available.has(c));
  if (kept.length) return Array.from(new Set(kept));
  if (hits.length) return [hits[0].docId];
  const extra = await searchKnowledge("agriculture", fallbackQuery, 1);
  return extra.length ? [extra[0].docId] : [];
}

interface ComposeInput {
  worded: Array<AgriCandidate & { wording: string }>;
  confident: boolean;
  tieredActions: TieredActions;
  extensionReferral: ExtensionReferral;
  followUpCapture: string;
  evidence: EvidenceReview;
  secondPhotoRequested: boolean;
  notifiable: NotifiableMatch[];
  zoonotic: boolean;
  prices: PriceQuote[] | null;
  weather: WeatherAnswer | null;
  calendar: ReturnType<typeof calendarAdvice> | null;
  citations: string[];
}

function composeRecommendation(i: ComposeInput): string {
  const parts: string[] = [];
  if (i.evidence.recaptureGuidance) parts.push(i.evidence.recaptureGuidance);
  if (i.evidence.videoOnly) parts.push("La vidéo est conservée comme preuve pour l'agent agricole ; elle n'est pas analysée automatiquement.");
  if (i.worded.length) parts.push(i.worded[0].wording);
  if (i.worded.length > 1) parts.push(`Autres pistes à écarter : ${i.worded.slice(1).map((c) => `${c.label} (${Math.round(c.probability * 100)} %)`).join(", ")}.`);
  if (i.tieredActions.noCost.length) parts.push(`À faire tout de suite, sans dépense : ${i.tieredActions.noCost.join(" ")}`);
  if (i.tieredActions.lowCost.length) parts.push(`Avec de petits moyens locaux : ${i.tieredActions.lowCost.join(" ")}`);
  if (i.tieredActions.purchase.length) parts.push(`Si un achat s'avère nécessaire : ${i.tieredActions.purchase.join(" ")}`);
  if (i.notifiable.length) {
    parts.push(
      `${i.notifiable.map((n) => n.label).join(", ")} figure sur la liste officielle des maladies et ravageurs à déclarer : le service agricole de votre secteur est prévenu.`,
    );
  }
  if (i.zoonotic) parts.push("Attention : certains signes décrits peuvent aussi toucher les personnes. Lavez-vous les mains au savon après tout contact et parlez-en au centre de santé.");
  if (i.extensionReferral.message) parts.push(i.extensionReferral.message);
  if (i.secondPhotoRequested) parts.push("Ce n'est pas encore une confirmation : une observation ou une photo de plus permettra de trancher.");
  if (i.prices?.length) parts.push(renderPrices(i.prices));
  if (i.weather) parts.push(i.weather.text);
  if (i.calendar) parts.push(i.calendar.text);
  if (i.followUpCapture) parts.push(`Suivi : ${i.followUpCapture}`);
  if (i.citations.length) parts.push(`Sources : ${i.citations.join(", ")}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function raiseExtensionAlert(input: {
  province: string | null;
  territory: string | null;
  interactionId?: string;
  notifiable: NotifiableMatch[];
  zoonotic: boolean;
  crop: string;
  candidateLabel: string | null;
}) {
  const labels = input.notifiable.map((n) => n.label).join(", ") || input.candidateLabel || "signalement agricole";
  const title = input.zoonotic ? `Alerte sanitaire animale : ${labels}` : `Signalement à déclaration obligatoire : ${labels}`;
  const body = `Signalement reçu${input.province ? ` — ${input.province}` : ""}${input.territory ? ` / ${input.territory}` : ""} sur ${input.crop}. Vérification terrain requise avant toute confirmation.`;
  try {
    await notifyRole("agri_officer", { type: "alert", title, body, payload: { interactionId: input.interactionId ?? null, notifiable: input.notifiable, zoonotic: input.zoonotic, province: input.province, territory: input.territory } }, input.province);
  } catch (err) {
    console.error("[agriculture] extension alert failed", err);
  }
  await emitEvent({
    type: input.zoonotic ? "agri.zoonotic.flagged" : "agri.notifiable.detected",
    aggregateType: "interaction",
    aggregateId: input.interactionId,
    module: "agriculture",
    classification: "internal",
    actor: { type: "ai" },
    payload: { notifiable: input.notifiable, province: input.province, territory: input.territory, crop: input.crop },
  });
}
