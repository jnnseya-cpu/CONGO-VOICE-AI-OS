/**
 * GET /api/v1/sessions/{id} — the session as the client needs it: capabilities, consent
 * snapshot, turn count and the safe part of the channel state.
 */
import { handle } from "@/lib/core/api";
import { capabilitiesFromRecord } from "@/lib/channels/capabilities";
import { channelGuard, loadOwnedSession, requestId } from "@/lib/channels/http";
import { readState, resumeSummary } from "@/lib/channels/session";

export const GET = handle<{ id: string }>({ permission: "interaction:create" }, async ({ req, user, params }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const session = await loadOwnedSession(params.id, user, language, id);
    const state = readState(session);
    return {
      session: {
        id: session.id,
        channel: session.channel,
        language: session.language,
        module: session.module,
        province: session.province,
        status: session.status,
        turnCount: session.turnCount,
        startedAt: session.startedAt,
        lastTurnAt: session.lastTurnAt,
        endedAt: session.endedAt,
      },
      capabilities: capabilitiesFromRecord(session.channel, session.capabilities),
      consent: session.consentSnapshot,
      state: {
        step: state.step ?? null,
        lastModule: state.lastModule ?? null,
        lastInteractionId: state.lastInteractionId ?? null,
        hasMore: (state.continuation?.chunks.length ?? 0) > (state.continuation?.index ?? 0) + 1,
        optedOut: state.optedOut ?? false,
      },
      resumeSummary: resumeSummary(session),
      request_id: id,
    };
  });
});
