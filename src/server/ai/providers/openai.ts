import "server-only";
import { z } from "zod";
import type { LanguageCode } from "@server/db/schema";
import {
  ProviderError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
  type SttProvider,
  type SynthesizeRequest,
  type SynthesizeResult,
  type TranscribeRequest,
  type TranscribeResult,
  type TtsProvider,
} from "../types";

const ISO: Record<LanguageCode, string> = { fr: "fr", ln: "ln", kg: "kg", sw: "sw", lua: "lu" };
const FROM_ISO: Record<string, LanguageCode> = { fr: "fr", french: "fr", ln: "ln", lingala: "ln", kg: "kg", kongo: "kg", sw: "sw", swahili: "sw", lu: "lua", luba: "lua" };

export class OpenAiProvider implements LlmProvider, SttProvider, TtsProvider {
  readonly key = "openai";
  readonly supportsVision = true;
  /** Whisper-family models are strong on French, Swahili and Lingala. */
  readonly languages: LanguageCode[] = ["fr", "sw", "ln"];

  constructor(
    private apiKey: string,
    private baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    private chatModel = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
    private sttModel = process.env.OPENAI_STT_MODEL ?? "whisper-1",
    private ttsModel = process.env.OPENAI_TTS_MODEL ?? "tts-1",
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  async generateJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const content: unknown[] = (req.images ?? []).map((img) => ({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` },
    }));
    content.push({ type: "text", text: req.user });
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: this.chatModel,
        max_tokens: req.maxTokens ?? 4000,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.schemaName, schema: z.toJSONSchema(req.schema) },
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string; refusal?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (!res.ok) throw new ProviderError(this.key, json.error?.message ?? `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    const msg = json.choices?.[0]?.message;
    if (msg?.refusal) throw new ProviderError(this.key, `refused: ${msg.refusal}`, true);
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg?.content ?? "");
    } catch {
      throw new ProviderError(this.key, "invalid JSON output", true);
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) throw new ProviderError(this.key, "output failed schema validation", true);
    return {
      output: result.data,
      model: this.chatModel,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  /**
   * Whisper's own language set.
   *
   * Kikongo and Tshiluba are not in it. Sending their codes gets the request
   * rejected outright, and the two the platform used to send instead — the
   * citizen's interface language, whatever it was — told the model to force
   * everything it heard into French. Omitting the field for a language Whisper
   * was never taught lets it detect, which is worse than knowing and much
   * better than being wrong on purpose.
   */
  private static readonly WHISPER_LANGUAGES: ReadonlySet<LanguageCode> = new Set<LanguageCode>(["fr", "sw", "ln"]);

  /**
   * What the audio is expected to contain.
   *
   * Whisper was trained on subtitle tracks, so with nothing to go on it decodes
   * unclear audio towards subtitle text — caption credits and sign-offs to an
   * audience. Naming the domain moves the prior somewhere useful. It is a
   * nudge, not a guarantee: src/shared/transcription.ts catches what still gets
   * through, and has to, because this cannot be relied on.
   */
  private static readonly DOMAIN_PROMPT =
    "Message vocal d'un habitant de la République démocratique du Congo posant une question de santé, d'agriculture ou d'éducation : symptômes, grossesse, enfant malade, vaccination, culture, semis, maladie des plantes, école.";

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(req.audio)], { type: req.mimeType }), "voice." + (req.mimeType.split("/")[1] ?? "webm"));
    form.append("model", this.sttModel);
    form.append("response_format", "verbose_json");
    form.append("prompt", OpenAiProvider.DOMAIN_PROMPT);
    // Greedy decoding. The temperature fallback Whisper applies on its own is
    // what produces the repeated-clause loops; at zero it returns a short
    // result instead of inventing a long one.
    form.append("temperature", "0");
    if (req.languageHint && OpenAiProvider.WHISPER_LANGUAGES.has(req.languageHint)) form.append("language", ISO[req.languageHint]);
    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, { method: "POST", headers: this.headers(), body: form });
    const json = (await res.json().catch(() => ({}))) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new ProviderError(this.key, json.error?.message ?? `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    return {
      text: json.text ?? "",
      language: json.language ? (FROM_ISO[json.language.toLowerCase()] ?? null) : null,
      confidence: confidenceFromSegments(json.segments),
      model: this.sttModel,
      audioSeconds: json.duration,
    };
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult | null> {
    const res = await fetch(`${this.baseUrl}/audio/speech`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: this.ttsModel,
        // FR-LG-07: a female and a male option, overridable per deployment.
        voice: req.voice === "male" ? (process.env.OPENAI_TTS_VOICE_MALE ?? "onyx") : (process.env.OPENAI_TTS_VOICE ?? "shimmer"),
        input: req.text,
        response_format: "mp3",
      }),
    });
    if (!res.ok) throw new ProviderError(this.key, `TTS HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg", model: this.ttsModel };
  }
}

/**
 * A real confidence for a Whisper transcript, from what Whisper already reports.
 *
 * This used to return null, so every voice turn went downstream with no idea
 * whether the words were heard or invented, and the two-tier confidence policy
 * had nothing to act on. Whisper gives two numbers per segment and they are the
 * standard way to tell the difference:
 *
 *   - `no_speech_prob` — the model's own estimate that the segment contains no
 *     speech at all. High here with text returned anyway is the signature of a
 *     hallucination: it knows there was nothing and produced words regardless.
 *   - `avg_logprob` — mean token log probability. Around -0.2 on clean speech;
 *     below about -1.0 the decode has lost the audio.
 *
 * Combined multiplicatively so either one being bad is enough to pull the score
 * down, because either one being bad is enough to make the transcript unsafe to
 * act on.
 */
function confidenceFromSegments(segments: Array<{ avg_logprob?: number; no_speech_prob?: number }> | undefined): number | null {
  if (!segments?.length) return null;
  const mean = (pick: (s: { avg_logprob?: number; no_speech_prob?: number }) => number | undefined): number | null => {
    const values = segments.map(pick).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const logprob = mean((s) => s.avg_logprob);
  const noSpeech = mean((s) => s.no_speech_prob);
  if (logprob === null && noSpeech === null) return null;
  // -1.0 and worse scores zero; -0.2 and better scores one.
  const fromLogprob = logprob === null ? 1 : Math.min(1, Math.max(0, (logprob + 1) / 0.8));
  const fromSpeech = noSpeech === null ? 1 : Math.min(1, Math.max(0, 1 - noSpeech));
  return Number((fromLogprob * fromSpeech).toFixed(3));
}
