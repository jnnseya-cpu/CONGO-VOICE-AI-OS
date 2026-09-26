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
import { env } from "@server/core/env";
import { getDb, schema } from "@server/db/client";
import type { LanguageCode } from "@server/db/schema";
import { MockProvider } from "./providers/mock";
import { permits, residencyPolicy } from "@server/core/residency";
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

/**
 * A credential that exists but is blank is not a configured provider.
 *
 * Secret Manager containers are created by Terraform and filled in by a person,
 * so a deployment that has not been given a vendor key yet still mounts the
 * variable — as an empty string, or as the single space someone used as a
 * placeholder. Both are truthy enough to register a provider that then fails
 * every call with a 401, which reads as an outage rather than as a key nobody
 * has supplied. Trimming here keeps that deployment on the offline provider,
 * which is the honest answer.
 */
function configured(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

/**
 * A per-provider deadline, so one slow vendor cannot hold a citizen's turn.
 *
 * There was none. A provider that accepted a connection and never answered hung
 * the whole turn for as long as the platform in front of it allowed — which,
 * now that the request ceiling is Cloud Run's maximum, is an hour, on an
 * instance that can serve nobody else meanwhile. Raising that ceiling was right,
 * and it is only safe because of this: the ceiling exists so nothing external
 * ends a conversation, and this exists so the platform still ends one that has
 * stopped going anywhere.
 *
 * A timeout is not a failure of the turn. It is a failure of one provider, and
 * the chain continues to the next — ending at the offline provider, which always
 * answers. A citizen describing a child's symptoms gets the deterministic
 * answer, late, rather than nothing at all.
 *
 * The audio call gets longer than the text one because it carries a recording
 * upward over a connection that may be a village's only bar of signal.
 */
function deadlineMs(capability: "llm" | "stt" | "tts"): number {
  const fallback = capability === "stt" ? 90_000 : capability === "tts" ? 45_000 : 60_000;
  const raw = Number(process.env.AI_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export class ProviderTimeout extends Error {
  constructor(providerKey: string, ms: number) {
    super(`${providerKey} did not answer within ${Math.round(ms / 1000)}s`);
    this.name = "ProviderTimeout";
  }
}

async function withDeadline<T>(providerKey: string, capability: "llm" | "stt" | "tts", work: Promise<T>): Promise<T> {
  const ms = deadlineMs(capability);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ProviderTimeout(providerKey, ms)), ms);
      }),
    ]);
  } finally {
    // Without this the process holds a pending timer per call, and a busy
    // instance accumulates them until the event loop will not drain.
    if (timer) clearTimeout(timer);
  }
}

export interface CallMeta {
  interactionId?: string | null;
  /** Scripted / degraded mode: only the offline rules provider is used (ACU cap, provider outage policy). */
  scripted?: boolean;
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

  /** Destinations a configured provider was refused because of the residency policy. */
  readonly refusedByResidency: string[] = [];

  /**
   * A provider is only registered if the deployment's residency policy permits
   * its jurisdiction. Refusing here rather than at the call site is deliberate:
   * a provider that is never in the registry has no code path that reaches it,
   * so there is no ordering, retry or fallback that can send data to it by
   * accident.
   */
  private allowed(key: string): boolean {
    if (permits(key, residencyPolicy()).permitted) return true;
    if (!this.refusedByResidency.includes(key)) {
      this.refusedByResidency.push(key);
      console.warn(`[ai] ${key} is configured but outside the data residency policy; it will not be used.`);
    }
    return false;
  }

  private async register() {
    const mock = new MockProvider();
    if (this.allowed("anthropic") && (configured(process.env.ANTHROPIC_API_KEY) || configured(process.env.ANTHROPIC_AUTH_TOKEN))) {
      const { AnthropicProvider } = await import("./providers/anthropic");
      this.registry.llm.set("anthropic", new AnthropicProvider());
    }
    const gemini = configured(process.env.GEMINI_API_KEY);
    if (this.allowed("gemini") && gemini) {
      const { GeminiProvider } = await import("./providers/gemini");
      const g = new GeminiProvider(gemini);
      this.registry.llm.set("gemini", g);
      this.registry.stt.set("gemini", g);
    }
    const openai = configured(process.env.OPENAI_API_KEY);
    if (this.allowed("openai") && openai) {
      const { OpenAiProvider } = await import("./providers/openai");
      const o = new OpenAiProvider(openai);
      this.registry.llm.set("openai", o);
      this.registry.stt.set("openai", o);
      this.registry.tts.set("openai", o);
    }
    const googleTts = configured(process.env.GOOGLE_TTS_API_KEY);
    if (this.allowed("google_tts") && googleTts) {
      const { GoogleTtsProvider } = await import("./providers/google-speech");
      this.registry.tts.set("google_tts", new GoogleTtsProvider(googleTts));
    }
    if (this.allowed("mock") && process.env.AI_ALLOW_MOCK !== "false") {
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
      refusedByResidency: [...this.refusedByResidency],
    };
  }

  /** Every provider actually registered, for the residency report. */
  async activeProviders(): Promise<string[]> {
    await this.ready;
    return [...new Set([...this.registry.llm.keys(), ...this.registry.stt.keys(), ...this.registry.tts.keys()])].sort();
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
    // ACU metering: every AI call is normalised into billable units and attributed to a
    // tenant. This is the single funnel for AI usage, so it is the only correct hook point.
    if (input.success) {
      const { recordAcu } = await import("@server/core/metering");
      await recordAcu({
        task: input.capability,
        model: input.model,
        providerKey: input.providerKey,
        interactionId: input.interactionId ?? null,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        audioSeconds: input.audioSeconds,
        images: input.capability === "vision" ? 1 : undefined,
      });
    }
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
    const order = meta.scripted ? ["mock"] : hasImages ? this.visionOrder : this.llmOrder;
    const chain = order
      .map((k) => this.registry.llm.get(k))
      .filter((p): p is LlmProvider => !!p && (!hasImages || p.supportsVision));
    if (chain.length === 0) throw new Error("No AI language provider configured");
    let lastError: unknown;
    for (const provider of chain) {
      const started = Date.now();
      try {
        const result = await withDeadline(provider.key, "llm", provider.generateJson(req));
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
        const result = await withDeadline(provider.key, "stt", provider.transcribe(req));
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
        const result = await withDeadline(provider.key, "tts", provider.synthesize(req));
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
