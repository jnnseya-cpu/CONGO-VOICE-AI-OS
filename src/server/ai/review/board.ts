/**
 * Review boards: who may approve clinical content, and what "approved" means.
 *
 * AI-10 is one sentence: two Congolese physicians and one community health
 * expert approve every health protocol version, emergency script, knowledge
 * document and health system prompt, and nothing health-related ships without
 * that sign-off recorded.
 *
 * Before this module, the repository satisfied that sentence by writing the
 * string "pending CRB" into `approved_by` and treating every protocol as
 * approved. That is worse than no mechanism, because it reads as one. What is
 * here instead:
 *
 *   - A board has seats, and a quorum is a composition, not a count. Three
 *     approvals from three community health experts do not approve a triage
 *     tree; the physicians' seats are unfilled and it stays pending.
 *   - A sign-off is bound to the digest of what the signatory read. Change the
 *     protocol by one word and the approval no longer applies to it.
 *   - Nobody approves their own submission.
 *   - One member can suspend, alone and immediately. Only a quorum can approve.
 *     Safety is always allowed to move in the restrictive direction.
 *   - An approval expires on the board's review cadence, because a decision
 *     tree signed four years ago is not a decision tree anyone is standing
 *     behind today.
 */
import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { BoardSeat, ReviewArtefactKind, ReviewDecision, ReviewSubmission } from "@server/db/schema";
import { readArtefact } from "./artefacts";

/* ── The boards themselves ─────────────────────────────────────────────────── */

export interface BoardDefinition {
  key: string;
  name: string;
  module: "health" | "agriculture" | "education";
  /** Seats that must approve, and how many of each. */
  requiredSeats: Partial<Record<BoardSeat, number>>;
  reviewCadenceDays: number;
}

/**
 * The composition is AI-10's, written out: two physicians and one community
 * health expert. It is a constant rather than a configuration because a board
 * whose quorum can be lowered from an admin screen is not a safeguard.
 */
export const BOARDS: BoardDefinition[] = [
  {
    key: "crb",
    name: "Comité de Revue Clinique",
    module: "health",
    requiredSeats: { physician: 2, community_health_expert: 1 },
    reviewCadenceDays: 365,
  },
  {
    key: "agronomy",
    name: "Panel Agronomie",
    module: "agriculture",
    requiredSeats: { agronomist: 2 },
    reviewCadenceDays: 365,
  },
  {
    key: "pedagogy",
    name: "Panel Pédagogie",
    module: "education",
    requiredSeats: { pedagogue: 1, safeguarding_lead: 1 },
    reviewCadenceDays: 365,
  },
];

export function boardForModule(module: string): BoardDefinition | null {
  return BOARDS.find((b) => b.module === module) ?? null;
}

let seeded: Promise<void> | undefined;

/** Idempotent: records the boards and keeps their composition in step with the code. */
export async function ensureBoards(): Promise<void> {
  return (seeded ??= seedBoards().catch((err) => {
    seeded = undefined;
    throw err;
  }));
}

async function seedBoards(): Promise<void> {
  const db = await getDb();
  for (const board of BOARDS) {
    const [row] = await db.select().from(schema.reviewBoards).where(eq(schema.reviewBoards.key, board.key));
    const values = {
      key: board.key,
      name: board.name,
      module: board.module,
      requiredSeats: board.requiredSeats as Record<string, number>,
      reviewCadenceDays: board.reviewCadenceDays,
    };
    if (!row) await db.insert(schema.reviewBoards).values(values);
    // The code is the source of truth for composition: a row edited in the
    // database is put back rather than honoured.
    else await db.update(schema.reviewBoards).set(values).where(eq(schema.reviewBoards.id, row.id));
  }
}

export async function boardByKey(key: string) {
  await ensureBoards();
  const db = await getDb();
  let [row] = await db.select().from(schema.reviewBoards).where(eq(schema.reviewBoards.key, key));
  if (!row && BOARDS.some((b) => b.key === key)) {
    // The board is defined in code but absent from the database: the seeding
    // promise is remembered across a database that was replaced underneath it
    // (a test reset, a restored snapshot). Seed again rather than report a
    // board that plainly exists as unknown.
    seeded = undefined;
    await ensureBoards();
    [row] = await db.select().from(schema.reviewBoards).where(eq(schema.reviewBoards.key, key));
  }
  return row ?? null;
}

