/**
 * The Clinical Review Board (AI-10).
 *
 * Every rule here exists because the alternative is a platform that tells a
 * mother her child can wait until morning on the authority of nobody.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  BOARDS,
  ReviewRefused,
  appointMember,
  approvalFor,
  boardByKey,
  composition,
  ensureBoards,
  evaluateQuorum,
  quorumFor,
  revokeMember,
  signOff,
  submitForReview,
  suspend,
} from "@server/ai/review/board";
import { canonicalJson, digestOf, readArtefact } from "@server/ai/review/artefacts";
import { clinicalGate } from "@server/ai/review/gate";
import { getDb, resetDbForTests, schema } from "@server/db/client";

const CRB = BOARDS.find((b) => b.key === "crb")!;
const PROTOCOL = "child_fever_u5";

async function makeUser(name: string) {
  const db = await getDb();
  const [user] = await db.insert(schema.users).values({ name, role: "chw", province: "Kinshasa" }).returning();
  return user.id;
}

/** Two physicians and a community health expert, as AI-10 requires. */
async function constituteBoard() {
  const appointedBy = await makeUser("Administration");
  const drA = await makeUser("Dr A");
  const drB = await makeUser("Dr B");
  const chw = await makeUser("Expert santé communautaire");
  await appointMember({ boardKey: "crb", userId: drA, seat: "physician", credential: "CNOM-001", appointedBy });
  await appointMember({ boardKey: "crb", userId: drB, seat: "physician", credential: "CNOM-002", appointedBy });
  await appointMember({ boardKey: "crb", userId: chw, seat: "community_health_expert", appointedBy });
  return { appointedBy, drA, drB, chw };
}

async function submitProtocol(submittedBy: string) {
  return submitForReview({ boardKey: "crb", kind: "protocol_version", artefactId: PROTOCOL, submittedBy });
}

describe("board composition (AI-10)", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    await ensureBoards();
  });

  it("requires two physicians and one community health expert", () => {
    expect(CRB.requiredSeats).toEqual({ physician: 2, community_health_expert: 1 });
  });

  it("is not constituted until every seat is filled", async () => {
    const before = await composition("crb");
    expect(before?.constituted).toBe(false);
    expect(before?.missing).toContain("physician: 0/2");

    await constituteBoard();
    const after = await composition("crb");
    expect(after?.constituted).toBe(true);
    expect(after?.missing).toEqual([]);
  });

  it("refuses an appointment to a seat the board does not have", async () => {
    const appointedBy = await makeUser("Administration");
    const someone = await makeUser("Agronome");
    await expect(appointMember({ boardKey: "crb", userId: someone, seat: "agronomist", appointedBy })).rejects.toThrow(/agronomist/);
  });

  it("stops counting a member once their appointment is revoked", async () => {
    const { drA } = await constituteBoard();
    const db = await getDb();
    const [member] = await db.select().from(schema.reviewBoardMembers).where(eq(schema.reviewBoardMembers.userId, drA));
    await revokeMember(member.id, "Fin de mandat");
    const after = await composition("crb");
    expect(after?.constituted).toBe(false);
    expect(after?.missing).toContain("physician: 1/2");
  });
});

describe("quorum is a composition, not a count", () => {
  it("three approvals in the wrong seats do not approve anything", () => {
    const quorum = evaluateQuorum(
      { physician: 2, community_health_expert: 1 },
      [
        { memberUserId: "a", seat: "community_health_expert", decision: "approve", contentDigest: "d" },
        { memberUserId: "b", seat: "community_health_expert", decision: "approve", contentDigest: "d" },
        { memberUserId: "c", seat: "community_health_expert", decision: "approve", contentDigest: "d" },
      ],
      "d",
    );
    expect(quorum.met).toBe(false);
    expect(quorum.missing).toContain("physician: 0/2");
  });

  it("does not let one person fill two seats by signing twice", () => {
    const quorum = evaluateQuorum(
      { physician: 2 },
      [
        { memberUserId: "a", seat: "physician", decision: "approve", contentDigest: "d" },
        { memberUserId: "a", seat: "physician", decision: "approve", contentDigest: "d" },
      ],
      "d",
    );
    expect(quorum.bySeat.physician.approved).toBe(1);
    expect(quorum.met).toBe(false);
  });

  it("lets a single rejection block an otherwise complete quorum", () => {
    const quorum = evaluateQuorum(
      { physician: 2, community_health_expert: 1 },
      [
        { memberUserId: "a", seat: "physician", decision: "approve", contentDigest: "d" },
        { memberUserId: "b", seat: "physician", decision: "approve", contentDigest: "d" },
        { memberUserId: "c", seat: "community_health_expert", decision: "reject", contentDigest: "d" },
      ],
      "d",
    );
    expect(quorum.met).toBe(false);
    expect(quorum.rejectedBy).toEqual(["c"]);
  });

  it("ignores signatures given on different content", () => {
    const quorum = evaluateQuorum(
      { physician: 1 },
      [{ memberUserId: "a", seat: "physician", decision: "approve", contentDigest: "old" }],
      "new",
    );
    expect(quorum.met).toBe(false);
    expect(quorum.bySeat.physician.approved).toBe(0);
  });
});

