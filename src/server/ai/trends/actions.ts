/**
 * Sécurité d'écriture et récupération — Trend Intelligence §18.
 *
 * The hard part is never applying a patch. It is the seconds between a write
 * being committed and this process learning that it was. §18 step 5: "If a
 * database crash follows provider success, recover from the provider receipt
 * using the original key."
 *
 * So every write is driven by a key derived deterministically from its own
 * content. The same logical write always produces the same key, which is what
 * lets a restarted worker ask "did mine land?" instead of writing again.
 *
 * This matters more here than in a commercial deployment. A duplicated SEO
 * patch is embarrassing; this platform's public pages include `/urgence`, and
 * two uncoordinated writers on an emergency page is not an embarrassment.
 */
import "server-only";
import { createHash } from "node:crypto";

import { validatePatchFields, type ActionKind } from "./channels";

export type ExecutionState =
  | "applied"
  | "conflict"
  | "failed"
  /** §18: "On ambiguous completion, persist reconciliation_required and query receipt before another write." */
  | "reconciliation_required"
  | "refused";

export interface ExecutionResult {
  state: ExecutionState;
  revision?: string;
  receipt?: string;
  previousFields?: Record<string, string>;
  detailFr: string;
}

export type ReceiptState = "applied" | "not_found" | "unknown";

export interface Receipt {
  actionKey: string;
  state: ReceiptState;
  revision?: string;
}

export type PatchOutcome = "applied" | "conflict" | "rejected";

export interface PatchResult {
  outcome: PatchOutcome;
  revision?: string;
  receipt?: string;
  previousFields?: Record<string, string>;
  detailFr?: string;
}

export interface SurfaceAsset {
  assetId: string;
  revision: string;
  fields: Record<string, string>;
}

/**
 * What a surface must implement to be allowed a live write.
 *
 * `supportsReconciliation` is declared, not assumed. §18: "Adapters lacking
 * safe reconciliation are draft-only." A surface that cannot answer
 * `getReceipt` is structurally prevented from writing rather than trusted.
 */
export interface SurfaceAdapter {
  readonly supportsReconciliation: boolean;
  getAsset(assetId: string): Promise<SurfaceAsset | null>;
  applyPatch(
    assetId: string,
    expectedRevision: string,
    fields: Record<string, string>,
    actionKey: string,
  ): Promise<PatchResult>;
  getReceipt(actionKey: string): Promise<Receipt>;
  restorePatch(
    assetId: string,
    expectedAppliedRevision: string,
    previousFields: Record<string, string>,
    rollbackKey: string,
  ): Promise<PatchResult>;
}

/** Stable serialisation, so the same patch always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/**
 * §6: "Derive a durable idempotency key from tenant, brief version, channel,
 * action kind, target, base revision and canonical patch hash."
 *
 * Deterministic by construction. A random key would make both replay detection
 * and crash recovery impossible, and the failure would surface only as a
 * duplicated public change.
 */
export function actionKey(input: {
  tenantId: string;
  briefVersion: number;
  channel: string;
  actionKind: ActionKind;
  targetId: string;
  baseRevision: string;
  patch: Record<string, string>;
}): string {
  const parts = [
    input.tenantId,
    String(input.briefVersion),
    input.channel,
    input.actionKind,
    input.targetId,
    input.baseRevision,
    canonicalHash(input.patch),
  ].join("|");
  return `ak_${createHash("sha256").update(parts, "utf8").digest("hex").slice(0, 40)}`;
}

/**
 * The checks §18 step 3 requires to run **again** at execution time.
 *
 * Every one of them can change while a job waits in a queue: a brief expires,
 * an operator freezes the platform, a protocol is suspended, a reviewer edits
 * the payload. Checking them at approval and not at execution is how an
 * approved change becomes an unapproved one.
 */
export interface ExecutionGuards {
  platformFrozen: boolean;
  briefIsFresh: boolean;
  briefVersion: number;
  approvedBriefVersion: number;
  policyVersion: number;
  approvedPolicyVersion: number;
  approvalHash: string;
  currentCanonicalHash: string;
  author: string;
  approver: string;
  adapterSupportsReconciliation: boolean;
  /** This platform's own gate: no citizen-facing change while the board lacks quorum. */
  clinicalReadiness: boolean;
}

export function refusalReason(guards: ExecutionGuards): string | null {
  if (guards.platformFrozen) {
    return "La plateforme est gelée : aucun nouveau travail en direct n'est accepté.";
  }
  if (!guards.clinicalReadiness) {
    return "Le comité de revue n'a pas le quorum : aucune modification visible par un citoyen.";
  }
  if (!guards.briefIsFresh) {
    return "Le brief a expiré.";
  }
  if (guards.briefVersion !== guards.approvedBriefVersion) {
    return "Le brief a changé de version après l'approbation.";
  }
  if (guards.policyVersion !== guards.approvedPolicyVersion) {
    return "La politique a changé après l'approbation.";
  }
  if (guards.approvalHash !== guards.currentCanonicalHash) {
    return "Le contenu a été modifié après l'approbation.";
  }
  if (guards.author === guards.approver) {
    return "L'auteur et l'approbateur doivent être deux personnes différentes.";
  }
  if (!guards.adapterSupportsReconciliation) {
    return "Cette surface ne sait pas confirmer une écriture : elle reste en brouillon.";
  }
  return null;
}

