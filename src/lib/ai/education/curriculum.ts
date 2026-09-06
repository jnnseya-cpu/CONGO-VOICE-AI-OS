/**
 * DRC national curriculum map (FR-ED-09).
 *
 * A compact, offline map of the programme national: objectives by cycle, level and subject,
 * with their prerequisites and their weight in the national examinations (TENAFEP at the end
 * of primary, Examen d'État at the end of secondary). Every teaching session is attached to
 * one objective so that progress is expressed against the programme, never as a label on a
 * child.
 */

export type SchoolLevel =
  | "primaire_1"
  | "primaire_2"
  | "primaire_3"
  | "primaire_4"
  | "primaire_5"
  | "primaire_6"
  | "secondaire_1"
  | "secondaire_2"
  | "secondaire_3"
  | "secondaire_4"
  | "secondaire_5"
  | "secondaire_6";

export type AgeBand = "6-8" | "9-11" | "12-14" | "15-18" | "adult";

export type CurriculumSubject = "maths" | "french" | "reading" | "science" | "history_geography" | "civics" | "exam_prep" | "career" | "parent_support" | "other";

export interface CurriculumObjective {
  code: string;
  level: SchoolLevel;
  subject: CurriculumSubject;
  topic: string;
  objective: string;
  prerequisites: string[];
  /** Keywords used to attach a spoken question to this objective. */
  keywords: string[];
  examWeight: "tenafep" | "examen_etat" | "none";
}

export const LEVELS: SchoolLevel[] = [
  "primaire_1",
  "primaire_2",
  "primaire_3",
  "primaire_4",
  "primaire_5",
  "primaire_6",
  "secondaire_1",
  "secondaire_2",
  "secondaire_3",
  "secondaire_4",
  "secondaire_5",
  "secondaire_6",
];

export const LEVEL_LABELS: Record<SchoolLevel, string> = {
  primaire_1: "1re primaire",
  primaire_2: "2e primaire",
  primaire_3: "3e primaire",
  primaire_4: "4e primaire",
  primaire_5: "5e primaire",
  primaire_6: "6e primaire",
  secondaire_1: "1re secondaire",
  secondaire_2: "2e secondaire",
  secondaire_3: "3e secondaire",
  secondaire_4: "4e secondaire",
  secondaire_5: "5e secondaire",
  secondaire_6: "6e secondaire",
};

