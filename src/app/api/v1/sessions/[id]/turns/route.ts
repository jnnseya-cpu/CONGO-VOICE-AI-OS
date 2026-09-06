/**
 * POST /api/v1/sessions/{id}/turns — one conversational turn.
 *
 * Accepts multipart/form-data (input_kind, audio, text, media[], lang_hint) or JSON for
 * text-only turns. `Idempotency-Key` makes a replay of a queued offline turn safe: the
 * stored response is returned instead of running the pipeline twice.
 */
import { handle } from "@/lib/core/api";
import { env } from "@/lib/core/env";
import { IdempotencyConflict, requestHash, withIdempotency } from "@/lib/core/idempotency";
import { isAllowedMime } from "@/lib/core/storage";
import type { LanguageCode, ModuleType } from "@/lib/db/schema";
import { ChannelError, channelErrorBody } from "@/lib/channels/errors";
import { channelGuard, loadOwnedSession, requestId } from "@/lib/channels/http";
import { storeInboundMedia } from "@/lib/channels/media";
import { readState, runTurn, settleTurn, setSessionLanguage, type TurnResult } from "@/lib/channels/session";

const LANGUAGES = ["fr", "ln", "kg", "sw", "lua"] as const;
const MODULES = ["health", "agriculture", "education", "general"] as const;

interface ParsedTurn {
  inputKind: "voice" | "text" | "image" | "video";
  text: string | null;
  langHint: LanguageCode | null;
  moduleHint: ModuleType | null;
  audio: { data: Buffer; mimeType: string } | null;
  images: Array<{ data: Buffer; mimeType: string; fileId: string }>;
}

function serialise(result: TurnResult) {
  return {
    session_id: result.sessionId,
    seq: result.seq,
    status: result.status,
    interaction_id: result.interactionId,
    language: result.language,
    module: result.module,
    text: result.text,
    full_text: result.fullText,
    has_more: result.hasMore,
    continuation_prompt: result.continuationPrompt,
    follow_up_questions: result.followUpQuestions,
    audio_url: result.audioUrl,
    case_id: result.caseId,
    emergency: result.emergency,
    escalated: result.escalated,
    low_confidence: result.lowConfidence,
  };
}

export const POST = handle<{ id: string }>({ permission: "interaction:create", limit: "ai" }, async ({ req, user, params }) => {
  const id = requestId(req);
  const language = user.language ?? "fr";
  return channelGuard(language, id, async () => {
    const session = await loadOwnedSession(params.id, user, language, id);
    const state = readState(session);
    if (state.optedOut) {
      throw new ChannelError("CONSENT_REQUIRED", { language, requestId: id, fields: ["consent.service"], extra: { session_id: session.id } });
    }

    const contentType = req.headers.get("content-type") ?? "";
    const parsed = contentType.includes("multipart/form-data")
      ? await parseMultipart(req, session.userId, language, id)
      : await parseJsonBody(req, language, id);

    if (!parsed.text && !parsed.audio && parsed.images.length === 0) {
      throw new ChannelError("VALIDATION_FAILED", { language, requestId: id, fields: ["text", "audio", "media[]"] });
    }

    let current = session;
    if (parsed.langHint && parsed.langHint !== session.language) {
      current = await setSessionLanguage(session, parsed.langHint);
    }

    const key = req.headers.get("idempotency-key");
    try {
      const { result, replayed } = await withIdempotency(
        key,
        user.userId,
        async () => {
          const turn = await settleTurn(
            await runTurn({
              session: current,
              text: parsed.text,
              audio: parsed.audio,
              images: parsed.images,
              moduleHint: parsed.moduleHint,
              idempotencyKey: key,
            }),
          );
          if (turn.status === "failed") {
            // A failed voice note or photo is almost always a capture problem; anything else
            // is the pipeline itself being unavailable.
            throw parsed.audio || parsed.images.length > 0
              ? new ChannelError("MEDIA_QUALITY_LOW", { language: turn.language, requestId: id, fields: ["audio", "media[]"] })
              : new ChannelError("DEPENDENCY_UNAVAILABLE", { language: turn.language, requestId: id });
          }
          const body = serialise(turn);
          const notice =
            turn.escalated || turn.emergency
              ? channelErrorBody("SAFETY_ESCALATION_CREATED", turn.language, [], id)
              : turn.lowConfidence
                ? channelErrorBody("CLARIFICATION_REQUIRED", turn.language, ["text"], id)
                : null;
          return notice ? { ...body, notice } : body;
        },
        { requestHash: requestHash(`${session.id}:${parsed.inputKind}:${parsed.text ?? ""}`) },
      );
      return Response.json({ ...result, replayed, request_id: id }, { headers: { "X-Request-Id": id } });
    } catch (err) {
      if (err instanceof IdempotencyConflict) {
        throw new ChannelError("STATE_CONFLICT", { language, requestId: id, fields: ["Idempotency-Key"], detail: err.message });
      }
      throw err;
    }
  });
});