describe("signing (AI-10)", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    await ensureBoards();
  });

  it("records a full quorum and approves the version", async () => {
    const { appointedBy, drA, drB, chw } = await constituteBoard();
    const submission = await submitProtocol(appointedBy);
    const digest = submission.contentDigest;

    await signOff({ submissionId: submission.id, memberUserId: drA, seat: "physician", decision: "approve", contentDigest: digest });
    let quorum = await quorumFor(submission.id);
    expect(quorum.met).toBe(false);

    await signOff({ submissionId: submission.id, memberUserId: drB, seat: "physician", decision: "approve", contentDigest: digest });
    quorum = await quorumFor(submission.id);
    expect(quorum.met).toBe(false);

    const final = await signOff({ submissionId: submission.id, memberUserId: chw, seat: "community_health_expert", decision: "approve", contentDigest: digest });
    expect(final.quorum.met).toBe(true);
    expect(final.submission.status).toBe("approved");
    expect(final.submission.expiresAt).toBeTruthy();

    const state = await approvalFor("protocol_version", PROTOCOL);
    expect(state.approved).toBe(true);
    expect(state.signatories).toHaveLength(3);
  });

  it("records the sign-off in protocol_versions.approved_by, as the requirement asks", async () => {
    const { appointedBy, drA, drB, chw } = await constituteBoard();
    const submission = await submitProtocol(appointedBy);
    for (const [user, seat] of [[drA, "physician"], [drB, "physician"], [chw, "community_health_expert"]] as const) {
      await signOff({ submissionId: submission.id, memberUserId: user, seat, decision: "approve", contentDigest: submission.contentDigest });
    }
    const db = await getDb();
    const [row] = await db.select().from(schema.protocolVersions).where(eq(schema.protocolVersions.protocolId, PROTOCOL));
    expect(row.status).toBe("approved");
    expect(row.approvedBy).toMatch(/community_health_expert/);
    expect(row.approvedAt).toBeTruthy();
  });

  it("refuses the author of a submission as one of its reviewers", async () => {
    const { drA, drB, chw } = await constituteBoard();
    const submission = await submitProtocol(drA);
    await expect(
      signOff({ submissionId: submission.id, memberUserId: drA, seat: "physician", decision: "approve", contentDigest: submission.contentDigest }),
    ).rejects.toThrow(ReviewRefused);
    // The other two still sign normally.
    await signOff({ submissionId: submission.id, memberUserId: drB, seat: "physician", decision: "approve", contentDigest: submission.contentDigest });
    await signOff({ submissionId: submission.id, memberUserId: chw, seat: "community_health_expert", decision: "approve", contentDigest: submission.contentDigest });
    expect((await quorumFor(submission.id)).met).toBe(false);
  });

  it("refuses someone who does not sit on the board", async () => {
    const { appointedBy } = await constituteBoard();
    const stranger = await makeUser("Inconnu");
    const submission = await submitProtocol(appointedBy);
    await expect(
      signOff({ submissionId: submission.id, memberUserId: stranger, seat: "physician", decision: "approve", contentDigest: submission.contentDigest }),
    ).rejects.toThrow(/ne siégez pas/);
  });

  it("refuses a member signing in a seat they do not hold", async () => {
    const { appointedBy, chw } = await constituteBoard();
    const submission = await submitProtocol(appointedBy);
    await expect(
      signOff({ submissionId: submission.id, memberUserId: chw, seat: "physician", decision: "approve", contentDigest: submission.contentDigest }),
    ).rejects.toThrow(/siège/);
  });

  it("refuses a signature from a screen showing older content", async () => {
    const { appointedBy, drA } = await constituteBoard();
    const submission = await submitProtocol(appointedBy);
    await expect(
      signOff({ submissionId: submission.id, memberUserId: drA, seat: "physician", decision: "approve", contentDigest: "0".repeat(64) }),
    ).rejects.toThrow(/contenu a changé/i);
  });
});

