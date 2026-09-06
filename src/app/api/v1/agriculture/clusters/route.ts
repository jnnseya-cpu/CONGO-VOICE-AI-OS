import { z } from "zod";
import { handle } from "@/lib/core/api";
import { badRequest, notFound } from "@/lib/core/errors";
import { audit } from "@/lib/core/audit";
import { clusterConfig, detectClusters, listClusters, publishCluster, validateCluster, type ClusterStatus } from "@/lib/ai/agents/clusters";
import { normaliseProvince } from "@/lib/db/reference/agriculture";

const STATUSES = ["unverified", "under_review", "confirmed", "rejected", "closed"] as const;

/** Clusters of similar reports (FR-AG-08). Territory is withheld below the privacy threshold. */
export const GET = handle({ permission: "dashboard:agri" }, async ({ req }) => {
  const q = req.nextUrl.searchParams;
  const status = q.get("status");
  if (status && !STATUSES.includes(status as ClusterStatus)) throw badRequest(`Statut inconnu : ${status}`, { statuses: STATUSES });
  const { clusters, config } = await listClusters({
    province: normaliseProvince(q.get("province")),
    status: (status as ClusterStatus | null) ?? null,
    issue: q.get("issue"),
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
  });
  return { clusters, config, notice: "Un groupe de signalements n'est jamais une épidémie confirmée : seule une visite de terrain valide un foyer." };
});

const RunBody = z.object({ province: z.string().max(120).optional(), threshold: z.number().int().min(2).max(100).optional(), windowDays: z.number().int().min(1).max(90).optional() });

/** Runs the detection pass now (also triggered after each agriculture report). */
export const POST = handle({ permission: "dashboard:agri" }, async ({ user, json, ip }) => {
  const body = await json(RunBody);
  const overrides: { threshold?: number; windowDays?: number } = {};
  if (body.threshold !== undefined) overrides.threshold = body.threshold;
  if (body.windowDays !== undefined) overrides.windowDays = body.windowDays;
  const result = await detectClusters({ province: normaliseProvince(body.province ?? null), config: overrides });
  const config = await clusterConfig();
  await audit({ action: "agriculture.clusters_detected", actorUserId: user.userId, actorRole: user.role, after: { created: result.created.length, updated: result.updated.length }, ip });
  return {
    created: result.created.map((c) => publishCluster(c, result.config)),
    updated: result.updated.map((c) => publishCluster(c, result.config)),
    groupsExamined: result.groupsExamined,
    config,
  };
});

const ValidateBody = z.object({ id: z.string().uuid(), status: z.enum(STATUSES), note: z.string().max(1000).optional() });

/** Officer validation: unverified → under_review → confirmed / rejected → closed. */
export const PATCH = handle({ permission: "case:write" }, async ({ user, json, ip }) => {
  const body = await json(ValidateBody);
  const result = await validateCluster(body.id, body.status, { userId: user.userId, role: user.role }, body.note ?? null);
  if (!result.ok) {
    if (result.error?.includes("introuvable")) throw notFound(result.error);
    throw badRequest(result.error ?? "Validation impossible");
  }
  const config = await clusterConfig();
  await audit({ action: "agriculture.cluster_validated", actorUserId: user.userId, actorRole: user.role, entityType: "agri_cluster", entityId: body.id, after: { status: body.status, note: body.note ?? null }, ip });
  return { cluster: publishCluster(result.cluster!, config) };
});
