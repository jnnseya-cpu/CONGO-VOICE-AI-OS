/**
 * Agricultural cluster detection (FR-AG-08 / 6.4).
 *
 * Deterministic, auditable rule: when at least N reports (default 5) describe the same
 * issue on the same crop, in the same territory — or failing that the same province —
 * within a rolling window (default 14 days), an `agri_clusters` row is opened with status
 * "unverified", an `agri.cluster.detected` event is emitted and the extension network is
 * alerted. The platform never declares an outbreak: only a qualified officer validates.
 *
 * Privacy: a cluster whose report count is below the privacy threshold is published
 * without its territory, so that a handful of farms cannot be re-identified.
 */
import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { notifyRole } from "@/lib/core/notifications";
import { emitEvent } from "@/lib/core/events";

export const CLUSTER_DEFAULTS = { threshold: 5, windowDays: 14, privacyMin: 5 } as const;

export type ClusterStatus = "unverified" | "under_review" | "confirmed" | "rejected" | "closed";
export type AgriCluster = typeof schema.agriClusters.$inferSelect;

export interface ClusterConfig {
  threshold: number;
  windowDays: number;
  privacyMin: number;
}

interface ConfigShape {
  threshold?: unknown;
  windowDays?: unknown;
  privacyMin?: unknown;
}

const CONFIG_KEY = "agri.cluster";

export async function clusterConfig(): Promise<ClusterConfig> {
  const cfg: ClusterConfig = { ...CLUSTER_DEFAULTS };
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(schema.adminConfig)
      .where(inArray(schema.adminConfig.key, [CONFIG_KEY, "agri.cluster.threshold", "agri.cluster.windowDays", "agri.cluster.privacyMin"]));
    for (const row of rows) {
      if (row.key === CONFIG_KEY && row.value && typeof row.value === "object") {
        const v = row.value as ConfigShape;
        if (Number.isFinite(Number(v.threshold))) cfg.threshold = Number(v.threshold);
        if (Number.isFinite(Number(v.windowDays))) cfg.windowDays = Number(v.windowDays);
        if (Number.isFinite(Number(v.privacyMin))) cfg.privacyMin = Number(v.privacyMin);
      } else if (Number.isFinite(Number(row.value))) {
        if (row.key.endsWith("threshold")) cfg.threshold = Number(row.value);
        if (row.key.endsWith("windowDays")) cfg.windowDays = Number(row.value);
        if (row.key.endsWith("privacyMin")) cfg.privacyMin = Number(row.value);
      }
    }
  } catch (err) {
    console.warn("[clusters] config unavailable, using defaults", err);
  }
  cfg.threshold = Math.max(2, Math.round(cfg.threshold));
  cfg.windowDays = Math.max(1, Math.round(cfg.windowDays));
  cfg.privacyMin = Math.max(1, Math.round(cfg.privacyMin));
  return cfg;
}

/* ------------------------------------------------------------------------------------------
 * Grouping
 * ---------------------------------------------------------------------------------------- */

interface ReportRow {
  id: string;
  province: string | null;
  territory: string | null;
  cropType: string | null;
  issueType: string | null;
  candidates: Array<{ label: string; prob: number }>;
  createdAt: Date;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** The clinical label of a report: the top candidate when there is one, else the issue type. */
export function issueLabelOf(r: { candidates?: Array<{ label: string; prob?: number }> | null; issueType?: string | null }): string {
  const top = (r.candidates ?? [])[0];
  if (top?.label) return top.label;
  return r.issueType ?? "signalement";
}

export interface DetectOptions {
  now?: Date;
  province?: string | null;
  config?: Partial<ClusterConfig>;
  /** Skip notifications and events (used by dry runs). */
  silent?: boolean;
}

export interface DetectResult {
  created: AgriCluster[];
  updated: AgriCluster[];
  groupsExamined: number;
  config: ClusterConfig;
}

/** Scans recent agriculture reports and opens or refreshes clusters. */
export async function detectClusters(opts: DetectOptions = {}): Promise<DetectResult> {
  const db = await getDb();
  const base = await clusterConfig();
  const config: ClusterConfig = { ...base, ...cleanConfig(opts.config) };
  const now = opts.now ?? new Date();
  const windowStart = new Date(now.getTime() - config.windowDays * 24 * 3600 * 1000);

  const rows = (await db
    .select({
      id: schema.agricultureReports.id,
      province: schema.agricultureReports.province,
      territory: schema.agricultureReports.territory,
      cropType: schema.agricultureReports.cropType,
      issueType: schema.agricultureReports.issueType,
      candidates: schema.agricultureReports.candidates,
      createdAt: schema.agricultureReports.createdAt,
    })
    .from(schema.agricultureReports)
    .where(
      and(
        gte(schema.agricultureReports.createdAt, windowStart),
        opts.province ? eq(schema.agricultureReports.province, opts.province) : undefined,
      ),
    )) as ReportRow[];

  // Territory-level groups first, then province-level for whatever is left.
  const territoryGroups = new Map<string, ReportRow[]>();
  const provinceGroups = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const issue = issueLabelOf(r);
    const crop = r.cropType ?? "inconnu";
    if (!r.province) continue;
    const pKey = [norm(issue), norm(crop), norm(r.province)].join("|");
    provinceGroups.set(pKey, [...(provinceGroups.get(pKey) ?? []), r]);
    if (r.territory) {
      const tKey = [norm(issue), norm(crop), norm(r.province), norm(r.territory)].join("|");
      territoryGroups.set(tKey, [...(territoryGroups.get(tKey) ?? []), r]);
    }
  }

