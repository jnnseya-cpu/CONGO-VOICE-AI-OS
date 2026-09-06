/**
 * Report catalogue: the nine institutional reports of the programme (FR-RP-01), with the
 * metadata every published figure must carry — definitions, denominators, data freshness
 * and the small-number suppression rule.
 */

export const REPORT_TYPES = [
  "daily_usage",
  "weekly_health_trends",
  "weekly_agri_risk",
  "weekly_education_support",
  "monthly_regional_activity",
  "monthly_ngo_impact",
  "quarterly_government_programme",
  "monthly_ai_performance",
  "monthly_cost_usage",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = "pdf" | "xlsx" | "csv";
export type Cadence = "daily" | "weekly" | "monthly" | "quarterly";

export const PROGRAMME_NAME = "CONGO VOICE AI OS";

/** Cells built on fewer than this many people are suppressed before publication. */
export const SUPPRESSION_THRESHOLD = 5;
export const SUPPRESSION_NOTE =
  `Règle de suppression : tout effectif inférieur à ${SUPPRESSION_THRESHOLD} est masqué (« <${SUPPRESSION_THRESHOLD} ») afin d'éviter toute ré-identification.`;

export interface ReportTypeMeta {
  type: ReportType;
  name: string;
  cadence: Cadence;
  /** Default reporting window in days. */
  windowDays: number;
  purpose: string;
  audience: string;
  definitions: Array<{ term: string; meaning: string }>;
  denominators: string[];
  defaultFormat: ReportFormat;
}

const COMMON_DEFS = [
  { term: "Interaction", meaning: "Un échange complet entre un citoyen et la plateforme (question, compréhension, réponse), quel que soit le canal." },
  { term: "Cas", meaning: "Un dossier ouvert lorsqu'une intervention humaine est nécessaire ; un seul responsable et une seule file à tout instant." },
  { term: "Escalade", meaning: "Transfert déterministe d'un cas vers un agent ou un superviseur selon les règles de risque codées." },
];

export const REPORT_CATALOGUE: Record<ReportType, ReportTypeMeta> = {
  daily_usage: {
    type: "daily_usage",
    name: "Rapport d'utilisation quotidien",
    cadence: "daily",
    windowDays: 1,
    purpose: "Suivre le volume, les canaux, les langues et la disponibilité du service au jour le jour.",
    audience: "Équipe d'exploitation",
    definitions: [...COMMON_DEFS, { term: "Utilisateur actif", meaning: "Compte distinct ayant produit au moins une interaction sur la période." }],
    denominators: ["Toutes les interactions enregistrées sur la période", "Tous les comptes ayant interagi sur la période"],
    defaultFormat: "pdf",
  },
  weekly_health_trends: {
    type: "weekly_health_trends",
    name: "Tendances santé hebdomadaires",
    cadence: "weekly",
    windowDays: 7,
    purpose: "Repérer les hausses de motifs de consultation et les urgences par province et zone de santé.",
    audience: "Ministère de la Santé, zones de santé, partenaires",
    definitions: [
      ...COMMON_DEFS,
      { term: "Motif", meaning: "Catégorie déterministe issue du protocole de triage (paludisme, diarrhée, santé maternelle…)." },
      { term: "Signe de danger", meaning: "Critère d'urgence codé dans le protocole ; déclenche systématiquement une alerte humaine." },
    ],
    denominators: ["Tous les enregistrements de triage santé de la période", "Population couverte non estimée : ces chiffres décrivent les usagers, pas la population générale"],
    defaultFormat: "pdf",
  },
  weekly_agri_risk: {
    type: "weekly_agri_risk",
    name: "Risques agricoles hebdomadaires",
    cadence: "weekly",
    windowDays: 7,
    purpose: "Détecter les foyers de maladies des cultures et du bétail et orienter les visites de terrain.",
    audience: "Ministère de l'Agriculture, inspections provinciales",
    definitions: [
      ...COMMON_DEFS,
      { term: "Foyer", meaning: "Concentration de signalements du même problème sur la même culture, la même zone et la même fenêtre de temps." },
      { term: "Maladie à déclaration obligatoire", meaning: "Problème inscrit sur la liste nationale : signalement automatique aux services vétérinaires ou phytosanitaires." },
    ],
    denominators: ["Tous les signalements agricoles de la période", "Foyers non confirmés tant qu'un agent ne les a pas validés"],
    defaultFormat: "pdf",
  },
  weekly_education_support: {
    type: "weekly_education_support",
    name: "Appui à l'apprentissage hebdomadaire",
    cadence: "weekly",
    windowDays: 7,
    purpose: "Identifier les notions les plus demandées et les apprenants en difficulté.",
    audience: "Ministère de l'EPST, écoles, enseignants",
    definitions: [
      ...COMMON_DEFS,
      { term: "Apprenant en difficulté", meaning: "Apprenant dont les sessions signalent un besoin d'appui répété sur la même notion." },
    ],
    denominators: ["Toutes les sessions éducatives de la période"],
    defaultFormat: "pdf",
  },
  monthly_regional_activity: {
    type: "monthly_regional_activity",
    name: "Activité régionale mensuelle",
    cadence: "monthly",
    windowDays: 30,
    purpose: "Comparer l'activité, la charge et les délais entre provinces et territoires.",
    audience: "Gouvernorats, direction du programme",
    definitions: [...COMMON_DEFS, { term: "Délai de prise en charge", meaning: "Temps entre l'ouverture d'un cas et son accusé de réception par un agent." }],
    denominators: ["Toutes les interactions et tous les cas de la période, par province de l'usager"],
    defaultFormat: "pdf",
  },
  monthly_ngo_impact: {
    type: "monthly_ngo_impact",
    name: "Rapport d'impact ONG mensuel",
    cadence: "monthly",
    windowDays: 30,
    purpose: "Rendre compte des cas traités, des résultats obtenus et du suivi effectif.",
    audience: "ONG partenaires et bailleurs",
    definitions: [
      ...COMMON_DEFS,
      { term: "Résultat", meaning: "Issue déclarée à la clôture du cas (orienté, rétabli, traité, sans changement…)." },
      { term: "Taux de suivi", meaning: "Part des cas clos pour lesquels une réponse du citoyen a été effectivement recueillie." },
    ],
    denominators: ["Cas clos sur la période, par organisation responsable"],
    defaultFormat: "pdf",
  },
  quarterly_government_programme: {
    type: "quarterly_government_programme",
    name: "Rapport trimestriel de programme",
    cadence: "quarterly",
    windowDays: 90,
    purpose: "Rendre compte de la couverture, de la qualité de service et du respect des délais au niveau national.",
    audience: "Gouvernement, comité de pilotage",
    definitions: [
      ...COMMON_DEFS,
      { term: "Respect des délais", meaning: "Part des cas pris en charge avant l'échéance de leur niveau de gravité." },
      { term: "Couverture linguistique", meaning: "Répartition des interactions entre les cinq langues du programme." },
    ],
    denominators: ["Toutes les interactions et tous les cas du trimestre", "Provinces sans activité affichées à zéro, non exclues"],
    defaultFormat: "pdf",
  },
  monthly_ai_performance: {
    type: "monthly_ai_performance",
    name: "Performance de l'IA mensuelle",
    cadence: "monthly",
    windowDays: 30,
    purpose: "Surveiller la confiance, les corrections humaines et les échecs techniques du système.",
    audience: "Comité technique et de sécurité",
    definitions: [
      ...COMMON_DEFS,
      { term: "Correction humaine", meaning: "Modification par un agent d'une valeur produite par le système, toujours motivée par écrit." },
      { term: "Confiance faible", meaning: "Interaction dont la confiance globale est inférieure au seuil configuré." },
    ],
    denominators: ["Toutes les interactions de la période", "Tous les appels aux modèles enregistrés dans le journal d'usage"],
    defaultFormat: "pdf",
  },
  monthly_cost_usage: {
    type: "monthly_cost_usage",
    name: "Coûts et consommation mensuels",
    cadence: "monthly",
    windowDays: 30,
    purpose: "Suivre la consommation en unités de calcul (ACU), le coût par interaction et le plafond du tenant.",
    audience: "Direction financière du programme",
    definitions: [
      { term: "ACU", meaning: "Unité de calcul normalisée : 1 ACU ≈ 1 000 jetons de modèle pondérés ; la table de conversion est publiée dans la configuration." },
      { term: "Coût par interaction", meaning: "Coût total de la période divisé par le nombre d'interactions distinctes ayant consommé des ACU." },
    ],
    denominators: ["Toutes les écritures du grand livre ACU de la période"],
    defaultFormat: "pdf",
  },
};

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Numeric column subject to small-number suppression. */
  suppress?: boolean;
}

export interface ReportSection {
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  note?: string;
}

export interface ReportPeriod {
  from: string;
  to: string;
  label: string;
}

export interface ReportDocument {
  type: ReportType;
  title: string;
  programme: string;
  period: ReportPeriod;
  scope: Record<string, unknown>;
  generatedAt: string;
  /** Timestamp of the most recent record included: how fresh the figures are. */
  dataFreshness: string | null;
  summary: Array<{ label: string; value: string | number }>;
  sections: ReportSection[];
  definitions: Array<{ term: string; meaning: string }>;
  denominators: string[];
  suppressionNote: string;
  purpose: string;
  audience: string;
}

/** Apply the small-number rule to a value that is about to be published. */
export function suppress(value: number | null | undefined): string | number {
  if (value === null || value === undefined) return "—";
  return value > 0 && value < SUPPRESSION_THRESHOLD ? `<${SUPPRESSION_THRESHOLD}` : value;
}

export function isReportType(v: string): v is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(v);
}

export function periodFor(type: ReportType, from?: string | Date | null, to?: string | Date | null): ReportPeriod {
  const meta = REPORT_CATALOGUE[type];
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - meta.windowDays * 24 * 3600 * 1000);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
    label: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`,
  };
}
