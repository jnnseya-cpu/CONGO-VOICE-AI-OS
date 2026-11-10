import { beforeEach, describe, expect, it } from "vitest";

import {
  actionKey,
  executePatch,
  reconcile,
  refusalReason,
  rollbackPatch,
  type ExecutionGuards,
  type PatchResult,
  type Receipt,
  type SurfaceAdapter,
  type SurfaceAsset,
} from "@server/ai/trends/actions";
import {
  MIN_COHORT,
  OutcomeLedger,
  UNOBSERVABLE_OUTCOMES,
  recommend,
  reportCaveatFr,
} from "@server/ai/trends/measurement";

/**
 * Write safety and recovery. Trend Intelligence §18, scenarios TI-07 and TI-08.
 *
 * The situations worth testing are the ones a real surface will not reproduce
 * on demand: a write that commits and then loses its connection, and an editor
 * who changes the page between approval and execution.
 *
 * They matter more here than in a commercial deployment. This platform's public
 * pages include `/urgence`, and two uncoordinated writers on an emergency page
 * is not an embarrassment.
 */

class FakeSurface implements SurfaceAdapter {
  readonly supportsReconciliation = true;
  private assets = new Map<string, SurfaceAsset>();
  private receipts = new Map<string, Receipt>();
  failAfterCommit = false;
  unavailable = false;
  appliedCalls = 0;

  seed(assetId: string, fields: Record<string, string>): void {
    this.assets.set(assetId, { assetId, revision: "rev-1", fields: { ...fields } });
  }

  private next(revision: string): string {
    return `rev-${Number(revision.split("-")[1]) + 1}`;
  }

  /** An editor changing the page outside the system. */
  editOutOfBand(assetId: string, fields: Record<string, string>): void {
    const asset = this.assets.get(assetId);
    if (asset === undefined) throw new Error("unknown asset");
    this.assets.set(assetId, {
      assetId,
      revision: this.next(asset.revision),
      fields: { ...asset.fields, ...fields },
    });
  }

  async getAsset(assetId: string): Promise<SurfaceAsset | null> {
    return this.assets.get(assetId) ?? null;
  }

  async applyPatch(
    assetId: string,
    expectedRevision: string,
    fields: Record<string, string>,
    key: string,
  ): Promise<PatchResult> {
    if (this.unavailable) throw new Error("surface indisponible");
    const held = this.receipts.get(key);
    if (held?.state === "applied") {
      return { outcome: "applied", revision: held.revision, receipt: key };
    }
    const asset = this.assets.get(assetId);
    if (asset === undefined) return { outcome: "rejected", detailFr: "page inconnue" };
    if (asset.revision !== expectedRevision) {
      return { outcome: "conflict", revision: asset.revision, detailFr: "révision différente" };
    }
    const previousFields = Object.fromEntries(
      Object.keys(fields).map((k) => [k, asset.fields[k] ?? ""]),
    );
    const revision = this.next(asset.revision);
    this.assets.set(assetId, { assetId, revision, fields: { ...asset.fields, ...fields } });
    this.receipts.set(key, { actionKey: key, state: "applied", revision });
    this.appliedCalls += 1;
    if (this.failAfterCommit) {
      // The write landed; the caller will not hear about it. TI-07 exactly.
      throw new Error("connexion perdue après l'écriture");
    }
    return { outcome: "applied", revision, receipt: key, previousFields };
  }

  async getReceipt(key: string): Promise<Receipt> {
    if (this.unavailable) return { actionKey: key, state: "unknown" };
    return this.receipts.get(key) ?? { actionKey: key, state: "not_found" };
  }

  async restorePatch(
    assetId: string,
    expectedAppliedRevision: string,
    previousFields: Record<string, string>,
    key: string,
  ): Promise<PatchResult> {
    const held = this.receipts.get(key);
    if (held?.state === "applied") {
      return { outcome: "applied", revision: held.revision, receipt: key };
    }
    const asset = this.assets.get(assetId);
    if (asset === undefined) return { outcome: "rejected", detailFr: "page inconnue" };
    if (asset.revision !== expectedAppliedRevision) {
      return { outcome: "conflict", revision: asset.revision };
    }
    const revision = this.next(asset.revision);
    this.assets.set(assetId, {
      assetId,
      revision,
      fields: { ...asset.fields, ...previousFields },
    });
    this.receipts.set(key, { actionKey: key, state: "applied", revision });
    return { outcome: "applied", revision, receipt: key };
  }
}

const ORIGINAL = {
  seo_title: "Urgences",
  seo_description: "Que faire en cas d'urgence",
  body_block: "Texte original.",
};
const PATCH = { seo_title: "Urgences : quoi faire tout de suite" };