  const created: AgriCluster[] = [];
  const updated: AgriCluster[] = [];
  const coveredProvinceKeys = new Set<string>();

  for (const [, group] of territoryGroups) {
    if (group.length < config.threshold) continue;
    const head = group[0];
    coveredProvinceKeys.add([norm(issueLabelOf(head)), norm(head.cropType ?? "inconnu"), norm(head.province)].join("|"));
    const r = await upsertCluster(group, { territory: head.territory, now, windowStart, silent: opts.silent });
    (r.isNew ? created : updated).push(r.cluster);
  }

  for (const [key, group] of provinceGroups) {
    if (coveredProvinceKeys.has(key)) continue;
    if (group.length < config.threshold) continue;
    const r = await upsertCluster(group, { territory: null, now, windowStart, silent: opts.silent });
    (r.isNew ? created : updated).push(r.cluster);
  }

  return { created, updated, groupsExamined: territoryGroups.size + provinceGroups.size, config };
}

function cleanConfig(c?: Partial<ClusterConfig>): Partial<ClusterConfig> {
  if (!c) return {};
  const out: Partial<ClusterConfig> = {};
  if (Number.isFinite(c.threshold)) out.threshold = Math.max(2, Math.round(c.threshold as number));
  if (Number.isFinite(c.windowDays)) out.windowDays = Math.max(1, Math.round(c.windowDays as number));
  if (Number.isFinite(c.privacyMin)) out.privacyMin = Math.max(1, Math.round(c.privacyMin as number));
  return out;
}

const OPEN_STATUSES: ClusterStatus[] = ["unverified", "under_review", "confirmed"];

async function upsertCluster(
  group: ReportRow[],
  opts: { territory: string | null; now: Date; windowStart: Date; silent?: boolean },
): Promise<{ cluster: AgriCluster; isNew: boolean }> {
  const db = await getDb();
  const head = group[0];
  const issue = issueLabelOf(head);
  const crop = head.cropType ?? "inconnu";
  const province = head.province;
  const earliest = group.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), group[0].createdAt);

  const existing = await db
    .select()
    .from(schema.agriClusters)
    .where(
      and(
        eq(schema.agriClusters.issue, issue),
        province ? eq(schema.agriClusters.province, province) : sql`${schema.agriClusters.province} is null`,
        opts.territory ? eq(schema.agriClusters.territory, opts.territory) : sql`${schema.agriClusters.territory} is null`,
        eq(schema.agriClusters.crop, crop),
        inArray(schema.agriClusters.status, OPEN_STATUSES),
        gte(schema.agriClusters.windowEnd, opts.windowStart),
      ),
    )
    .orderBy(desc(schema.agriClusters.windowEnd))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(schema.agriClusters)
      .set({ reportCount: group.length, windowEnd: opts.now, updatedAt: new Date() })
      .where(eq(schema.agriClusters.id, existing[0].id))
      .returning();
    return { cluster: row, isNew: false };
  }

  const [row] = await db
    .insert(schema.agriClusters)
    .values({
      province,
      territory: opts.territory,
      crop,
      issue,
      reportCount: group.length,
      windowStart: earliest,
      windowEnd: opts.now,
      status: "unverified",
    })
    .returning();

  if (!opts.silent) {
    await emitEvent({
      type: "agri.cluster.detected",
      aggregateType: "agri_cluster",
      aggregateId: row.id,
      module: "agriculture",
      classification: "internal",
      actor: { type: "system" },
      payload: { issue, crop, province, territory: opts.territory, reportCount: group.length, windowStart: earliest.toISOString(), windowEnd: opts.now.toISOString() },
    });
    try {
      await notifyRole(
        "agri_officer",
        {
          type: "alert",
          title: `Signalements groupés : ${issue} sur ${crop}`,
          body: `${group.length} signalements similaires${province ? ` à ${province}` : ""}${opts.territory ? ` / ${opts.territory}` : ""} depuis le ${earliest.toISOString().slice(0, 10)}. Statut : non vérifié — une visite de terrain est nécessaire avant toute confirmation.`,
          payload: { clusterId: row.id, issue, crop, province, territory: opts.territory, reportCount: group.length },
        },
        province,
      );
    } catch (err) {
      console.error("[clusters] alert failed", err);
    }
  }
  return { cluster: row, isNew: true };
}