/* ── Membership ────────────────────────────────────────────────────────────── */

export interface Appointment {
  boardKey: string;
  userId: string;
  seat: BoardSeat;
  credential?: string | null;
  appointedBy: string;
}

export async function appointMember(input: Appointment) {
  const board = await boardByKey(input.boardKey);
  if (!board) throw new Error(`unknown board: ${input.boardKey}`);
  const required = board.requiredSeats as Record<string, number>;
  if (!(input.seat in required)) throw new Error(`${board.name} has no ${input.seat} seat`);
  const db = await getDb();
  // Re-appointing someone who was revoked is a new appointment, not an edit:
  // the record of the revocation stays.
  const [row] = await db
    .insert(schema.reviewBoardMembers)
    .values({
      boardId: board.id,
      userId: input.userId,
      seat: input.seat,
      credential: input.credential ?? null,
      appointedBy: input.appointedBy,
    })
    .returning();
  return row;
}

export async function revokeMember(memberId: string, reason: string) {
  const db = await getDb();
  const [row] = await db
    .update(schema.reviewBoardMembers)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(schema.reviewBoardMembers.id, memberId), isNull(schema.reviewBoardMembers.revokedAt)))
    .returning();
  return row ?? null;
}

export async function currentMembers(boardId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.reviewBoardMembers)
    .where(and(eq(schema.reviewBoardMembers.boardId, boardId), isNull(schema.reviewBoardMembers.revokedAt)));
}

/** The seats a person currently holds on a board. Empty means they may not sign. */
export async function seatsOf(boardId: string, userId: string): Promise<BoardSeat[]> {
  const members = await currentMembers(boardId);
  return members.filter((m) => m.userId === userId).map((m) => m.seat);
}

export interface BoardComposition {
  key: string;
  name: string;
  module: string;
  requiredSeats: Record<string, number>;
  filledSeats: Record<string, number>;
  /** True when enough people are appointed that a quorum is reachable at all. */
  constituted: boolean;
  missing: string[];
}

/**
 * Whether the board could reach a quorum if everyone agreed. A board that is
 * not constituted cannot approve anything, which is the state this platform is
 * in until people are appointed — and it is reported rather than worked around.
 */
export async function composition(boardKey: string): Promise<BoardComposition | null> {
  const board = await boardByKey(boardKey);
  if (!board) return null;
  const members = await currentMembers(board.id);
  const required = board.requiredSeats as Record<string, number>;
  const filled: Record<string, number> = {};
  for (const seat of Object.keys(required)) {
    filled[seat] = new Set(members.filter((m) => m.seat === seat).map((m) => m.userId)).size;
  }
  const missing = Object.entries(required)
    .filter(([seat, n]) => (filled[seat] ?? 0) < n)
    .map(([seat, n]) => `${seat}: ${filled[seat] ?? 0}/${n}`);
  return {
    key: board.key,
    name: board.name,
    module: board.module,
    requiredSeats: required,
    filledSeats: filled,
    constituted: missing.length === 0,
    missing,
  };
}

/* ── Quorum ────────────────────────────────────────────────────────────────── */

export interface QuorumResult {
  met: boolean;
  /** Distinct approving members per seat, counted against what the seat requires. */
  bySeat: Record<string, { required: number; approved: number }>;
  missing: string[];
  /** A rejection blocks regardless of how many approvals there are. */
  rejectedBy: string[];
  changesRequestedBy: string[];
}

interface SignoffLike {
  memberUserId: string;
  seat: string;
  decision: ReviewDecision;
  contentDigest: string;
}

/**
 * Pure: the whole approval decision, from the required seats and the sign-offs.
 *
 * Only sign-offs on the digest under review count. A sign-off carried over from
 * an earlier version of the same artefact is not an approval of this one.
 */
