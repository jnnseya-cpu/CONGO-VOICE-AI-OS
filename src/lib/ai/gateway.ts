/**
 * AI Gateway — the only place in the platform that knows which AI vendor is used.
 *
 * Routing policy (configurable through environment variables, see .env.example):
 *   llm     : anthropic → gemini → openai → mock
 *   vision  : anthropic → gemini → openai → mock
 *   stt     : openai (fr, sw, ln) → gemini (all five languages) → mock
 *   tts     : google_tts (fr, sw) → openai (all) → on-device speech synthesis
 *
 * A provider is only registered when its credential is present. Each call is tried
 * along the chain until one provider succeeds; every attempt is recorded in ai_usage_logs
 * with the provider key kept internal (never returned to clients).
 */
import "server-only";
import { env } from "@/lib/core/env";
import { getDb, schema } from "@/lib/db/client";
import type { LanguageCode } from "@/lib/db/schema";
import { MockProvider } from "./providers/mock";
import {
  ProviderError,
  type Capability,
  type LlmJsonRequest,
  type LlmJsonResult,
  type LlmProvider,
  type SttProvider,
  type SynthesizeRequest,
  type SynthesizeResult,
  type TranscribeRequest,
  type TranscribeResult,
  type TtsProvider,
} from "./types";

interface Registry {
  llm: Map<string, LlmProvider>;
  stt: Map<string, SttProvider>;
  tts: Map<string, TtsProvider>;
}

const COST_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
};

function order(envName: string, fallback: string[]): string[] {
  const v = process.env[envName];
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : fallback;
}

export interface CallMeta {
  interactionId?: string | null;
}

export class AiGateway {
  private registry: Registry = { llm: new Map(), stt: new Map(), tts: new Map() };
  private ready: Promise<void>;
  readonly llmOrder = order("AI_LLM_ORDER", ["anthropic", "gemini", "openai", "mock"]);
  readonly visionOrder = order("AI_VISION_ORDER", ["anthropic", "gemini", "openai", "mock"]);
  readonly sttOrder = order("AI_STT_ORDER", ["openai", "gemini", "mock"]);
  readonly ttsOrder = order("AI_TTS_ORDER", ["google_tts", "openai"]);

  constructor() {
    this.ready = this.register();
  }

