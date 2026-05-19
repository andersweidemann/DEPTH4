import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import { extractJsonFromLlmText } from "@/lib/ai/parse-llm-json";

const SYSTEM = "You output strict JSON only. No markdown fences or commentary outside the JSON object.";

export type PipelineLlmClient = {
  completeJson: (userPrompt: string, maxTokens: number) => Promise<unknown | null>;
};

export function createPipelineLlmClient(): PipelineLlmClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || "claude-3-5-haiku-latest";

  return {
    async completeJson(userPrompt, maxTokens) {
      const { text } = await anthropicMessages({
        apiKey,
        model,
        maxTokens,
        system: SYSTEM,
        user: userPrompt,
      });
      return extractJsonFromLlmText(text);
    },
  };
}