export const CURRICULUM: CurriculumObjective[] = [
  // ---- Primaire : mathématiques
  { code: "MATH-P1-01", level: "primaire_1", subject: "maths", topic: "nombres jusqu'à 20", objective: "Compter, lire et écrire les nombres jusqu'à 20 et les comparer", prerequisites: [], keywords: ["compter", "nombre", "vingt", "chiffres"], examWeight: "none" },
  { code: "MATH-P2-01", level: "primaire_2", subject: "maths", topic: "addition et soustraction jusqu'à 100", objective: "Poser et effectuer une addition et une soustraction jusqu'à 100 avec retenue", prerequisites: ["MATH-P1-01"], keywords: ["addition", "soustraction", "retenue", "plus", "moins"], examWeight: "none" },
  { code: "MATH-P3-01", level: "primaire_3", subject: "maths", topic: "tables de multiplication", objective: "Connaître les tables de 2 à 10 et les utiliser dans un problème simple", prerequisites: ["MATH-P2-01"], keywords: ["table", "multiplication", "multiplier", "fois"], examWeight: "tenafep" },
  { code: "MATH-P4-01", level: "primaire_4", subject: "maths", topic: "division", objective: "Partager une quantité en parts égales et vérifier le résultat par la multiplication", prerequisites: ["MATH-P3-01"], keywords: ["division", "diviser", "partager", "quotient", "reste"], examWeight: "tenafep" },
  { code: "MATH-P4-02", level: "primaire_4", subject: "maths", topic: "fractions simples", objective: "Reconnaître une fraction simple, la nommer et repérer des fractions égales", prerequisites: ["MATH-P4-01"], keywords: ["fraction", "demi", "quart", "moitié", "numérateur", "dénominateur"], examWeight: "tenafep" },
  { code: "MATH-P5-01", level: "primaire_5", subject: "maths", topic: "mesures et monnaie", objective: "Utiliser les unités de longueur, de masse et le franc congolais dans des problèmes de la vie courante", prerequisites: ["MATH-P4-01"], keywords: ["mesure", "mètre", "kilo", "franc", "monnaie", "prix"], examWeight: "tenafep" },
  { code: "MATH-P5-02", level: "primaire_5", subject: "maths", topic: "périmètre et aire", objective: "Calculer le périmètre et l'aire d'un rectangle et d'un carré", prerequisites: ["MATH-P3-01"], keywords: ["périmètre", "aire", "rectangle", "carré", "surface"], examWeight: "tenafep" },
  { code: "MATH-P6-01", level: "primaire_6", subject: "maths", topic: "proportionnalité et pourcentage", objective: "Résoudre un problème de proportionnalité simple et calculer un pourcentage", prerequisites: ["MATH-P4-02", "MATH-P5-01"], keywords: ["pourcentage", "proportion", "règle de trois", "%"], examWeight: "tenafep" },
  { code: "MATH-P6-02", level: "primaire_6", subject: "maths", topic: "nombres décimaux", objective: "Lire, comparer et additionner des nombres décimaux", prerequisites: ["MATH-P4-02"], keywords: ["décimal", "virgule", "dixième", "centième"], examWeight: "tenafep" },

  // ---- Primaire : français et lecture
  { code: "FR-P1-01", level: "primaire_1", subject: "reading", topic: "correspondance lettre-son", objective: "Associer chaque lettre à son son et déchiffrer une syllabe", prerequisites: [], keywords: ["lettre", "son", "syllabe", "alphabet", "déchiffrer"], examWeight: "none" },
  { code: "FR-P2-01", level: "primaire_2", subject: "reading", topic: "lecture de phrases courtes", objective: "Lire à voix haute une phrase courte et en dire le sens", prerequisites: ["FR-P1-01"], keywords: ["lire", "lecture", "phrase", "à voix haute"], examWeight: "none" },
  { code: "FR-P3-01", level: "primaire_3", subject: "reading", topic: "compréhension d'un court texte", objective: "Répondre à trois questions simples après la lecture d'un court récit", prerequisites: ["FR-P2-01"], keywords: ["compréhension", "texte", "histoire", "récit", "questions"], examWeight: "tenafep" },
  { code: "FR-P4-01", level: "primaire_4", subject: "french", topic: "présent de l'indicatif", objective: "Conjuguer les verbes des trois groupes au présent de l'indicatif", prerequisites: ["FR-P2-01"], keywords: ["présent", "conjuguer", "conjugaison", "verbe", "indicatif"], examWeight: "tenafep" },
  { code: "FR-P5-01", level: "primaire_5", subject: "french", topic: "passé composé et imparfait", objective: "Distinguer et employer le passé composé et l'imparfait dans un récit", prerequisites: ["FR-P4-01"], keywords: ["passé composé", "imparfait", "auxiliaire", "participe"], examWeight: "tenafep" },
  { code: "FR-P6-01", level: "primaire_6", subject: "french", topic: "futur simple et accord", objective: "Employer le futur simple et accorder le sujet avec le verbe", prerequisites: ["FR-P5-01"], keywords: ["futur", "accord", "sujet", "terminaison"], examWeight: "tenafep" },
  { code: "FR-P6-02", level: "primaire_6", subject: "french", topic: "rédaction courte", objective: "Rédiger un texte de dix lignes cohérent avec introduction et conclusion", prerequisites: ["FR-P5-01"], keywords: ["rédaction", "texte", "écrire", "composition", "dissertation"], examWeight: "tenafep" },

  // ---- Primaire : sciences, éveil, civisme
  { code: "SCI-P3-01", level: "primaire_3", subject: "science", topic: "les besoins des plantes", objective: "Nommer ce dont une plante a besoin pour pousser et expliquer le rôle du soleil", prerequisites: [], keywords: ["plante", "soleil", "pousser", "graine", "racine", "photosynthèse"], examWeight: "tenafep" },
  { code: "SCI-P4-01", level: "primaire_4", subject: "science", topic: "l'eau et l'hygiène", objective: "Expliquer le cycle de l'eau et les gestes d'hygiène qui protègent des maladies", prerequisites: [], keywords: ["eau", "cycle", "hygiène", "propre", "bouillir", "maladie"], examWeight: "tenafep" },
  { code: "SCI-P5-01", level: "primaire_5", subject: "science", topic: "le corps humain", objective: "Nommer les grands appareils du corps humain et leur rôle principal", prerequisites: [], keywords: ["corps", "digestion", "respiration", "cœur", "sang", "squelette"], examWeight: "tenafep" },
  { code: "SCI-P6-01", level: "primaire_6", subject: "science", topic: "alimentation et santé", objective: "Composer un repas équilibré à partir des aliments disponibles localement", prerequisites: ["SCI-P5-01"], keywords: ["aliment", "repas", "équilibré", "nutrition", "vitamine"], examWeight: "tenafep" },
  { code: "HG-P5-01", level: "primaire_5", subject: "history_geography", topic: "géographie de la RDC", objective: "Situer les provinces, les grands fleuves et les reliefs de la RDC", prerequisites: [], keywords: ["province", "fleuve", "congo", "carte", "géographie", "relief"], examWeight: "tenafep" },
  { code: "HG-P6-01", level: "primaire_6", subject: "history_geography", topic: "histoire de la RDC", objective: "Situer les grandes étapes de l'histoire de la RDC jusqu'à l'indépendance", prerequisites: [], keywords: ["histoire", "indépendance", "1960", "royaume", "colonisation"], examWeight: "tenafep" },
  { code: "CIV-P4-01", level: "primaire_4", subject: "civics", topic: "vivre ensemble", objective: "Citer ses droits et ses devoirs d'élève et de membre de la communauté", prerequisites: [], keywords: ["droit", "devoir", "civisme", "communauté", "règle"], examWeight: "none" },

  // ---- Secondaire : mathématiques
  { code: "MATH-S1-01", level: "secondaire_1", subject: "maths", topic: "nombres relatifs", objective: "Additionner, soustraire et multiplier des nombres relatifs", prerequisites: ["MATH-P6-02"], keywords: ["relatif", "négatif", "positif", "signe"], examWeight: "none" },
  { code: "MATH-S2-01", level: "secondaire_2", subject: "maths", topic: "calcul littéral", objective: "Développer et réduire une expression littérale simple", prerequisites: ["MATH-S1-01"], keywords: ["littéral", "développer", "réduire", "expression", "algèbre"], examWeight: "none" },
  { code: "MATH-S3-01", level: "secondaire_3", subject: "maths", topic: "équations du premier degré", objective: "Résoudre une équation du premier degré à une inconnue et vérifier la solution", prerequisites: ["MATH-S2-01"], keywords: ["équation", "inconnue", "résoudre", "premier degré"], examWeight: "examen_etat" },
  { code: "MATH-S4-01", level: "secondaire_4", subject: "maths", topic: "fonctions affines", objective: "Représenter une fonction affine et lire un coefficient directeur", prerequisites: ["MATH-S3-01"], keywords: ["fonction", "affine", "droite", "coefficient", "graphique"], examWeight: "examen_etat" },
  { code: "MATH-S5-01", level: "secondaire_5", subject: "maths", topic: "trigonométrie", objective: "Utiliser sinus, cosinus et tangente dans un triangle rectangle", prerequisites: ["MATH-S4-01"], keywords: ["sinus", "cosinus", "tangente", "triangle", "trigonométrie"], examWeight: "examen_etat" },
  { code: "MATH-S6-01", level: "secondaire_6", subject: "maths", topic: "statistiques et probabilités", objective: "Calculer une moyenne, une médiane et une probabilité simple", prerequisites: ["MATH-S4-01"], keywords: ["moyenne", "médiane", "probabilité", "statistique", "effectif"], examWeight: "examen_etat" },

  // ---- Secondaire : français, sciences, sciences humaines
  { code: "FR-S2-01", level: "secondaire_2", subject: "french", topic: "nature et fonction des mots", objective: "Identifier la nature et la fonction des mots dans une phrase", prerequisites: ["FR-P6-01"], keywords: ["nature", "fonction", "grammaire", "complément", "sujet"], examWeight: "none" },
  { code: "FR-S4-01", level: "secondaire_4", subject: "french", topic: "dissertation", objective: "Construire un plan de dissertation avec thèse, antithèse et synthèse", prerequisites: ["FR-P6-02"], keywords: ["dissertation", "plan", "thèse", "argument", "introduction"], examWeight: "examen_etat" },
  { code: "FR-S6-01", level: "secondaire_6", subject: "french", topic: "commentaire de texte", objective: "Analyser un texte littéraire et en dégager le sens et les procédés", prerequisites: ["FR-S4-01"], keywords: ["commentaire", "texte", "littéraire", "analyse", "procédé"], examWeight: "examen_etat" },
  { code: "SCI-S3-01", level: "secondaire_3", subject: "science", topic: "la cellule", objective: "Décrire la cellule végétale et animale et leurs différences", prerequisites: ["SCI-P5-01"], keywords: ["cellule", "noyau", "membrane", "végétale", "animale"], examWeight: "examen_etat" },
  { code: "SCI-S4-01", level: "secondaire_4", subject: "science", topic: "réactions chimiques", objective: "Équilibrer une équation chimique simple", prerequisites: ["MATH-S2-01"], keywords: ["chimie", "équation", "réaction", "molécule", "atome"], examWeight: "examen_etat" },
  { code: "SCI-S5-01", level: "secondaire_5", subject: "science", topic: "électricité", objective: "Appliquer la loi d'Ohm dans un circuit simple", prerequisites: ["MATH-S3-01"], keywords: ["électricité", "ohm", "courant", "tension", "résistance", "circuit"], examWeight: "examen_etat" },
  { code: "HG-S3-01", level: "secondaire_3", subject: "history_geography", topic: "géographie économique de la RDC", objective: "Expliquer les ressources et les activités économiques des régions de la RDC", prerequisites: ["HG-P5-01"], keywords: ["économie", "ressource", "minerai", "agriculture", "région"], examWeight: "examen_etat" },
  { code: "CIV-S4-01", level: "secondaire_4", subject: "civics", topic: "institutions de la République", objective: "Décrire les institutions de la République et le rôle du citoyen", prerequisites: ["CIV-P4-01"], keywords: ["institution", "république", "citoyen", "constitution", "élection"], examWeight: "examen_etat" },
  { code: "CAR-S6-01", level: "secondaire_6", subject: "career", topic: "orientation après le secondaire", objective: "Identifier les filières et les métiers accessibles après l'Examen d'État", prerequisites: [], keywords: ["orientation", "métier", "filière", "université", "après"], examWeight: "none" },
];