export function evaluateQuorum(requiredSeats: Record<string, number>, signoffs: SignoffLike[], contentDigest: string): QuorumResult {
  const current = signoffs.filter((s) => s.contentDigest === contentDigest);
  const rejectedBy = [...new Set(current.filter((s) => s.decision === "reject").map((s) => s.memberUserId))];
  const changesRequestedBy = [...new Set(current.filter((s) => s.decision === "request_changes").map((s) => s.memberUserId))];

  const bySeat: QuorumResult["bySeat"] = {};
  const missing: string[] = [];
  for (const [seat, required] of Object.entries(requiredSeats)) {
    const approved = new Set(
      current.filter((s) => s.decision === "approve" && s.seat === seat).map((s) => s.memberUserId),
    ).size;
    bySeat[seat] = { required, approved };
    if (approved < required) missing.push(`${seat}: ${approved}/${required}`);
  }

  return {
    met: missing.length === 0 && rejectedBy.length === 0 && changesRequestedBy.length === 0,
    bySeat,
    missing,
    rejectedBy,
    changesRequestedBy,
  };
}

/* ── Submissions ───────────────────────────────────────────────────────────── */

export interface SubmitInput {
  boardKey: string;
  kind: ReviewArtefactKind;
  artefactId: string;
  changeNote?: string | null;
  submittedBy: string;
}

export async function submitForReview(input: SubmitInput) {
  const board = await boardByKey(input.boardKey);
  if (!board) throw new Error(`unknown board: ${input.boardKey}`);
  const artefact = await readArtefact(input.kind, input.artefactId);
  if (!artefact) throw new Error(`no such ${input.kind}: ${input.artefactId}`);

  // A version cannot be reviewed before it is recorded, or the approval would
  // have nothing to be written back onto.
  if (input.kind === "protocol_version") {
    const { ensureProtocolsRegistered } = await import("../protocols/registry");
    await ensureProtocolsRegistered();
  }

  const db = await getDb();
  const existing = await db
    .select()
    .from(schema.reviewSubmissions)
    .where(
      and(
        eq(schema.reviewSubmissions.artefactKind, input.kind),
        eq(schema.reviewSubmissions.artefactId, input.artefactId),
      ),
    );

  // The same content already under review, or already decided: resubmitting it
  // must not quietly discard the sign-offs it already carries.
  const sameContent = existing.find((r) => r.contentDigest === artefact.digest && r.status !== "superseded" && r.status !== "withdrawn");
  if (sameContent) return sameContent;

  // Anything still open on an older digest is superseded by this submission.
  const stale = existing.filter((r) => r.status === "pending" || r.status === "changes_requested");
  if (stale.length) {
    await db
      .update(schema.reviewSubmissions)
      .set({ status: "superseded", decidedAt: new Date() })
      .where(inArray(schema.reviewSubmissions.id, stale.map((r) => r.id)));
  }

  const [row] = await db
    .insert(schema.reviewSubmissions)
    .values({
      boardId: board.id,
      artefactKind: input.kind,
      artefactId: artefact.artefactId,
      artefactVersion: artefact.version,
      contentDigest: artefact.digest,
      title: artefact.title,
      changeNote: input.changeNote ?? null,
      submittedBy: input.submittedBy,
      status: "pending",
    })
    .returning();
  return row;
}

export class ReviewRefused extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
  }
}

export interface SignInput {
  submissionId: string;
  memberUserId: string;
  seat: BoardSeat;
  decision: ReviewDecision;
  comment?: string | null;
  /** The digest the reviewer was shown, so a stale screen cannot sign new content. */
  contentDigest: string;
}

export async function signOff(input: SignInput): Promise<{ submission: ReviewSubmission; quorum: QuorumResult }> {
  const db = await getDb();
  const [submission] = await db.select().from(schema.reviewSubmissions).where(eq(schema.reviewSubmissions.id, input.submissionId));
  if (!submission) throw new ReviewRefused("unknown_submission", "Cette soumission n'existe pas.");
  if (submission.status === "superseded" || submission.status === "withdrawn") {
    throw new ReviewRefused("not_open", "Cette version a été remplacée ; signez la version courante.");
  }
  if (submission.status === "suspended") {
    throw new ReviewRefused("suspended", "Cette version est suspendue ; elle doit être resoumise.");
  }
  if (input.contentDigest !== submission.contentDigest) {
    throw new ReviewRefused("digest_mismatch", "Le contenu a changé depuis son affichage. Relisez la version courante avant de signer.");
  }

  // The author of a change is not one of its reviewers.
  if (submission.submittedBy && submission.submittedBy === input.memberUserId) {
    throw new ReviewRefused("self_approval", "On ne signe pas sa propre soumission.");
  }

  const seats = await seatsOf(submission.boardId, input.memberUserId);
  if (seats.length === 0) throw new ReviewRefused("not_a_member", "Vous ne siégez pas à ce comité.");
  if (!seats.includes(input.seat)) throw new ReviewRefused("wrong_seat", `Vous ne détenez pas le siège « ${input.seat} ».`);

  await db.insert(schema.reviewSignoffs).values({
    submissionId: submission.id,
    boardId: submission.boardId,
    memberUserId: input.memberUserId,
    seat: input.seat,
    decision: input.decision,
    comment: input.comment ?? null,
    contentDigest: input.contentDigest,
  });

  return { submission: await recomputeStatus(submission.id), quorum: await quorumFor(submission.id) };
}

