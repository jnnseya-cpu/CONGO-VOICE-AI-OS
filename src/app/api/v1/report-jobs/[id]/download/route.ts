import { handle } from "@/lib/core/api";
import { ApiError, notFound } from "@/lib/core/errors";
import { audit } from "@/lib/core/audit";
import { getReportFile } from "@/lib/reports";

/**
 * Stream a finished report. Links expire after seven days; every download is audited with
 * its purpose code, because an institutional export leaves the platform's control.
 */
export const GET = handle<{ id: string }>({ permission: "report:export" }, async ({ user, params, ip }) => {
  const { file, reason } = await getReportFile(params.id);
  if (!file) {
    if (reason === "expired") throw new ApiError(410, "Ce lien de téléchargement a expiré (7 jours). Relancez le rapport.", "gone");
    if (reason === "not_ready") throw new ApiError(409, "Rapport pas encore prêt.", "not_ready");
    throw notFound();
  }
  await audit({
    action: "report.downloaded",
    actorUserId: user.userId,
    actorRole: user.role,
    entityType: "report",
    entityId: params.id,
    after: { filename: file.filename, sizeBytes: file.sizeBytes },
    purpose: "institutional_export",
    ip,
  });
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
