import "server-only";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { Role } from "@server/db/schema";

/**
 * The operating brief: what is happening, what it means, and who has to act.
 *
 * Every dashboard in this platform could already tell somebody a number. None
 * of them said what to do about it, and a supervisor in a provincial office
 * does not need another count — they need to know which of nine things on the
 * screen is the one that will hurt somebody today.
 *
 * Three rules govern what may appear here, and they are the reason this is
 * computed rather than generated.
 *
 * It is deterministic. Every finding below is derived from a query against real
 * platform state, with a threshold written in code. A model that decides which
 * risks a health programme should worry about is a model making clinical and
 * operational policy, which is exactly what this platform's architecture
 * refuses. The language agent may later translate a finding; it never invents
 * one.
 *
 * It is for staff. A citizen describing a child's fever gets a referral, not a
 * "confidence level" and an "owner" — that format would be an insult and a
 * delay. Nothing here is ever rendered to a citizen.
 *
 * It never reports a risk it cannot evidence. A finding with no rows behind it
 * is omitted rather than softened, because a brief that pads itself stops being
 * read, and the one week it matters is the week nobody looks.
 */

export type Confidence = "high" | "medium" | "low";

export interface Finding {
  id: string;
  /** What is happening. */
  situation: string;
  /** What it means — the interpretation a number alone does not carry. */
  insight: string;
  /** What goes wrong if nobody acts. */
  risk: string;
  /** What should be done. */
  recommendation: string;
  /** The single most practical step, now. */
  nextAction: string;
  /** Who acts. A role, not a person: people change, responsibilities do not. */
  owner: Role;
  /** How long there is. `null` means immediately. */
  deadline: string | null;
  /**
   * How much the underlying data supports the finding — not how strongly the
   * platform feels about it. "high" means a direct count of rows; "medium" a
   * measure over a short window; "low" a signal that may be an artefact of a
   * quiet period.
   */
  confidence: Confidence;
  severity: "critical" | "warning" | "info";
  /** Where the reader goes to act on it. */
  href?: string;
}

export interface OperatingBrief {
  generatedAt: string;
  findings: Finding[];
  /** Counted rather than described: a brief that says "several" is not a brief. */
  counts: { critical: number; warning: number; info: number };
  /**
   * What was checked and found clear. A brief that only lists problems cannot
   * be distinguished from a brief whose checks failed to run.
   */
  clear: string[];
}

const HOUR = 3600 * 1000;

