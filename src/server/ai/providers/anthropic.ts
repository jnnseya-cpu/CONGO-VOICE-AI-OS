import "server-only";
import Anthropic, { type ParsedMessage } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { env } from "@server/core/env";
import { ProviderError, type LlmJsonRequest, type LlmJsonResult, type LlmProvider } from "../types";

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export class AnthropicProvider implements LlmProvider {
  readonly key = "anthropic";
  readonly supportsVision = true;
  private client = new Anthropic();
  constructor(private model = env.ai.llmModel) {}

  async generateJson<T>(req: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const img of req.images ?? []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType as ImageMedia, data: img.data.toString("base64") },
      });
    }
    content.push({ type: "text", text: req.user });

    let response: ParsedMessage<T>;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: req.maxTokens ?? 4000,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { format: zodOutputFormat(req.schema), effort: env.ai.llmEffort },
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new ProviderError(this.key, "authentication failed", false);
      if (err instanceof Anthropic.BadRequestError) throw new ProviderError(this.key, err.message, false);
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError(this.key, "rate limited", true);
      if (err instanceof Anthropic.APIError) throw new ProviderError(this.key, `${err.status} ${err.message}`, true);
      throw new ProviderError(this.key, err instanceof Error ? err.message : String(err), true);
    }
    if (response.stop_reason === "refusal") {
      throw new ProviderError(this.key, `refused: ${response.stop_details?.category ?? "unspecified"}`, true);
    }
    if (!response.parsed_output) throw new ProviderError(this.key, "unparseable structured output", true);
    return {
      output: response.parsed_output,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
