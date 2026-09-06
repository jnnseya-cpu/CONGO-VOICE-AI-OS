import type { ZodType } from "zod";
import type { LanguageCode } from "@/lib/db/schema";

export type Capability = "llm" | "vision" | "stt" | "tts";

export interface ImageInput {
  data: Buffer;
  mimeType: string;
}

export interface LlmJsonRequest<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  images?: ImageInput[];
  maxTokens?: number;
}

export interface LlmJsonResult<T> {
  output: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TranscribeRequest {
  audio: Buffer;
  mimeType: string;
  languageHint?: LanguageCode | null;
}

export interface TranscribeResult {
  text: string;
  language?: LanguageCode | null;
  confidence?: number | null;
  model: string;
  audioSeconds?: number;
}

export interface SynthesizeRequest {
  text: string;
  language: LanguageCode;
}

export interface SynthesizeResult {
  audio: Buffer;
  mimeType: string;
  model: string;
}

export interface LlmProvider {
  readonly key: string;
  generateJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>>;
  /** Whether images can be attached to a request. */
  readonly supportsVision: boolean;
}

export interface SttProvider {
  readonly key: string;
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
  /** Languages this provider handles well; others are routed elsewhere. */
  readonly languages: LanguageCode[] | "all";
}

export interface TtsProvider {
  readonly key: string;
  synthesize(req: SynthesizeRequest): Promise<SynthesizeResult | null>;
  readonly languages: LanguageCode[] | "all";
}

export class ProviderError extends Error {
  constructor(
    public providerKey: string,
    message: string,
    public retryable = true,
  ) {
    super(`[${providerKey}] ${message}`);
    this.name = "ProviderError";
  }
}
