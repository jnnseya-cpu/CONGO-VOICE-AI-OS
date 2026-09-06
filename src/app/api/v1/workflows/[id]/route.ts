/**
 * GET /api/v1/workflows/{id} — processing status of one interaction: the stage it has
 * reached and the safe partial state already available.
 */
import { handle } from "@server/core/api";
import { hasPermission } from "@server/core/rbac";
import { ChannelError } from "@server/channels/errors";
import { channelGuard, requestId } from "@server/channels/http";
import { loadInteraction, toWorkflowStatus } from "@server/channels/workflow";

export const GET = handle<{ id: string }>({ permission: "interaction:create", limit: "none" }, async ({ req, user, params }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const row = await loadInteraction(params.id);
    if (!row) throw new ChannelError("NOT_FOUND", { language, requestId: id, fields: ["id"] });
    const canReadAll = hasPermission(user.role, "interaction:read_all") || hasPermission(user.role, "case:read");
    if (row.userId !== user.userId && !canReadAll) {
      throw new ChannelError("NOT_FOUND", { language, requestId: id, fields: ["id"] });
    }
    return { workflow: toWorkflowStatus(row), request_id: id };
  });
});