function guards(overrides: Partial<ExecutionGuards> = {}): ExecutionGuards {
  return {
    platformFrozen: false,
    briefIsFresh: true,
    briefVersion: 3,
    approvedBriefVersion: 3,
    policyVersion: 5,
    approvedPolicyVersion: 5,
    approvalHash: "h1",
    currentCanonicalHash: "h1",
    author: "agent@plateforme",
    approver: "reviseur@ministere",
    adapterSupportsReconciliation: true,
    clinicalReadiness: true,
    ...overrides,
  };
}

const KEY = actionKey({
  tenantId: "t1",
  briefVersion: 3,
  channel: "seo",
  actionKind: "seo_metadata_patch",
  targetId: "page_urgence",
  baseRevision: "rev-1",
  patch: PATCH,
});

describe("applying an approved change", () => {
  let surface: FakeSurface;
  beforeEach(() => {
    surface = new FakeSurface();
    surface.seed("page_urgence", ORIGINAL);
  });

  it("applies and returns a receipt and the previous values", async () => {
    const result = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    expect(result.state).toBe("applied");
    expect(result.revision).toBe("rev-2");
    expect(result.previousFields).toEqual({ seo_title: "Urgences" });
  });
});

describe("TI-07 — a crash after the surface committed", () => {
  let surface: FakeSurface;
  beforeEach(() => {
    surface = new FakeSurface();
    surface.seed("page_urgence", ORIGINAL);
  });

  it("recovers one side effect, not two", async () => {
    surface.failAfterCommit = true;
    const first = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    expect(first.state).toBe("applied");
    expect(first.detailFr).toContain("accusé");
    expect(surface.appliedCalls).toBe(1);

    // The retry a restarted worker makes, with the same deterministic key.
    surface.failAfterCommit = false;
    const second = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    expect(second.state).toBe("applied");
    expect(surface.appliedCalls).toBe(1);
  });

  it("stops rather than retrying when the surface cannot confirm", async () => {
    // "unknown" is not "not found". Treating it as such is how one approved
    // change becomes two published ones.
    surface.unavailable = true;
    const result = await reconcile(surface, KEY);
    expect(result.state).toBe("reconciliation_required");
    expect(result.detailFr).toContain("une personne doit trancher");
  });

  it("allows a retry when the surface is certain it never saw the key", async () => {
    const result = await reconcile(surface, "ak_jamais_envoyee");
    expect(result.state).toBe("failed");
    expect(result.detailFr).toContain("nouvelle tentative possible");
  });
});

describe("TI-08 — an editor changes the page", () => {
  let surface: FakeSurface;
  beforeEach(() => {
    surface = new FakeSurface();
    surface.seed("page_urgence", ORIGINAL);
  });

  it("conflicts before writing, leaving the editor's work intact", async () => {
    surface.editOutOfBand("page_urgence", { seo_title: "Titre choisi par l'éditeur" });
    const result = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    expect(result.state).toBe("conflict");
    const asset = await surface.getAsset("page_urgence");
    expect(asset?.fields.seo_title).toBe("Titre choisi par l'éditeur");
  });

  it("conflicts on rollback when the page moved on after publication", async () => {
    const applied = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    surface.editOutOfBand("page_urgence", { body_block: "réécrit par l'éditeur" });
    const result = await rollbackPatch(surface, {
      assetId: "page_urgence",
      appliedRevision: applied.revision ?? "",
      previousFields: applied.previousFields ?? {},
      key: "rb_1",
    });
    expect(result.state).toBe("conflict");
    expect(result.detailFr).toContain("résolution manuelle");
  });

  it("restores only the fields the action owned", async () => {
    const applied = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    const result = await rollbackPatch(surface, {
      assetId: "page_urgence",
      appliedRevision: applied.revision ?? "",
      previousFields: applied.previousFields ?? {},
      key: "rb_1",
    });
    expect(result.state).toBe("applied");
    const asset = await surface.getAsset("page_urgence");
    expect(asset?.fields.seo_title).toBe("Urgences");
    expect(asset?.fields.body_block).toBe("Texte original.");
  });
});

