/**
 * Mesure des résultats — Trend Intelligence §10 and §18 "Native measurement".
 *
 * The specification's outcomes are commercial: completed orders, qualified
 * demos, contribution margin. This platform has none of those and never will.
 * §9 is explicit that each installation defines its own, and §14 that "for
 * business outcomes with no instrumented data, mark measurement unavailable" —
 * so the outcomes below are the ones this platform can actually observe, and
 * the ones it cannot are named rather than approximated.
 *
 * The honesty rules here are already this platform's. §18 says "suppress small
 * cohorts in reports"; `reporting.ts` already suppresses small counts. §10 says
 * "If there is inadequate data or a site-wide confound, record inconclusive";
 * `slo.ts` already reports `null` below thirty observations rather than a
 * percentile computed on noise.
 */
import "server-only";

/**
 * What this platform can honestly count.
 *
 * Every one of these is a first-party event the platform already generates.
 * None of them requires an analytics tag, a third party, or an inference about
 * what a citizen intended.
 */
export const OBSERVABLE_OUTCOMES = {
  /** A severity-4 case acknowledged by a named human inside its SLA. */
  escalation_acknowledged: "Escalade prise en charge dans le délai",
  /** A reminder or follow-up the citizen acknowledged. */
  follow_up_acknowledged: "Rappel confirmé par le citoyen",
  /** An interaction that reached a cited, approved protocol answer. */
  protocol_answer_delivered: "Réponse fondée sur un protocole approuvé",
  /** A learner finished a session. */
  learning_session_completed: "Séance d'apprentissage terminée",
  /** A public page was read to the point of its call to action. */
  guidance_page_engaged: "Page d'information consultée jusqu'au bout",
} as const;

export type ObservableOutcome = keyof typeof OBSERVABLE_OUTCOMES;

/**
 * What this platform cannot observe, recorded so nobody reports it anyway.
 *
 * §10: "Distinguish observed correlation from estimated incremental lift."
 * The platform knows a case reached a human. It does not know whether the
 * child recovered, and a report that implied otherwise would be the most
 * damaging kind of false claim this service could make.
 */
export const UNOBSERVABLE_OUTCOMES = {
  clinical_outcome: "Issue clinique : la plateforme ne l'observe pas.",
  averted_harm: "Préjudice évité : non mesurable à partir des journaux.",
  yield_change: "Rendement agricole : nécessite une enquête de terrain.",
  attainment_change: "Niveau scolaire : nécessite une évaluation externe.",
} as const;

export type UnobservableOutcome = keyof typeof UNOBSERVABLE_OUTCOMES;

/**
 * §18: "suppress small cohorts in reports".
 *
 * Thirty, matching `MIN_OBSERVATIONS` in `core/slo.ts`, so the platform has one
 * sufficiency rule rather than two that will drift apart.
 */
export const MIN_COHORT = 30;

export type OutcomeKind = "eligible" | "conversion" | "guardrail";

export interface OutcomeEvent {
  /** Pseudonymous, per installation. §15: deduplicate conversion on this. */
  outcomeRef: string;
  kind: OutcomeKind;
  name: string;
  occurredAt: Date;
  revision?: number;
  variant?: string;
}

export type ControlMethod = "holdout" | "matched_control" | "observational";

export interface MeasurementReport {
  eligible: number;
  conversions: number;
  guardrailEvents: number;
  conversionName: string;
  denominatorName: string;
  /** Null below the cohort floor. Deliberately not a number with a caveat. */
  rate: number | null;
  sampleStatusFr: string;
  controlMethod: ControlMethod;
  /** §10: an observational result must say so, every time it is shown. */
  observational: boolean;
  byRevision: Record<number, { eligible: number; conversions: number }>;
}

export type Recommendation = "continue" | "revise" | "roll_back" | "continue_observing";

export class OutcomeLedger {
  private readonly events = new Map<string, OutcomeEvent>();

  /**
   * Returns false for a duplicate, so ingestion can report accepted and
   * duplicate counts rather than silently inflating a denominator.
   */
  record(event: OutcomeEvent): boolean {
    if (this.events.has(event.outcomeRef)) return false;
    this.events.set(event.outcomeRef, event);
    return true;
  }

  get size(): number {
    return this.events.size;
  }

  report(input: {
    conversionName: string;
    denominatorName?: string;
    controlMethod?: ControlMethod;
  }): MeasurementReport {
    const controlMethod = input.controlMethod ?? "observational";
    const all = [...this.events.values()];
    const eligible = all.filter((e) => e.kind === "eligible");
    const conversions = all.filter(
      (e) => e.kind === "conversion" && e.name === input.conversionName,
    );
    const guardrails = all.filter((e) => e.kind === "guardrail");

    const byRevision: Record<number, { eligible: number; conversions: number }> = {};
    const bump = (revision: number | undefined, key: "eligible" | "conversions"): void => {
      if (revision === undefined) return;
      byRevision[revision] ??= { eligible: 0, conversions: 0 };
      byRevision[revision][key] += 1;
    };
    for (const e of eligible) bump(e.revision, "eligible");
    for (const e of conversions) bump(e.revision, "conversions");

    const n = eligible.length;
    const sufficient = n >= MIN_COHORT;

    return {
      eligible: n,
      conversions: conversions.length,
      guardrailEvents: guardrails.length,
      conversionName: input.conversionName,
      denominatorName: input.denominatorName ?? "interaction_eligible",
      rate: sufficient ? conversions.length / n : null,
      sampleStatusFr: sufficient
        ? `${n} observations éligibles.`
        : `Preuve insuffisante : ${n} observation(s) éligibles sur ${MIN_COHORT} requises.`,
      controlMethod,
      observational: controlMethod === "observational",
      byRevision,
    };
  }
}

/**
 * §18: "Use measurement to recommend continuing, revising or rolling back."
 *
 * It recommends; it never decides. §10 forbids promoting on noise, so an
 * insufficient sample returns "keep observing" rather than a verdict dressed
 * up as one — and a guardrail breach outranks everything, because on this
 * platform a guardrail is a citizen being harmed, not a margin slipping.
 */
export function recommend(report: MeasurementReport): Recommendation {
  if (report.guardrailEvents > 0) return "roll_back";
  if (report.rate === null) return "continue_observing";
  return report.rate > 0 ? "continue" : "revise";
}

/**
 * The sentence that must accompany any figure from this module.
 *
 * Returned rather than left to each caller, because §4 of the AI-OS set made
 * the denominator rule load-bearing and the surest way to break it is to let
 * every report write its own caveat.
 */
export function reportCaveatFr(report: MeasurementReport): string {
  const parts: string[] = [];
  if (report.rate === null) {
    parts.push(report.sampleStatusFr);
  } else {
    parts.push(
      `${report.conversions} sur ${report.eligible} (${(report.rate * 100).toFixed(1)} %).`,
    );
  }
  if (report.observational) {
    parts.push(
      "Résultat observationnel : aucun groupe témoin, la corrélation n'est pas un effet démontré.",
    );
  }
  if (report.guardrailEvents > 0) {
    parts.push(`${report.guardrailEvents} déclenchement(s) de garde-fou.`);
  }
  return parts.join(" ");
}