describe("an approval covers one exact version of the content", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    await ensureBoards();
  });

  async function approveProtocol() {
    const { appointedBy, drA, drB, chw } = await constituteBoard();
    const submission = await submitProtocol(appointedBy);
    for (const [user, seat] of [[drA, "physician"], [drB, "physician"], [chw, "community_health_expert"]] as const) {
      await signOff({ submissionId: submission.id, memberUserId: user, seat, decision: "approve", contentDigest: submission.contentDigest });
    }
    return { submission, appointedBy, drA };
  }

  it("stops applying the moment the content changes", async () => {
    // A knowledge document, because its content lives in the database and can
    // actually be edited the way a real one would be.
    const db = await getDb();
    await db.insert(schema.kbDocuments).values({
      docId: "KB-TEST-REVIEW-01",
      module: "health",
      title: "Prise en charge de la fièvre",
      authority: "Ministère de la Santé",
      body: "Texte approuvé par le comité.",
      checksum: digestOf("Texte approuvé par le comité."),
    });

    const { appointedBy, drA, drB, chw } = await constituteBoard();
    const submission = await submitForReview({ boardKey: "crb", kind: "kb_document", artefactId: "KB-TEST-REVIEW-01", submittedBy: appointedBy });
    for (const [user, seat] of [[drA, "physician"], [drB, "physician"], [chw, "community_health_expert"]] as const) {
      await signOff({ submissionId: submission.id, memberUserId: user, seat, decision: "approve", contentDigest: submission.contentDigest });
    }
    expect((await approvalFor("kb_document", "KB-TEST-REVIEW-01")).approved).toBe(true);

    // One sentence changes. Nobody signed this.
    const edited = "Texte approuvé par le comité, avec une posologie ajoutée après coup.";
    await db
      .update(schema.kbDocuments)
      .set({ body: edited, checksum: digestOf(edited) })
      .where(eq(schema.kbDocuments.docId, "KB-TEST-REVIEW-01"));

    const state = await approvalFor("kb_document", "KB-TEST-REVIEW-01");
    expect(state.approved).toBe(false);
    expect(state.reason).toBe("content_changed");
  });

  it("lapses on the board's review cadence", async () => {
    await approveProtocol();
    const later = new Date(Date.now() + (CRB.reviewCadenceDays + 1) * 86_400_000);
    const state = await approvalFor("protocol_version", PROTOCOL, later);
    expect(state.approved).toBe(false);
    expect(state.reason).toBe("expired");
  });

  it("lets one member suspend what three approved", async () => {
    const { submission, drA } = await approveProtocol();
    await suspend(submission.id, drA, "Erreur de seuil sur la déshydratation");
    const state = await approvalFor("protocol_version", PROTOCOL);
    expect(state.approved).toBe(false);
    expect(state.reason).toBe("suspended");

    // And the catalogue stops saying the opposite.
    const db = await getDb();
    const [row] = await db.select().from(schema.protocolVersions).where(eq(schema.protocolVersions.protocolId, PROTOCOL));
    expect(row.status).toBe("review");
    expect(row.approvedBy).toBeNull();
  });

  it("refuses a suspension from someone outside the board", async () => {
    const { submission } = await approveProtocol();
    const stranger = await makeUser("Inconnu");
    await expect(suspend(submission.id, stranger, "peu importe")).rejects.toThrow(ReviewRefused);
  });

  it("supersedes an open submission when the content is resubmitted", async () => {
    const { appointedBy } = await constituteBoard();
    const first = await submitProtocol(appointedBy);
    const again = await submitProtocol(appointedBy);
    // Same content: the same submission is returned rather than a duplicate.
    expect(again.id).toBe(first.id);
  });
});

describe("digests", () => {
  it("does not change when object keys are written in another order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(digestOf({ b: 1, a: [1, { d: 4, c: 3 }] })).toBe(digestOf({ a: [1, { c: 3, d: 4 }], b: 1 }));
  });

  it("changes when a single word of a protocol changes", async () => {
    const artefact = await readArtefact("protocol_version", PROTOCOL);
    expect(artefact).toBeTruthy();
    const edited = JSON.parse(JSON.stringify(artefact!.content)) as { title: string };
    edited.title = `${edited.title} `;
    expect(digestOf(edited)).not.toBe(artefact!.digest);
  });
});

describe("the gate: may escalate, may not reassure", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    await ensureBoards();
    vi.unstubAllEnvs();
  });

  it("reports rather than enforces on a laptop, so the platform stays runnable", async () => {
    vi.stubEnv("DEPLOYMENT_STAGE", "dev");
    const gate = await clinicalGate(PROTOCOL);
    expect(gate.enforced).toBe(false);
    expect(gate.signed).toBe(false);
    expect(gate.mayReassure).toBe(true);
    expect(gate.findings.map((f) => f.reason)).toContain("never_submitted");
  });

  it("refuses to reassure in a deployment that serves citizens", async () => {
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    const gate = await clinicalGate(PROTOCOL);
    expect(gate.enforced).toBe(true);
    expect(gate.mayReassure).toBe(false);
  });

  it("names every unsigned artefact behind an answer, not just the first", async () => {
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    const gate = await clinicalGate(PROTOCOL, ["health_agent", "health_explanation", "safeguarding"]);
    expect(gate.findings).toHaveLength(4);
    expect(gate.findings.filter((f) => f.kind === "system_prompt")).toHaveLength(3);
  });
});