/** §18 steps 1 to 5 for one live write. */
export async function executePatch(
  adapter: SurfaceAdapter,
  input: {
    assetId: string;
    expectedRevision: string;
    fields: Record<string, string>;
    key: string;
    guards: ExecutionGuards;
  },
): Promise<ExecutionResult> {
  const refusal = refusalReason(input.guards);
  if (refusal !== null) {
    return { state: "refused", detailFr: refusal };
  }

  try {
    validatePatchFields(input.fields);
  } catch (err) {
    return { state: "refused", detailFr: err instanceof Error ? err.message : "Champ refusé." };
  }

  let result: PatchResult;
  try {
    result = await adapter.applyPatch(
      input.assetId,
      input.expectedRevision,
      input.fields,
      input.key,
    );
  } catch (err) {
    // Ambiguous: the surface may or may not have committed. §18 forbids another
    // write until a receipt says which.
    return reconcile(adapter, input.key, err instanceof Error ? err.message : "erreur inconnue");
  }

  if (result.outcome === "applied") {
    return {
      state: "applied",
      revision: result.revision,
      receipt: result.receipt,
      previousFields: result.previousFields,
      detailFr: "Modification appliquée.",
    };
  }
  if (result.outcome === "conflict") {
    // §18 step 5: leave the asset intact and ask for a new approval.
    return {
      state: "conflict",
      revision: result.revision,
      detailFr:
        result.detailFr ??
        "La cible a changé depuis l'approbation : une nouvelle approbation est nécessaire.",
    };
  }
  return { state: "failed", detailFr: result.detailFr ?? "Écriture refusée par la surface." };
}

/**
 * Ask the surface whether our write landed, using the original key.
 *
 * Three answers, and the third carries the weight. `unknown` must never be
 * treated as `not_found`: retrying on an unknown is exactly how one approved
 * change becomes two published ones.
 */
export async function reconcile(
  adapter: SurfaceAdapter,
  key: string,
  detail = "",
): Promise<ExecutionResult> {
  const receipt = await adapter.getReceipt(key);
  if (receipt.state === "applied") {
    return {
      state: "applied",
      revision: receipt.revision,
      receipt: receipt.actionKey,
      detailFr: `Récupérée depuis l'accusé de la surface. ${detail}`.trim(),
    };
  }
  if (receipt.state === "not_found") {
    return {
      state: "failed",
      detailFr: `La surface n'a aucune trace de cette écriture : nouvelle tentative possible. ${detail}`.trim(),
    };
  }
  return {
    state: "reconciliation_required",
    detailFr:
      `La surface ne peut pas confirmer : une personne doit trancher avant toute nouvelle écriture. ${detail}`.trim(),
  };
}

/**
 * Rollback is a new authorised compensating action (§18 step 6).
 *
 * Two deliberate exceptions to the guards above: a freeze still permits an
 * authorised rollback, and a lapsed entitlement retains it during the recovery
 * window. Both exist because the alternative is leaving a service stuck with a
 * change it wants removed.
 */
export async function rollbackPatch(
  adapter: SurfaceAdapter,
  input: {
    assetId: string;
    appliedRevision: string;
    previousFields: Record<string, string>;
    key: string;
    recoveryWindowOpen?: boolean;
  },
): Promise<ExecutionResult> {
  try {
    validatePatchFields(input.previousFields);
  } catch (err) {
    return { state: "refused", detailFr: err instanceof Error ? err.message : "Champ refusé." };
  }
  if (input.recoveryWindowOpen === false) {
    return { state: "refused", detailFr: "La fenêtre de récupération est close." };
  }

  let result: PatchResult;
  try {
    result = await adapter.restorePatch(
      input.assetId,
      input.appliedRevision,
      input.previousFields,
      input.key,
    );
  } catch (err) {
    return reconcile(
      adapter,
      input.key,
      `retour arrière ambigu : ${err instanceof Error ? err.message : "erreur"}`,
    );
  }

  if (result.outcome === "applied") {
    return {
      state: "applied",
      revision: result.revision,
      receipt: result.receipt,
      detailFr: "Révision précédente rétablie.",
    };
  }
  if (result.outcome === "conflict") {
    return {
      state: "conflict",
      revision: result.revision,
      detailFr:
        "La page a changé depuis la modification : une résolution manuelle est nécessaire.",
    };
  }
  return { state: "failed", detailFr: result.detailFr ?? "Retour arrière refusé." };
}
