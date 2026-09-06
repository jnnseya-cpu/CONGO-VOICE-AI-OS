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

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(req.audio)], { type: req.mimeType }), "voice." + (req.mimeType.split("/")[1] ?? "webm"));
    form.append("model", this.sttModel);
    form.append("response_format", "verbose_json");
    if (req.languageHint) form.append("language", ISO[req.languageHint]);
    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, { method: "POST", headers: this.headers(), body: form });
    const json = (await res.json().catch(() => ({}))) as { text?: string; language?: string; duration?: number; error?: { message?: string } };
    if (!res.ok) throw new ProviderError(this.key, json.error?.message ?? `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    return {
      text: json.text ?? "",
      language: json.language ? (FROM_ISO[json.language.toLowerCase()] ?? null) : null,
      confidence: null,
      model: this.sttModel,
      audioSeconds: json.duration,
    };
  }

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult | null> {
    const res = await fetch(`${this.baseUrl}/audio/speech`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ model: this.ttsModel, voice: process.env.OPENAI_TTS_VOICE ?? "alloy", input: req.text, response_format: "mp3" }),
    });
    if (!res.ok) throw new ProviderError(this.key, `TTS HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg", model: this.ttsModel };
  }
}