describe("every guard runs again at execution time", () => {
  let surface: FakeSurface;
  beforeEach(() => {
    surface = new FakeSurface();
    surface.seed("page_urgence", ORIGINAL);
  });

  it.each([
    [{ platformFrozen: true }, "gelée"],
    [{ clinicalReadiness: false }, "quorum"],
    [{ briefIsFresh: false }, "expiré"],
    [{ briefVersion: 4 }, "changé de version"],
    [{ policyVersion: 6 }, "politique a changé"],
    [{ currentCanonicalHash: "h2" }, "modifié après l'approbation"],
    [{ approver: "agent@plateforme" }, "deux personnes différentes"],
    [{ adapterSupportsReconciliation: false }, "reste en brouillon"],
  ])("refuses before any write: %o", async (override, expected) => {
    const result = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(override as Partial<ExecutionGuards>),
    });
    expect(result.state).toBe("refused");
    expect(result.detailFr).toContain(expected);
    expect(surface.appliedCalls).toBe(0);
  });

  it("puts the review board's quorum ahead of everything but a freeze", () => {
    // This platform's own gate, inserted into the specification's order: no
    // citizen-facing change while the clinical board lacks quorum.
    expect(refusalReason(guards({ clinicalReadiness: false }))).toContain("quorum");
  });

  it("still permits an authorised rollback while frozen", async () => {
    const applied = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: PATCH,
      key: KEY,
      guards: guards(),
    });
    const result = await rollbackPatch(surface, {
      assetId: "page_urgence",
      appliedRevision: applied.revision ?? "",
      previousFields: applied.previousFields ?? {},
      key: "rb_1",
    });
    expect(result.state).toBe("applied");
  });

  it("refuses a rollback once the recovery window has closed", async () => {
    const result = await rollbackPatch(surface, {
      assetId: "page_urgence",
      appliedRevision: "rev-2",
      previousFields: { seo_title: "x" },
      key: "rb_2",
      recoveryWindowOpen: false,
    });
    expect(result.state).toBe("refused");
  });

  it("refuses a patch touching a field outside the v1 allowlist", async () => {
    const result = await executePatch(surface, {
      assetId: "page_urgence",
      expectedRevision: "rev-1",
      fields: { canonical: "/ailleurs" },
      key: KEY,
      guards: guards(),
    });
    expect(result.state).toBe("refused");
    expect(surface.appliedCalls).toBe(0);
  });
});

describe("measurement says what it cannot know", () => {
  it("returns no rate at all below the cohort floor", () => {
    const ledger = new OutcomeLedger();
    for (let i = 0; i < 5; i += 1) {
      ledger.record({
        outcomeRef: `e${i}`,
        kind: "eligible",
        name: "interaction_eligible",
        occurredAt: new Date(),
      });
    }
    const report = ledger.report({ conversionName: "escalation_acknowledged" });
    expect(report.rate).toBeNull();
    expect(report.sampleStatusFr).toContain("Preuve insuffisante");
    expect(recommend(report)).toBe("continue_observing");
  });

  it("uses the same sufficiency floor as the service objectives", () => {
    // One rule, so the two cannot drift apart.
    expect(MIN_COHORT).toBe(30);
  });

  it("rejects a duplicate outcome rather than inflating the denominator", () => {
    const ledger = new OutcomeLedger();
    const event = {
      outcomeRef: "o1",
      kind: "conversion" as const,
      name: "escalation_acknowledged",
      occurredAt: new Date(),
    };
    expect(ledger.record(event)).toBe(true);
    expect(ledger.record(event)).toBe(false);
    expect(ledger.size).toBe(1);
  });

  it("labels an uncontrolled result observational every time it is shown", () => {
    const ledger = new OutcomeLedger();
    for (let i = 0; i < 40; i += 1) {
      ledger.record({
        outcomeRef: `e${i}`,
        kind: "eligible",
        name: "interaction_eligible",
        occurredAt: new Date(),
      });
    }
    for (let i = 0; i < 6; i += 1) {
      ledger.record({
        outcomeRef: `c${i}`,
        kind: "conversion",
        name: "escalation_acknowledged",
        occurredAt: new Date(),
      });
    }
    const report = ledger.report({ conversionName: "escalation_acknowledged" });
    expect(report.rate).toBeCloseTo(0.15, 10);
    expect(report.observational).toBe(true);
    expect(reportCaveatFr(report)).toContain("observationnel");
  });

  it("recommends a rollback on any guardrail breach, whatever the rate", () => {
    const ledger = new OutcomeLedger();
    for (let i = 0; i < 40; i += 1) {
      ledger.record({
        outcomeRef: `e${i}`,
        kind: "eligible",
        name: "interaction_eligible",
        occurredAt: new Date(),
      });
    }
    ledger.record({
      outcomeRef: "g1",
      kind: "guardrail",
      name: "escalade_non_aboutie",
      occurredAt: new Date(),
    });
    expect(recommend(ledger.report({ conversionName: "escalation_acknowledged" }))).toBe(
      "roll_back",
    );
  });

  it("names what the platform cannot observe, so nobody reports it", () => {
    expect(Object.keys(UNOBSERVABLE_OUTCOMES)).toContain("clinical_outcome");
    expect(UNOBSERVABLE_OUTCOMES.clinical_outcome).toContain("ne l'observe pas");
  });
});