export async function quorumFor(submissionId: string): Promise<QuorumResult> {
  const db = await getDb();
  const [submission] = await db.select().from(schema.reviewSubmissions).where(eq(schema.reviewSubmissions.id, submissionId));
  if (!submission) return { met: false, bySeat: {}, missing: ["unknown submission"], rejectedBy: [], changesRequestedBy: [] };
  const [board] = await db.select().from(schema.reviewBoards).where(eq(schema.reviewBoards.id, submission.boardId));
  const signoffs = await db.select().from(schema.reviewSignoffs).where(eq(schema.reviewSignoffs.submissionId, submissionId));
  return evaluateQuorum(board.requiredSeats as Record<string, number>, signoffs, submission.contentDigest);
}

async function recomputeStatus(submissionId: string): Promise<ReviewSubmission> {
  const db = await getDb();
  const [submission] = await db.select().from(schema.reviewSubmissions).where(eq(schema.reviewSubmissions.id, submissionId));
  const [board] = await db.select().from(schema.reviewBoards).where(eq(schema.reviewBoards.id, submission.boardId));
  const quorum = await quorumFor(submissionId);

  let status = submission.status;
  let decidedAt = submission.decidedAt;
  let expiresAt = submission.expiresAt;
  if (quorum.rejectedBy.length > 0) {
    status = "rejected";
    decidedAt = new Date();
  } else if (quorum.changesRequestedBy.length > 0) {
    status = "changes_requested";
    decidedAt = new Date();
  } else if (quorum.met) {
    status = "approved";
    decidedAt = new Date();
    expiresAt = new Date(Date.now() + board.reviewCadenceDays * 86_400_000);
  } else {
    status = "pending";
    decidedAt = null;
    expiresAt = null;
  }

  const [row] = await db
    .update(schema.reviewSubmissions)
    .set({ status, decidedAt, expiresAt })
    .where(eq(schema.reviewSubmissions.id, submissionId))
    .returning();
  await writeBackApproval(row);
  return row;
}

/**
 * AI-10 asks for the sign-off to be "recorded in protocol_versions.approved_by".
 * The sign-off record is the truth — the gate reads that, not this column — but
 * the column is what a reviewer looking at the catalogue sees, so it is kept in
 * step: the signatories' seats and the submission that carries their names.
 */
async function writeBackApproval(submission: ReviewSubmission): Promise<void> {
  const db = await getDb();
  const approved = submission.status === "approved";
  const signoffs = approved
    ? await db.select().from(schema.reviewSignoffs).where(eq(schema.reviewSignoffs.submissionId, submission.id))
    : [];
  const seats = signoffs
    .filter((x) => x.decision === "approve" && x.contentDigest === submission.contentDigest)
    .map((x) => x.seat)
    .sort();
  const label = approved ? `CRB ${seats.join("+")} · ${submission.id.slice(0, 8)}`.slice(0, 120) : null;

  try {
    if (submission.artefactKind === "protocol_version") {
      await db
        .update(schema.protocolVersions)
        .set({
          status: approved ? "approved" : "review",
          approvedBy: label,
          approvedAt: approved ? (submission.decidedAt ?? new Date()) : null,
        })
        .where(
          and(
            eq(schema.protocolVersions.protocolId, submission.artefactId),
            eq(schema.protocolVersions.version, submission.artefactVersion),
          ),
        );
    } else if (submission.artefactKind === "kb_document") {
      await db
        .update(schema.kbDocuments)
        .set({ status: approved ? "approved" : "review", approvedBy: label })
        .where(eq(schema.kbDocuments.docId, submission.artefactId));
    }
  } catch (err) {
    // The catalogue column is a convenience; failing to update it must not make
    // a recorded sign-off disappear.
    console.error("[review] approval write-back failed", err);
  }
}