async function parseMultipart(req: Request, userId: string | null, language: LanguageCode, id: string): Promise<ParsedTurn> {
  const form = await req.formData();
  const str = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const inputKind = (str("input_kind") ?? "text") as ParsedTurn["inputKind"];
  const langHint = str("lang_hint");
  if (langHint && !LANGUAGES.includes(langHint as LanguageCode)) {
    throw new ChannelError("LANGUAGE_UNSUPPORTED", { language, requestId: id, fields: ["lang_hint"] });
  }
  const moduleHint = str("module");
  const parsed: ParsedTurn = {
    inputKind,
    text: str("text"),
    langHint: (langHint as LanguageCode | null) ?? null,
    moduleHint: moduleHint && MODULES.includes(moduleHint as ModuleType) ? (moduleHint as ModuleType) : null,
    audio: null,
    images: [],
  };

  const audio = form.get("audio");
  if (audio instanceof File && audio.size > 0) {
    const mime = (audio.type || "audio/webm").split(";")[0];
    if (!mime.startsWith("audio/") && !mime.startsWith("video/")) {
      throw new ChannelError("MEDIA_QUALITY_LOW", { language, requestId: id, fields: ["audio"] });
    }
    if (audio.size > env.storage.maxUploadBytes) {
      throw new ChannelError("MEDIA_QUALITY_LOW", { language, requestId: id, fields: ["audio"] });
    }
    parsed.audio = { data: Buffer.from(await audio.arrayBuffer()), mimeType: mime };
  }

  for (const entry of [...form.getAll("media[]"), ...form.getAll("media")]) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const mime = entry.type.split(";")[0];
    if (!isAllowedMime(mime) || (!mime.startsWith("image/") && !mime.startsWith("video/"))) {
      throw new ChannelError("MEDIA_QUALITY_LOW", { language, requestId: id, fields: ["media[]"] });
    }
    const data = Buffer.from(await entry.arrayBuffer());
    const stored = await storeInboundMedia({ userId, data, mimeType: mime });
    parsed.images.push({ data: mime.startsWith("image/") ? data : Buffer.alloc(0), mimeType: mime, fileId: stored.fileId });
  }
  return parsed;
}

async function parseJsonBody(req: Request, language: LanguageCode, id: string): Promise<ParsedTurn> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ChannelError("VALIDATION_FAILED", { language, requestId: id, fields: ["body"] });
  }
  const text = typeof body.text === "string" ? body.text.trim() : null;
  const langHint = typeof body.lang_hint === "string" ? body.lang_hint : null;
  if (langHint && !LANGUAGES.includes(langHint as LanguageCode)) {
    throw new ChannelError("LANGUAGE_UNSUPPORTED", { language, requestId: id, fields: ["lang_hint"] });
  }
  const moduleHint = typeof body.module === "string" ? body.module : null;
  return {
    inputKind: (typeof body.input_kind === "string" ? body.input_kind : "text") as ParsedTurn["inputKind"],
    text: text || null,
    langHint: (langHint as LanguageCode | null) ?? null,
    moduleHint: moduleHint && MODULES.includes(moduleHint as ModuleType) ? (moduleHint as ModuleType) : null,
    audio: null,
    images: [],
  };
}
