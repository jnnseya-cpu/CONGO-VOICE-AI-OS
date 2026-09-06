import "server-only";
import { z } from "zod";
import type { LanguageCode } from "@server/db/schema";
import {
  ProviderError,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
  type SttProvider,
  type TranscribeRequest,
  type TranscribeResult,
} from "../types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini's JSON schema dialect rejects a few keywords produced by zod. */
function cleanSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(cleanSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === "$schema" || k === "additionalProperties") continue;
      out[k] = cleanSchema(v);
    }
    return out;
  }
  return schema;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

export class GeminiProvider implements LlmProvider, SttProvider {
  readonly key = "gemini";
  readonly supportsVision = true;
  /** Gemini listens to audio directly, which covers languages classic STT engines lack. */
  readonly languages = "all" as const;

  constructor(
    private apiKey: string,
    private model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  ) {}

  private async call(parts: unknown[], generationConfig: Record<string, unknown>, system?: string): Promise<GeminiResponse> {
    const res = await fetch(`${BASE}/models/${this.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts }],
        generationConfig,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) throw new ProviderError(this.key, json.error?.message ?? `HTTP ${res.status}`, res.status >= 500 || res.status === 429);
    return json;
  }

  async generateJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const parts: unknown[] = (req.images ?? []).map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data.toString("base64") },
    }));
    parts.push({ text: req.user });
    const json = await this.call(
      parts,
      {
        responseMimeType: "application/json",
        responseJsonSchema: cleanSchema(z.toJSONSchema(req.schema)),
        maxOutputTokens: req.maxTokens ?? 4000,
      },
      req.system,
    );
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError(this.key, "invalid JSON output", true);
    }
    const result = req.schema.safeParse(parsed);
    if (!result.success) throw new ProviderError(this.key, "output failed schema validation", true);
    return {
      output: result.data,
      model: this.model,
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const Out = z.object({
      transcript: z.string(),
      language: z.enum(["fr", "ln", "kg", "sw", "lua"]),
      confidence: z.number().min(0).max(1),
    });
    const hint = req.languageHint ? ` The speaker probably uses "${req.languageHint}".` : "";
    const json = await this.call(
      [
        { inlineData: { mimeType: req.mimeType, data: req.audio.toString("base64") } },
        {
          text:
            "Transcribe this voice message exactly as spoken. Languages: fr=French, ln=Lingala, kg=Kikongo, sw=Swahili (Congolese), lua=Tshiluba." +
            hint +
            " Return JSON.",
        },
      ],
      { responseMimeType: "application/json", responseJsonSchema: cleanSchema(z.toJSONSchema(Out)) },
    );
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = Out.safeParse(JSON.parse(text || "{}"));
    if (!parsed.success) throw new ProviderError(this.key, "transcription output invalid", true);
    return {
      text: parsed.data.transcript,
      language: parsed.data.language as LanguageCode,
      confidence: parsed.data.confidence,
      model: this.model,
    };
  }
}