export async function operatingBrief(now = new Date()): Promise<OperatingBrief> {
  const db = await getDb();
  const findings: Finding[] = [];
  const clear: string[] = [];

  /* ── Escalations nobody has picked up ─────────────────────────────────── */
  const stale = await db
    .select({ n: count() })
    .from(schema.cases)
    .where(
      and(
        eq(schema.cases.status, "open"),
        isNull(schema.cases.assignedTo),
        sql`${schema.cases.createdAt} < ${new Date(now.getTime() - 2 * HOUR)}`,
      ),
    );
  const unassigned = stale[0]?.n ?? 0;
  if (unassigned > 0) {
    findings.push({
      id: "cases.unassigned",
      situation: `${unassigned} cas ouverts depuis plus de deux heures ne sont attribués à personne.`,
      insight:
        "Un cas sans titulaire n'est pas un cas en attente : c'est un cas que personne ne regarde. Le service a promis au citoyen qu'un humain serait prévenu.",
      risk: "Une escalade clinique non reprise est indiscernable d'une escalade traitée, jusqu'à ce que la personne revienne plus gravement atteinte.",
      recommendation: "Attribuer chaque cas à un agent nommé, ou élargir la zone de garde si aucun agent n'est disponible.",
      nextAction: "Ouvrir la file des cas non attribués et les répartir maintenant.",
      owner: "gov_admin",
      deadline: "Immédiat",
      confidence: "high",
      severity: "critical",
      href: "/cas?statut=open&attribue=non",
    });
  } else {
    clear.push("Tous les cas ouverts ont un titulaire.");
  }

  /* ── Clinical content nobody has signed ───────────────────────────────── */
  const unsigned = await db
    .select({ n: count() })
    .from(schema.protocolVersions)
    .where(isNull(schema.protocolVersions.approvedBy));
  const unsignedCount = unsigned[0]?.n ?? 0;
  if (unsignedCount > 0) {
    findings.push({
      id: "review.unsigned_content",
      situation: `${unsignedCount} version(s) de protocole n'ont reçu aucune signature du comité de revue clinique.`,
      insight:
        "Le service continue de fonctionner : il oriente et il escalade. Ce qu'il ne fait pas, c'est rassurer — aucun contenu non signé ne peut dire à un citoyen que tout va bien.",
      risk: "Un pilote qui s'ouvre sans contenu signé fait porter aux agents de terrain tout le poids clinique que le comité devait porter.",
      recommendation: "Constituer le quorum du comité et faire signer les contenus par ordre de fréquence d'usage.",
      nextAction: "Ouvrir la console du comité et vérifier les sièges pourvus.",
      owner: "platform_admin",
      deadline: "Avant l'ouverture au public",
      confidence: "high",
      severity: "critical",
      href: "/admin/comite",
    });
  } else {
    clear.push("Tous les contenus cliniques portent une signature du comité.");
  }

  /* ── Data-rights requests past their statutory deadline ───────────────── */
  const overdue = await db
    .select({ n: count() })
    .from(schema.dataRequests)
    .where(and(sql`${schema.dataRequests.dueAt} < ${now}`, sql`${schema.dataRequests.status} in ('open','in_progress')`));
  const overdueCount = overdue[0]?.n ?? 0;
  if (overdueCount > 0) {
    findings.push({
      id: "privacy.overdue_requests",
      situation: `${overdueCount} demande(s) d'accès ou d'effacement ont dépassé le délai de trente jours.`,
      insight: "Le délai est réglementaire, pas indicatif. Il court depuis la date de la demande, pas depuis sa lecture.",
      risk: "Le programme est en défaut vis-à-vis des personnes concernées, et la preuve du défaut est dans son propre journal.",
      recommendation: "Traiter les demandes les plus anciennes en premier et documenter la raison du retard.",
      nextAction: "Ouvrir la file des demandes de droits et traiter la plus ancienne.",
      owner: "gov_admin",
      deadline: "Immédiat",
      confidence: "high",
      severity: "critical",
      href: "/admin/donnees",
    });
  } else {
    clear.push("Aucune demande de droits en retard.");
  }

  /* ── Interactions that failed outright ────────────────────────────────── */
  const since = new Date(now.getTime() - 24 * HOUR);
  const [recent] = await db
    .select({ n: count() })
    .from(schema.interactions)
    .where(gte(schema.interactions.createdAt, since));
  const [failed] = await db
    .select({ n: count() })
    .from(schema.interactions)
    .where(and(gte(schema.interactions.createdAt, since), eq(schema.interactions.status, "failed")));
  const total = recent?.n ?? 0;
  const failures = failed?.n ?? 0;
  if (total >= 20 && failures / total > 0.05) {
    findings.push({
      id: "service.failure_rate",
      situation: `${failures} échanges sur ${total} ont échoué en 24 heures (${Math.round((failures / total) * 100)} %).`,
      insight: "Un échec n'est pas une réponse prudente : le citoyen n'a rien reçu du tout et ne sait pas pourquoi.",
      risk: "Les personnes qui échouent une fois ne réessaient pas, et ce sont celles dont la question était la plus difficile à formuler.",
      recommendation: "Lire les motifs d'échec dans le journal : un fournisseur indisponible et une erreur de code se corrigent différemment.",
      nextAction: "Ouvrir le tableau de bord d'administration, section état des fournisseurs.",
      owner: "platform_admin",
      deadline: "Sous 24 heures",
      // A ratio over one day: real, but a quiet night can distort it.
      confidence: total >= 100 ? "high" : "medium",
      severity: "warning",
      href: "/admin",
    });
  } else if (total >= 20) {
    clear.push(`Taux d'échec des échanges sous le seuil (${failures}/${total} sur 24 h).`);
  }

  /* ── Languages serving scripts instead of generated answers ───────────── */
  const degraded = await db
    .select({ language: schema.languageQuality.language, module: schema.languageQuality.module })
    .from(schema.languageQuality)
    .where(eq(schema.languageQuality.passes, false))
    .limit(20);
  if (degraded.length > 0) {
    const pairs = degraded.map((d) => `${d.language}/${d.module}`).join(", ");
    findings.push({
      id: "language.below_gate",
      situation: `${degraded.length} couple(s) langue/module sous le seuil de qualité : ${pairs}.`,
      insight:
        "Ces langues servent des scripts et des menus plutôt que des réponses générées. C'est le comportement voulu, et c'est aussi un service moins bon.",
      risk: "Une langue durablement scriptée devient une langue de seconde classe, dans un programme dont la promesse est l'inverse.",
      recommendation: "Faire relire un échantillon par un locuteur natif et corriger le glossaire avant de rouvrir la porte.",
      nextAction: "Ouvrir la console des langues et lancer une revue sur le couple le plus utilisé.",
      owner: "gov_admin",
      deadline: "Sous 7 jours",
      confidence: "high",
      severity: "warning",
      href: "/langues",
    });
  } else {
    clear.push("Toutes les langues évaluées sont au-dessus du seuil de qualité.");
  }

  /* ── Escalations that reach nobody ────────────────────────────────────── */
  const realProvider =
    (process.env.SMS_PROVIDER ?? "log") !== "log" ||
    (process.env.WHATSAPP_PROVIDER ?? "log") !== "log" ||
    (process.env.VOICE_PROVIDER ?? "log") !== "log";
  if (!realProvider) {
    findings.push({
      id: "notify.no_provider",
      situation: "Aucun fournisseur SMS, WhatsApp ou vocal n'est configuré.",
      insight:
        "Les notifications sont écrites dans le journal et ne quittent pas la plateforme. Dans l'application, une escalade paraît partie.",
      risk: "Une escalade pour signe de danger n'atteint personne, et rien à l'écran ne le laisse voir.",
      recommendation: "Configurer au moins un canal réel avant toute ouverture à des citoyens.",
      nextAction: "Renseigner les identifiants du fournisseur dans les secrets du déploiement.",
      owner: "platform_admin",
      deadline: "Avant l'ouverture au public",
      confidence: "high",
      severity: "critical",
      href: "/admin/communications",
    });
  } else {
    clear.push("Au moins un canal d'alerte réel est configuré.");
  }

  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  // Most severe first: the brief is read from the top and often only from the top.
  const order = { critical: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return { generatedAt: now.toISOString(), findings, counts, clear };
}

/* ── Trends ──────────────────────────────────────────────────────────────── */

export interface TrendSeries {
  label: string;
  unit: string;
  points: Array<{ label: string; value: number }>;
}

const DAY_FR = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Africa/Kinshasa" });

/**
 * Daily counts over a window, with the empty days present.
 *
 * Dropping a day with no activity is the most common way a chart lies: a line
 * drawn only through the days something happened turns a week of silence into a
 * smooth trend. A zero is a measurement.
 */
async function dailyCounts(
  days: number,
  now: Date,
  where: (from: Date, to: Date) => Promise<number>,
): Promise<Array<{ label: string; value: number }>> {
  const points: Array<{ label: string; value: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const to = new Date(now.getTime() - i * 24 * HOUR);
    const from = new Date(to.getTime() - 24 * HOUR);
    points.push({ label: DAY_FR.format(to), value: await where(from, to) });
  }
  return points;
}

/** Interactions per day — the simplest honest measure of whether anyone is using it. */
export async function interactionTrend(days = 14, now = new Date()): Promise<TrendSeries> {
  const db = await getDb();
  const points = await dailyCounts(days, now, async (from, to) => {
    const [row] = await db
      .select({ n: count() })
      .from(schema.interactions)
      .where(and(gte(schema.interactions.createdAt, from), sql`${schema.interactions.createdAt} < ${to}`));
    return row?.n ?? 0;
  });
  return { label: "Échanges par jour", unit: "", points };
}

/** Escalations per day: the measure that decides whether staffing is adequate. */
export async function escalationTrend(days = 14, now = new Date()): Promise<TrendSeries> {
  const db = await getDb();
  const points = await dailyCounts(days, now, async (from, to) => {
    const [row] = await db
      .select({ n: count() })
      .from(schema.cases)
      .where(and(gte(schema.cases.createdAt, from), sql`${schema.cases.createdAt} < ${to}`));
    return row?.n ?? 0;
  });
  return { label: "Cas ouverts par jour", unit: "", points };
}

/** How the platform's own answers are distributed across severity. */
export async function severityMix(days = 30, now = new Date()): Promise<Array<{ label: string; value: number }>> {
  const db = await getDb();
  const from = new Date(now.getTime() - days * 24 * HOUR);
  const rows = await db
    .select({ severity: schema.interactions.severity, n: count() })
    .from(schema.interactions)
    .where(gte(schema.interactions.createdAt, from))
    .groupBy(schema.interactions.severity);
  const FR: Record<string, string> = { "0": "Information", "1": "Conseil", "2": "Consultation", "3": "Urgent", "4": "Urgence" };
  return rows
    .filter((r) => r.severity !== null)
    .map((r) => ({ label: FR[String(r.severity)] ?? `Gravité ${r.severity}`, value: r.n }))
    .sort((a, b) => b.value - a.value);
}
