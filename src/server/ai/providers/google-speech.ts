import "server-only";
import type { LanguageCode } from "@server/db/schema";
import { ProviderError, type SynthesizeRequest, type SynthesizeResult, type TtsProvider } from "../types";

/** Google Cloud Text-to-Speech: natural voices for French and Swahili. */
const VOICES: Partial<Record<LanguageCode, { languageCode: string; name?: string }>> = {
  fr: { languageCode: "fr-FR", name: "fr-FR-Neural2-C" },
  sw: { languageCode: "sw-KE" },
};

export class GoogleTtsProvider implements TtsProvider {
  readonly key = "google_tts";
  readonly languages: LanguageCode[] = ["fr", "sw"];
  constructor(private apiKey: string) {}

  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResult | null> {
    const voice = VOICES[req.language];
    if (!voice) return null;
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: req.text },
        voice,
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.95 },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { audioContent?: string; error?: { message?: string } };
    if (!res.ok || !json.audioContent) throw new ProviderError(this.key, json.error?.message ?? `HTTP ${res.status}`, res.status >= 500);
    return { audio: Buffer.from(json.audioContent, "base64"), mimeType: "audio/mpeg", model: voice.name ?? voice.languageCode };
  }
}
