/**
 * Protocol registry: the JSON definitions are the source of truth in the repository, and
 * every version is recorded in `protocol_versions` the first time it is used, so a triage
 * decision can always be replayed against the exact tree that produced it.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@server/db/client";
import type { LifecycleStatus } from "./lifecycle";
import { HEALTH_PROTOCOLS, getProtocol } from "./definitions";
import { validateProtocol } from "./engine";
import type { HealthProtocol } from "./types";

/**
 * Registration records a protocol version; it does not approve it.
 *
 * This used to insert every version as `status: "approved"` with the string
 * "pending CRB" in `approved_by`, which meant the platform's own record said a
 * clinical decision tree had been signed off when nobody had looked at it. A
 * newly registered version now sits in `review` with no approver, and only the
 * Clinical Review Board's quorum moves it to `approved` (AI-10).
 */
const REGISTERED_STATUS = "review" as const;

let registered: Promise<void> | undefined;

/** Idempotent: records every protocol version that is not yet in the database. */
export async function ensureProtocolsRegistered(): Promise<void> {
  await (registered ??= registerAll().catch((err) => {
    registered = undefined;
    console.error("[protocols] registration failed", err);
  }));

  // The promise above is remembered for the life of the process. If the
  // database it wrote to is replaced underneath it — a restored snapshot, a
  // failover to a fresh instance, a test reset — the catalogue is empty while
  // this still believes the work is done, and every triage decision would then
  // be replayed against a version nobody recorded. One indexed row is a cheap
  // way never to be in that state.
  try {
    const db = await getDb();
    const [any] = await db.select({ id: schema.protocolVersions.id }).from(schema.protocolVersions).limit(1);
    if (!any) {
      registered = undefined;
      await (registered ??= registerAll().catch((err) => {
        registered = undefined;
        console.error("[protocols] registration failed", err);
      }));
    }
  } catch (err) {
    console.error("[protocols] registration check failed", err);
  }
}

async function registerAll(): Promise<void> {
  const db = await getDb();
  for (const protocol of HEALTH_PROTOCOLS) {
    const problems = validateProtocol(protocol);
    if (problems.length) throw new Error(`Invalid protocol definition: ${problems.join("; ")}`);
    const [existing] = await db
      .select()
      .from(schema.protocolVersions)
      .where(and(eq(schema.protocolVersions.protocolId, protocol.id), eq(schema.protocolVersions.version, protocol.version)));
    if (existing) continue;
    await db.insert(schema.protocolVersions).values({
      protocolId: protocol.id,
      version: protocol.version,
      module: "health",
      title: protocol.title,
      definition: protocol as unknown as Record<string, unknown>,
      status: REGISTERED_STATUS,
      approvedBy: null,
      approvedAt: null,
    });
  }
}

export interface ProtocolSummary {
  protocolId: string;
  version: string;
  title: string;
  status: LifecycleStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  questionCount: number;
  ruleIds: string[];
  citations: string[];
}

export async function listProtocols(): Promise<ProtocolSummary[]> {
  await ensureProtocolsRegistered();
  const db = await getDb();
  const rows = await db.select().from(schema.protocolVersions);
  return rows
    .map((r) => {
      const def = getProtocol(r.protocolId);
      return {
        protocolId: r.protocolId,
        version: r.version,
        title: r.title,
        status: r.status as LifecycleStatus,
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt,
        questionCount: def ? Object.keys(def.questions).length : 0,
        ruleIds: def ? def.rules.map((x) => x.id) : [],
        citations: def?.citations ?? [],
      };
    })
    .sort((a, b) => a.protocolId.localeCompare(b.protocolId));
}

/**
 * Moves a version through its lifecycle. Note what it cannot do: it cannot
 * record an approval on behalf of the board. `approvedBy` is written by the
 * review board when a quorum is reached, and an administrator calling this with
 * `status: "approved"` produces a version marked approved by nobody — which the
 * clinical gate treats exactly like an unapproved one, because what the gate
 * reads is the sign-off record, not this column.
 */
export async function setProtocolStatus(protocolId: string, version: string, status: LifecycleStatus, approvedBy?: string) {
  const db = await getDb();
  const [row] = await db
    .update(schema.protocolVersions)
    .set({
      status,
      approvedBy: status === "approved" ? (approvedBy ?? null) : undefined,
      approvedAt: status === "approved" ? new Date() : undefined,
    })
    .where(and(eq(schema.protocolVersions.protocolId, protocolId), eq(schema.protocolVersions.version, version)))
    .returning();
  return row ?? null;
}

/**
 * The live definition for a protocol id, refusing a draft or a retired version.
 *
 * This decides whether a protocol may be *run*; the review board decides what
 * the platform may *say* about the result. The engine still computes a severity
 * from an unsigned protocol, because the record of what the rules concluded is
 * worth having — but `clinicalGate()` stops that conclusion reaching a citizen
 * as anything less than an escalation.
 */
export async function loadApprovedProtocol(protocolId: string): Promise<HealthProtocol | null> {
  await ensureProtocolsRegistered();
  const definition = getProtocol(protocolId);
  if (!definition) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.protocolVersions)
    .where(and(eq(schema.protocolVersions.protocolId, protocolId), eq(schema.protocolVersions.version, definition.version)));
  if (row && (row.status === "retired" || row.status === "draft")) return null;
  return definition;
}