/**
 * Rollback power (PRD §15.4). One member, acting alone, takes an approved
 * artefact out of service immediately. The asymmetry is deliberate: it takes
 * three people to say something is safe and one to say it is not.
 */
export async function suspend(submissionId: string, memberUserId: string, reason: string) {
  const db = await getDb();
  const [submission] = await db.select().from(schema.reviewSubmissions).where(eq(schema.reviewSubmissions.id, submissionId));
  if (!submission) throw new ReviewRefused("unknown_submission", "Cette soumission n'existe pas.");
  const seats = await seatsOf(submission.boardId, memberUserId);
  if (seats.length === 0) throw new ReviewRefused("not_a_member", "Vous ne siégez pas à ce comité.");
  const [row] = await db
    .update(schema.reviewSubmissions)
    .set({ status: "suspended", suspendedBy: memberUserId, suspendedAt: new Date(), suspendReason: reason })
    .where(eq(schema.reviewSubmissions.id, submissionId))
    .returning();
  // The catalogue must not go on saying "approved" about something that was
  // just withdrawn — the gate already refuses it, but a reviewer reading the
  // protocol list would be told the opposite.
  await writeBackApproval(row);
  return row;
}

/* ── The question everything else asks ─────────────────────────────────────── */

export interface ApprovalState {
  approved: boolean;
  /** Why not, in one of a fixed set of words, so callers can branch on it. */
  reason:
    | "approved"
    | "never_submitted"
    | "pending"
    | "rejected"
    | "changes_requested"
    | "suspended"
    | "content_changed"
    | "expired"
    | "unknown_artefact";
  submissionId?: string;
  approvedAt?: Date | null;
  expiresAt?: Date | null;
  signatories?: Array<{ userId: string; seat: string; signedAt: Date }>;
}

/**
 * Is this artefact, exactly as it would ship right now, covered by a current
 * board approval? Every enforcement point in the platform asks this.
 */
export async function approvalFor(kind: ReviewArtefactKind, artefactId: string, now: Date = new Date()): Promise<ApprovalState> {
  const artefact = await readArtefact(kind, artefactId);
  if (!artefact) return { approved: false, reason: "unknown_artefact" };

  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.reviewSubmissions)
    .where(and(eq(schema.reviewSubmissions.artefactKind, kind), eq(schema.reviewSubmissions.artefactId, artefactId)))
    .orderBy(desc(schema.reviewSubmissions.submittedAt));

  if (rows.length === 0) return { approved: false, reason: "never_submitted" };

  const forThisContent = rows.filter((r) => r.contentDigest === artefact.digest);
  if (forThisContent.length === 0) {
    // Something was reviewed, but not what is about to ship.
    return { approved: false, reason: "content_changed" };
  }

  const suspended = forThisContent.find((r) => r.status === "suspended");
  if (suspended) return { approved: false, reason: "suspended", submissionId: suspended.id };

  const approved = forThisContent.find((r) => r.status === "approved");
  if (!approved) {
    const latest = forThisContent[0];
    const reason = latest.status === "rejected" ? "rejected" : latest.status === "changes_requested" ? "changes_requested" : "pending";
    return { approved: false, reason, submissionId: latest.id };
  }

  if (approved.expiresAt && approved.expiresAt.getTime() <= now.getTime()) {
    return { approved: false, reason: "expired", submissionId: approved.id, approvedAt: approved.decidedAt, expiresAt: approved.expiresAt };
  }

  const signoffs = await db.select().from(schema.reviewSignoffs).where(eq(schema.reviewSignoffs.submissionId, approved.id));
  return {
    approved: true,
    reason: "approved",
    submissionId: approved.id,
    approvedAt: approved.decidedAt,
    expiresAt: approved.expiresAt,
    signatories: signoffs
      .filter((s) => s.decision === "approve" && s.contentDigest === approved.contentDigest)
      .map((s) => ({ userId: s.memberUserId, seat: s.seat, signedAt: s.signedAt })),
  };
}
