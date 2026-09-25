/**
 * What the platform may say when nobody clinically accountable has signed.
 *
 * The rule, in one sentence: **without a current board sign-off the platform may
 * escalate and refer, but it may not reassure.**
 *
 * That asymmetry is the whole design. Telling someone to go to a health centre
 * can be wrong only by being over-cautious. Telling them their child can be
 * watched at home for two days is a clinical judgement, and a clinical
 * judgement nobody has signed is one the platform is not entitled to make.
 *
 * In development and staging the gate reports rather than enforces, because the
 * offline platform has to be runnable with no board and no keys. In pilot and
 * production it enforces: the deployment stage is what decides whether a real
 * citizen is on the other end.
 */
import "server-only";
import type { ReviewArtefactKind } from "@server/db/schema";
import { deploymentStage } from "@server/core/status";
import { approvalFor, type ApprovalState } from "./board";

/** Stages where an unsigned clinical judgement must not reach a citizen. */
const ENFORCING = new Set(["pilot", "prod"]);

export interface GateFinding {
  kind: ReviewArtefactKind;
  artefactId: string;
  reason: ApprovalState["reason"];
}

export interface ClinicalGate {
  /** True when this deployment serves citizens and must therefore enforce. */
  enforced: boolean;
  /** True when every artefact in play carries a current sign-off. */
  signed: boolean;
  /** False when the platform must not state anything below the emergency band. */
  mayReassure: boolean;
  findings: GateFinding[];
}

/**
 * Checks everything that contributed to a health answer: the protocol that
 * decided the severity, and the system prompts that produced the words around
 * it. An emergency script is checked separately, where it is spoken.
 */
export async function clinicalGate(protocolId: string, prompts: string[] = ["health_agent", "health_explanation"]): Promise<ClinicalGate> {
  const enforced = ENFORCING.has(deploymentStage());
  const findings: GateFinding[] = [];

  const protocol = await approvalFor("protocol_version", protocolId);
  if (!protocol.approved) findings.push({ kind: "protocol_version", artefactId: protocolId, reason: protocol.reason });

  for (const name of prompts) {
    const state = await approvalFor("system_prompt", name);
    if (!state.approved) findings.push({ kind: "system_prompt", artefactId: name, reason: state.reason });
  }

  const signed = findings.length === 0;
  return { enforced, signed, mayReassure: signed || !enforced, findings };
}

/** What a citizen hears when the platform is not entitled to assess. */
export const UNSIGNED_GUIDANCE_FR =
  "Je ne peux pas évaluer cette situation moi-même pour le moment. Je transmets votre demande à une personne du service de santé, qui vous rappellera. " +
  "Si l'état s'aggrave — convulsions, impossibilité de boire, difficulté à respirer, perte de connaissance — allez tout de suite au centre de santé le plus proche.";

export const UNSIGNED_SUMMARY_FR =
  "Évaluation non rendue : le contenu clinique requis n'est pas validé par le comité de revue. Orientation vers une personne.";

export interface ArtefactApproval {
  kind: ReviewArtefactKind;
  artefactId: string;
  version: string;
  title: string;
  module: string;
  digest: string;
  approved: boolean;
  reason: ApprovalState["reason"];
  submissionId?: string;
  expiresAt?: Date | null;
}

/**
 * Every artefact a board could sign, with whether it is currently signed. This
 * is what the review console lists and what the readiness check counts.
 */
export async function artefactApprovals(module?: "health" | "agriculture" | "education"): Promise<ArtefactApproval[]> {
  const { listArtefacts } = await import("./artefacts");
  const artefacts = await listArtefacts(module);
  const out: ArtefactApproval[] = [];
  for (const a of artefacts) {
    const state = await approvalFor(a.kind, a.artefactId);
    out.push({
      kind: a.kind,
      artefactId: a.artefactId,
      version: a.version,
      title: a.title,
      module: a.module,
      digest: a.digest,
      approved: state.approved,
      reason: state.reason,
      submissionId: state.submissionId,
      expiresAt: state.expiresAt,
    });
  }
  return out.sort((x, y) => x.kind.localeCompare(y.kind) || x.artefactId.localeCompare(y.artefactId));
}

/** Counts for the readiness check and the console header. */
export async function approvalSummary(module?: "health" | "agriculture" | "education") {
  const rows = await artefactApprovals(module);
  const signed = rows.filter((r) => r.approved).length;
  return {
    total: rows.length,
    signed,
    unsigned: rows.length - signed,
    byReason: rows.reduce<Record<string, number>>((acc, r) => {
      if (!r.approved) acc[r.reason] = (acc[r.reason] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

/**
 * Readiness, from the board's point of view (AI-10).
 *
 * Two checks, both of which only bite where citizens are served: is the board
 * constituted at all, and is every artefact that would ship actually signed. A
 * deployment that fails either is degraded — it will still answer, but it will
 * escalate instead of assessing, and that is a fact the operator should learn
 * from the probe rather than from a confused community health worker.
 */
export async function clinicalReadiness(): Promise<Array<{ id: string; ok: boolean; detail: string }>> {
  const enforced = ENFORCING.has(deploymentStage());
  const { composition } = await import("./board");
  const checks: Array<{ id: string; ok: boolean; detail: string }> = [];

  const crb = await composition("crb");
  const constituted = Boolean(crb?.constituted);
  checks.push({
    id: "clinical_review_board",
    ok: !enforced || constituted,
    detail: constituted
      ? "Comité de Revue Clinique constitué."
      : `Comité de Revue Clinique incomplet : ${crb?.missing.join(", ") ?? "aucun siège pourvu"}. Aucune évaluation clinique ne sera rendue.`,
  });

  const summary = await approvalSummary("health");
  checks.push({
    id: "clinical_content_signed",
    ok: !enforced || summary.unsigned === 0,
    detail:
      summary.unsigned === 0
        ? `${summary.signed}/${summary.total} contenus cliniques validés par le comité.`
        : `${summary.unsigned}/${summary.total} contenus cliniques sans validation du comité : ${Object.entries(summary.byReason).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
  });

  return checks;
}