describe("registration does not approve", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
  });

  it("records a protocol version as awaiting review, with no approver", async () => {
    const { ensureProtocolsRegistered } = await import("@server/ai/protocols/registry");
    await ensureProtocolsRegistered();
    const db = await getDb();
    const rows = await db.select().from(schema.protocolVersions);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.status).toBe("review");
      expect(row.approvedBy).toBeNull();
    }
  });
});

describe("the board catalogue", () => {
  it("has one board per module, and a health board that is the CRB", async () => {
    resetDbForTests();
    await getDb();
    await ensureBoards();
    expect(BOARDS.map((b) => b.module).sort()).toEqual(["agriculture", "education", "health"]);
    const crb = await boardByKey("crb");
    expect(crb?.module).toBe("health");
  });
});

describe("what a citizen is told when nobody has signed (AI-10)", () => {
  beforeEach(async () => {
    resetDbForTests();
    await getDb();
    await ensureBoards();
    vi.unstubAllEnvs();
  });

  async function ask(text: string) {
    const { runInteraction } = await import("@server/ai/agents/orchestrator");
    const { seedReferenceData } = await import("@server/db/reference");
    await seedReferenceData();
    const db = await getDb();
    const [citizen] = await db.insert(schema.users).values({ isAnonymous: true, role: "citizen", languagePreference: "fr", province: "Kinshasa" }).returning();
    const out = await runInteraction({
      user: { userId: citizen.id, role: "citizen", language: "fr", province: "Kinshasa" },
      moduleHint: "health",
      text,
      province: "Kinshasa",
      wantsAudio: false,
    });
    const [row] = await db.select().from(schema.interactions).where(eq(schema.interactions.id, out.interactionId));
    const structured = (row?.structured ?? {}) as { health?: { severityLevel?: number } };
    return { text: [out.responseText, out.answer.action].join(" \n"), severity: structured.health?.severityLevel ?? null, escalated: out.answer.escalation.required };
  }

  it("still sends an emergency to the health centre, because referring cannot be made less safe", async () => {
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    const out = await ask("Mon bébé convulse et ne peut plus téter depuis ce matin.");
    expect(out.severity).toBe(4);
    expect(out.text).toMatch(/centre de santé|tout de suite/i);
    expect(out.escalated).toBe(true);
  }, 60_000);

  it("refuses to tell anyone to watch and wait at home", async () => {
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    const out = await ask("Mon enfant a un petit rhume depuis hier, il mange et il joue normalement.");
    expect(out.severity).toBeLessThan(4);
    // The words a protocol nobody signed would have produced.
    expect(out.text).not.toMatch(/surveillez à la maison|deux jours/i);
    expect(out.text).toMatch(/transmets|rappellera|personne du service de santé/i);
    expect(out.escalated).toBe(true);
  }, 60_000);

  it("gives the ordinary answer once the content is signed", async () => {
    vi.stubEnv("DEPLOYMENT_STAGE", "pilot");
    const { appointedBy, drA, drB, chw } = await constituteBoard();
    for (const artefactId of ["general_symptom_intake", "cough_breathing", "child_fever_u5"]) {
      const s = await submitForReview({ boardKey: "crb", kind: "protocol_version", artefactId, submittedBy: appointedBy });
      for (const [user, seat] of [[drA, "physician"], [drB, "physician"], [chw, "community_health_expert"]] as const) {
        await signOff({ submissionId: s.id, memberUserId: user, seat, decision: "approve", contentDigest: s.contentDigest });
      }
    }
    for (const name of ["health_agent", "health_explanation"]) {
      const s = await submitForReview({ boardKey: "crb", kind: "system_prompt", artefactId: name, submittedBy: appointedBy });
      for (const [user, seat] of [[drA, "physician"], [drB, "physician"], [chw, "community_health_expert"]] as const) {
        await signOff({ submissionId: s.id, memberUserId: user, seat, decision: "approve", contentDigest: s.contentDigest });
      }
    }

    const gate = await clinicalGate("child_fever_u5");
    expect(gate.signed).toBe(true);
    expect(gate.mayReassure).toBe(true);

    const out = await ask("Mon enfant a un petit rhume depuis hier, il mange et il joue normalement.");
    expect(out.text).not.toMatch(/le contenu clinique requis n'est pas validé/i);
  }, 90_000);
});
