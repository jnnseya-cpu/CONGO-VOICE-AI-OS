/**
 * GET /api/v1/sessions/{id}/stream — Server-Sent Events for one turn.
 *
 * The interaction row is the source of truth (the orchestrator autosaves every step), so
 * the stream simply polls it twice a second and emits a stage event whenever it changes.
 * Works on any host, with no message broker.
 */
import { handle } from "@server/core/api";
import { channelGuard, loadOwnedSession, requestId } from "@server/channels/http";
import { latestInteractionOfSession, loadInteraction, toWorkflowStatus, type WorkflowStatus } from "@server/channels/workflow";
import { readState } from "@server/channels/session";

const POLL_MS = 500;
const MAX_MS = 120_000;

export const GET = handle<{ id: string }>({ permission: "interaction:create", limit: "none" }, async ({ req, user, params }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const session = await loadOwnedSession(params.id, user, language, id);
    const wanted = new URL(req.url).searchParams.get("interaction_id") ?? readState(session).lastInteractionId ?? null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        send("open", { session_id: session.id, interaction_id: wanted, request_id: id });

        const started = Date.now();
        let lastStage: string | null = null;
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        req.signal?.addEventListener("abort", close);

        try {
          while (!closed && Date.now() - started < MAX_MS) {
            const row = wanted ? await loadInteraction(wanted) : await latestInteractionOfSession(session.id);
            if (row) {
              const status: WorkflowStatus = toWorkflowStatus(row);
              if (status.stage !== lastStage) {
                lastStage = status.stage;
                send("stage", status);
              }
              if (status.stage === "completed" || status.stage === "failed") {
                send("done", { interaction_id: row.id, stage: status.stage });
                break;
              }
            } else {
              send("waiting", { session_id: session.id });
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          }
          if (!closed && Date.now() - started >= MAX_MS) send("timeout", { session_id: session.id });
        } catch (err) {
          send("error", { code: "DEPENDENCY_UNAVAILABLE", message: err instanceof Error ? err.message : "stream_error" });
        } finally {
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": id,
      },
    });
  });
});