  private async register() {
    const mock = new MockProvider();
    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
      const { AnthropicProvider } = await import("./providers/anthropic");
      this.registry.llm.set("anthropic", new AnthropicProvider());
    }
    if (process.env.GEMINI_API_KEY) {
      const { GeminiProvider } = await import("./providers/gemini");
      const g = new GeminiProvider(process.env.GEMINI_API_KEY);
      this.registry.llm.set("gemini", g);
      this.registry.stt.set("gemini", g);
    }
    if (process.env.OPENAI_API_KEY) {
      const { OpenAiProvider } = await import("./providers/openai");
      const o = new OpenAiProvider(process.env.OPENAI_API_KEY);
      this.registry.llm.set("openai", o);
      this.registry.stt.set("openai", o);
      this.registry.tts.set("openai", o);
    }
    if (process.env.GOOGLE_TTS_API_KEY) {
      const { GoogleTtsProvider } = await import("./providers/google-speech");
      this.registry.tts.set("google_tts", new GoogleTtsProvider(process.env.GOOGLE_TTS_API_KEY));
    }
    if (process.env.AI_ALLOW_MOCK !== "false") {
      this.registry.llm.set("mock", mock);
      this.registry.stt.set("mock", mock);
    }
  }

  /** Internal status for the admin console. Keys are internal identifiers, not vendor branding. */
  async status() {
    await this.ready;
    return {
      llm: this.llmOrder.filter((k) => this.registry.llm.has(k)),
      stt: this.sttOrder.filter((k) => this.registry.stt.has(k)),
      tts: this.ttsOrder.filter((k) => this.registry.tts.has(k)),
      offlineMode: this.llmOrder.filter((k) => this.registry.llm.has(k)).every((k) => k === "mock"),
    };
  }

  private async log(input: {
    capability: Capability;
    providerKey: string;
    model?: string;
    interactionId?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    audioSeconds?: number;
    durationMs: number;
    success: boolean;
  }) {
    if (env.isTest) return;
    try {
      const rate = COST_PER_MTOK[input.model ?? ""] ?? { in: 0, out: 0 };
      const cost = ((input.inputTokens ?? 0) * rate.in + (input.outputTokens ?? 0) * rate.out) / 1_000_000;
      const db = await getDb();
      await db.insert(schema.aiUsageLogs).values({
        capability: input.capability,
        providerKey: input.providerKey,
        model: input.model,
        interactionId: input.interactionId ?? null,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        audioSeconds: input.audioSeconds ?? 0,
        estimatedCostUsd: cost,
        durationMs: input.durationMs,
        success: input.success,
      });
    } catch (err) {
      console.error("[ai-usage-log]", err);
    }
  }

  async generateJson<T>(req: LlmJsonRequest<T>, meta: CallMeta = {}): Promise<LlmJsonResult<T> & { providerKey: string }> {
    await this.ready;
    const hasImages = (req.images ?? []).length > 0;
    const chain = (hasImages ? this.visionOrder : this.llmOrder)
      .map((k) => this.registry.llm.get(k))
      .filter((p): p is LlmProvider => !!p && (!hasImages || p.supportsVision));
    if (chain.length === 0) throw new Error("No AI language provider configured");
    let lastError: unknown;
    for (const provider of chain) {
      const started = Date.now();
      try {
        const result = await provider.generateJson(req);
        await this.log({ capability: hasImages ? "vision" : "llm", providerKey: provider.key, model: result.model, interactionId: meta.interactionId, inputTokens: result.inputTokens, outputTokens: result.outputTokens, durationMs: Date.now() - started, success: true });
        return { ...result, providerKey: provider.key };
      } catch (err) {
        lastError = err;
        await this.log({ capability: hasImages ? "vision" : "llm", providerKey: provider.key, interactionId: meta.interactionId, durationMs: Date.now() - started, success: false });
        console.warn(`[ai-gateway] ${provider.key} failed for ${req.schemaName}:`, err instanceof Error ? err.message : err);
        if (err instanceof ProviderError && !err.retryable && provider.key !== "mock") continue;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("All AI providers failed");
  }

  async transcribe(req: TranscribeRequest, meta: CallMeta = {}): Promise<TranscribeResult & { providerKey: string }> {
    await this.ready;
    const chain = this.sttOrder
      .map((k) => this.registry.stt.get(k))
      .filter((p): p is SttProvider => !!p)
      .filter((p) => !req.languageHint || p.languages === "all" || p.languages.includes(req.languageHint));
    // A provider that does not list the hinted language still serves as last resort.
    const fallback = this.sttOrder.map((k) => this.registry.stt.get(k)).filter((p): p is SttProvider => !!p && !chain.includes(p));
    let lastError: unknown;
    for (const provider of [...chain, ...fallback]) {
      const started = Date.now();
      try {
        const result = await provider.transcribe(req);
        await this.log({ capability: "stt", providerKey: provider.key, model: result.model, interactionId: meta.interactionId, audioSeconds: result.audioSeconds, durationMs: Date.now() - started, success: true });
        return { ...result, providerKey: provider.key };
      } catch (err) {
        lastError = err;
        await this.log({ capability: "stt", providerKey: provider.key, interactionId: meta.interactionId, durationMs: Date.now() - started, success: false });
        console.warn(`[ai-gateway] stt ${provider.key} failed:`, err instanceof Error ? err.message : err);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No speech-to-text provider available");
  }

  async synthesize(req: SynthesizeRequest, meta: CallMeta = {}): Promise<(SynthesizeResult & { providerKey: string }) | null> {
    await this.ready;
    const chain = this.ttsOrder
      .map((k) => this.registry.tts.get(k))
      .filter((p): p is TtsProvider => !!p && (p.languages === "all" || p.languages.includes(req.language)));
    for (const provider of chain) {
      const started = Date.now();
      try {
        const result = await provider.synthesize(req);
        if (!result) continue;
        await this.log({ capability: "tts", providerKey: provider.key, model: result.model, interactionId: meta.interactionId, durationMs: Date.now() - started, success: true });
        return { ...result, providerKey: provider.key };
      } catch (err) {
        await this.log({ capability: "tts", providerKey: provider.key, interactionId: meta.interactionId, durationMs: Date.now() - started, success: false });
        console.warn(`[ai-gateway] tts ${provider.key} failed:`, err instanceof Error ? err.message : err);
      }
    }
    return null; // browser speech synthesis takes over
  }

  supportsLanguageForTts(language: LanguageCode) {
    return this.ttsOrder.some((k) => {
      const p = this.registry.tts.get(k);
      return p && (p.languages === "all" || p.languages.includes(language));
    });
  }
}

const g = globalThis as unknown as { __cvaiGateway?: AiGateway };
export function aiGateway(): AiGateway {
  return (g.__cvaiGateway ??= new AiGateway());
}
export function resetGatewayForTests() {
  g.__cvaiGateway = undefined;
}
