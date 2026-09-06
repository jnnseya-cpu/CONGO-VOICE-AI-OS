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

const PENDING_APPROVER = "pending CRB";

let registered: Promise<void> | undefined;

/** Idempotent: records every protocol version that is not yet in the database. */
export async function ensureProtocolsRegistered(): Promise<void> {
  return (registered ??= registerAll().catch((err) => {
    registered = undefined;
    console.error("[protocols] registration failed", err);
  }));
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
      status: "approved",
      approvedBy: PENDING_APPROVER,
      approvedAt: new Date(),
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

export async function setProtocolStatus(protocolId: string, version: string, status: LifecycleStatus, approvedBy?: string) {
  const db = await getDb();
  const [row] = await db
    .update(schema.protocolVersions)
    .set({
      status,
      approvedBy: status === "approved" ? (approvedBy ?? PENDING_APPROVER) : undefined,
      approvedAt: status === "approved" ? new Date() : undefined,
    })
    .where(and(eq(schema.protocolVersions.protocolId, protocolId), eq(schema.protocolVersions.version, version)))
    .returning();
  return row ?? null;
}

/** The live definition for a protocol id, refusing anything not approved in the database. */
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