/* ------------------------------------------------------------------------------------------
 * Lookups
 * ---------------------------------------------------------------------------------------- */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function levelIndex(level: SchoolLevel): number {
  return LEVELS.indexOf(level);
}

export function isPrimary(level: SchoolLevel): boolean {
  return level.startsWith("primaire");
}

/** Default level for an age band, used only as a fallback while the learner has not confirmed. */
export function levelFromAgeBand(band: AgeBand): SchoolLevel {
  switch (band) {
    case "6-8":
      return "primaire_2";
    case "9-11":
      return "primaire_4";
    case "12-14":
      return "primaire_6";
    case "15-18":
      return "secondaire_4";
    default:
      return "secondaire_6";
  }
}

export function ageBandFromLevel(level: SchoolLevel): AgeBand {
  const i = levelIndex(level);
  if (i <= 1) return "6-8";
  if (i <= 3) return "9-11";
  if (i <= 5) return "12-14";
  if (i <= 11) return "15-18";
  return "adult";
}

export function objectivesFor(level: SchoolLevel, subject?: CurriculumSubject | null): CurriculumObjective[] {
  return CURRICULUM.filter((o) => o.level === level && (!subject || o.subject === subject));
}

/** Attaches a spoken question to the closest curriculum objective. */
export function findObjective(text: string, level?: SchoolLevel | null, subject?: CurriculumSubject | null): CurriculumObjective | null {
  const t = norm(text);
  const scored = CURRICULUM.map((o) => {
    let score = o.keywords.filter((k) => t.includes(norm(k))).length * 3;
    if (norm(o.topic).split(" ").some((w) => w.length >= 5 && t.includes(w))) score += 2;
    if (subject && o.subject === subject) score += 2;
    if (level) score += Math.max(0, 3 - Math.abs(levelIndex(o.level) - levelIndex(level)));
    return { o, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.o ?? null;
}

/** Objectives that carry weight in the national examination the learner is preparing. */
export function examObjectives(target: "tenafep" | "examen_etat"): CurriculumObjective[] {
  return CURRICULUM.filter((o) => o.examWeight === target);
}

export function prerequisiteChain(code: string, depth = 3): CurriculumObjective[] {
  const out: CurriculumObjective[] = [];
  let frontier = [code];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const c of frontier) {
      const o = CURRICULUM.find((x) => x.code === c);
      if (!o) continue;
      for (const p of o.prerequisites) {
        const po = CURRICULUM.find((x) => x.code === p);
        if (po && !out.some((x) => x.code === po.code)) {
          out.push(po);
          next.push(po.code);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export const EXAM_LABELS: Record<string, string> = {
  tenafep: "TENAFEP (Test national de fin d'études primaires)",
  examen_etat: "Examen d'État (fin du secondaire)",
  none: "aucun examen national visé",
};
