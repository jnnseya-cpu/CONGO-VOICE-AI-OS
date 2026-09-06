/**
 * POST /api/v1/sessions/{id}/resume — pick a conversation back up within 24 hours,
 * with the "where we left off" summary and the remaining chunks of the last answer
 * (FR-CH-06, FR-CH-04).
 */
import { eq } from "drizzle-orm";
import { handle } from "@/lib/core/api";
import { schema } from "@/lib/db/client";
import { emitEvent } from "@/lib/core/events";
import { ChannelError } from "@/lib/channels/errors";
import { channelGuard, loadOwnedSession, requestId } from "@/lib/channels/http";
import { readState, resumeSummary, RESUME_WINDOW_MS, shouldConfirmSharedPhone } from "@/lib/channels/session";
import { t } from "@/lib/channels/strings";

export const POST = handle<{ id: string }>({ permission: "interaction:create" }, async ({ req, db, user, params }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const session = await loadOwnedSession(params.id, user, language, id);
    const age = Date.now() - new Date(session.startedAt).getTime();
    if (age > RESUME_WINDOW_MS) {
      throw new ChannelError("STATE_CONFLICT", {
        language,
        requestId: id,
        fields: ["session_id"],
        detail: "resume window expired",
        extra: { session_id: session.id },
      });
    }
    const [row] = await db
      .update(schema.sessions)
      .set({ status: "active", endedAt: null })
      .where(eq(schema.sessions.id, session.id))
      .returning();
    const state = readState(row);
    await emitEvent({
      type: "cvos.session.resumed",
      aggregateType: "session",
      aggregateId: row.id,
      actor: { type: "citizen", id: row.userId },
      channel: row.channel,
      language: row.language,
      payload: { turnCount: row.turnCount, via: "api" },
    });
    return {
      session: {
        id: row.id,
        channel: row.channel,
        language: row.language,
        module: row.module,
        status: row.status,
        turnCount: row.turnCount,
      },
      resumeSummary: resumeSummary(row),
      lastAnswer: state.lastAnswer ?? null,
      lastInteractionId: state.lastInteractionId ?? null,
      pendingChunks: Math.max(0, (state.continuation?.chunks.length ?? 0) - ((state.continuation?.index ?? 0) + 1)),
      sharedPhonePrompt: shouldConfirmSharedPhone(row) ? t("sharedPhone", row.language ?? language) : null,
      request_id: id,
    };
  });
});