/* ------------------------------------------------------------------------------------------
 * Publication with privacy suppression
 * ---------------------------------------------------------------------------------------- */

export interface PublishedCluster {
  id: string;
  issue: string;
  crop: string | null;
  province: string | null;
  territory: string | null;
  reportCount: number;
  status: string;
  windowStart: string;
  windowEnd: string;
  suppressed: boolean;
  note: string | null;
}

/**
 * Applies the privacy threshold. Below `privacyMin` reports the territory is withheld even
 * from officers' list views; the exact figure is only released above the threshold.
 */
export function publishCluster(c: AgriCluster, config: ClusterConfig): PublishedCluster {
  const suppressed = c.reportCount < config.privacyMin;
  return {
    id: c.id,
    issue: c.issue,
    crop: c.crop,
    province: c.province,
    territory: suppressed ? null : c.territory,
    reportCount: suppressed ? config.privacyMin : c.reportCount,
    status: c.status,
    windowStart: (c.windowStart instanceof Date ? c.windowStart : new Date(c.windowStart)).toISOString(),
    windowEnd: (c.windowEnd instanceof Date ? c.windowEnd : new Date(c.windowEnd)).toISOString(),
    suppressed,
    note: suppressed
      ? `Localisation précise et effectif masqués : moins de ${config.privacyMin} signalements, la zone est trop petite pour être publiée sans risque d'identification.`
      : null,
  };
}

export interface ListClustersQuery {
  province?: string | null;
  status?: ClusterStatus | null;
  issue?: string | null;
  limit?: number;
}

export async function listClusters(q: ListClustersQuery = {}): Promise<{ clusters: PublishedCluster[]; config: ClusterConfig }> {
  const db = await getDb();
  const config = await clusterConfig();
  const conds = [];
  if (q.province) conds.push(eq(schema.agriClusters.province, q.province));
  if (q.status) conds.push(eq(schema.agriClusters.status, q.status));
  if (q.issue) conds.push(sql`${schema.agriClusters.issue} ILIKE ${"%" + q.issue + "%"}`);
  const rows = await db
    .select()
    .from(schema.agriClusters)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.agriClusters.windowEnd))
    .limit(Math.min(200, Math.max(1, q.limit ?? 50)));
  return { clusters: rows.map((c) => publishCluster(c, config)), config };
}

/* ------------------------------------------------------------------------------------------
 * Validation workflow
 * ---------------------------------------------------------------------------------------- */

export const CLUSTER_TRANSITIONS: Record<ClusterStatus, ClusterStatus[]> = {
  unverified: ["under_review", "rejected"],
  under_review: ["confirmed", "rejected", "unverified"],
  confirmed: ["closed"],
  rejected: ["closed", "under_review"],
  closed: [],
};

export function canTransition(from: string, to: ClusterStatus): boolean {
  return (CLUSTER_TRANSITIONS[from as ClusterStatus] ?? []).includes(to);
}

export interface ValidationResult {
  ok: boolean;
  cluster?: AgriCluster;
  error?: string;
}

/** Officer validation. Only the transitions above are accepted; every change is an event. */
export async function validateCluster(
  clusterId: string,
  to: ClusterStatus,
  actor: { userId: string; role: string },
  note?: string | null,
): Promise<ValidationResult> {
  const db = await getDb();
  const [current] = await db.select().from(schema.agriClusters).where(eq(schema.agriClusters.id, clusterId));
  if (!current) return { ok: false, error: "Groupe de signalements introuvable" };
  if (!canTransition(current.status, to)) {
    return { ok: false, error: `Transition non autorisée : ${current.status} → ${to}` };
  }
  const [row] = await db
    .update(schema.agriClusters)
    .set({ status: to, validatedBy: actor.userId, updatedAt: new Date() })
    .where(eq(schema.agriClusters.id, clusterId))
    .returning();
  await emitEvent({
    type: "agri.cluster.validated",
    aggregateType: "agri_cluster",
    aggregateId: clusterId,
    module: "agriculture",
    classification: "internal",
    actor: { type: "worker", id: actor.userId },
    payload: { from: current.status, to, note: note ?? null, role: actor.role },
  });
  return { ok: true, cluster: row };
}
