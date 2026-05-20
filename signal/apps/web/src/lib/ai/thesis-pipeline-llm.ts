import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import { kimiChatCompletions } from "@/lib/macro-reasoning/kimi-messages";
import { nvidiaChatCompletions } from "@/lib/macro-reasoning/nvidia-messages";
import {
  describeCheapPipelineProvider,
  isKimiConfigured,
  isNvidiaConfigured,
  KIMI_BASE_URL_CHINA,
  normalizeKimiApiKey,
  normalizeNvidiaApiKey,
  resolveCheapAnthropicModel,
  resolveKimiBaseUrl,
  resolveKimiModel,
  resolveNvidiaBaseUrl,
  resolveNvidiaModel,
  resolvePremiumAnthropicModel,
} from "@/lib/macro-reasoning/model-routing";
import { extractJsonFromLlmText } from "@/lib/ai/parse-llm-json";
import { DEPTH4_PLATFORM_JSON_SYSTEM } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";

const SYSTEM = DEPTH4_PLATFORM_JSON_SYSTEM;

export type PipelineLlmTier = "cheap" | "premium";

export type PipelineLlmClient = {
  tier: PipelineLlmTier;
  providerLabel: string;
  completeJson: (userPrompt: string, maxTokens: number) => Promise<unknown | null>;
};

async function completeTextAnthropic(model: string, userPrompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const { text } = await anthropicMessages({
    apiKey,
    model,
    maxTokens,
    system: SYSTEM,
    user: userPrompt,
  });
  return text;
}

function kimiErrorHint(msg: string, baseUrl: string): string {
  if (msg.includes("401")) {
    return (
      ` Check KIMI_API_KEY and KIMI_BASE_URL (${baseUrl}). ` +
      `International keys: https://api.moonshot.ai/v1 — China keys: ${KIMI_BASE_URL_CHINA}`
    );
  }
  if (msg.includes("429") || msg.toLowerCase().includes("insufficient balance")) {
    return " Kimi quota exhausted — recharge at platform.kimi.ai or rely on NVIDIA / Anthropic fallback.";
  }
  return "";
}

async function completeTextKimi(userPrompt: string, maxTokens: number): Promise<string> {
  const apiKey = normalizeKimiApiKey(process.env.KIMI_API_KEY);
  if (!apiKey) throw new Error("KIMI_API_KEY not set");
  const baseUrl = resolveKimiBaseUrl();
  try {
    const { text } = await kimiChatCompletions({
      apiKey,
      baseUrl,
      model: resolveKimiModel(),
      maxTokens,
      system: SYSTEM,
      user: userPrompt,
      disableThinking: true,
      jsonObjectMode: true,
    });
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = kimiErrorHint(msg, baseUrl);
    if (hint) throw new Error(`${msg}.${hint}`);
    throw e;
  }
}

async function completeTextNvidia(userPrompt: string, maxTokens: number): Promise<string> {
  const apiKey = normalizeNvidiaApiKey(process.env.NVIDIA_API_KEY);
  if (!apiKey) throw new Error("NVIDIA_API_KEY not set");
  const { text } = await nvidiaChatCompletions({
    apiKey,
    baseUrl: resolveNvidiaBaseUrl(),
    model: resolveNvidiaModel(),
    maxTokens,
    system: SYSTEM,
    user: userPrompt,
  });
  return text;
}

function logCheapProviderFallback(
  provider: "kimi" | "nvidia",
  e: unknown,
): void {
  const message = e instanceof Error ? e.message : String(e);
  const quota =
    provider === "kimi" &&
    (message.includes("429") || message.toLowerCase().includes("insufficient balance"));
  console.warn(
    quota
      ? `[thesis_pipeline] ${provider}_quota_try_next`
      : `[thesis_pipeline] ${provider}_failed_try_next`,
    { message: message.slice(0, 280) },
  );
}

function createAnthropicTierClient(tier: PipelineLlmTier): PipelineLlmClient | null {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  const model =
    tier === "premium" ? resolvePremiumAnthropicModel() : resolveCheapAnthropicModel();
  return {
    tier,
    providerLabel: `anthropic:${model}`,
    async completeJson(userPrompt, maxTokens) {
      const text = await completeTextAnthropic(model, userPrompt, maxTokens);
      return extractJsonFromLlmText(text);
    },
  };
}

/**
 * Cheap tier: Kimi → NVIDIA NIM → Anthropic Haiku (matches apps/api cheap-path fallback idea).
 */
function createCheapPipelineClient(): PipelineLlmClient | null {
  const anthropicFallback = createAnthropicTierClient("cheap");
  const hasAlt = isKimiConfigured() || isNvidiaConfigured();
  if (!anthropicFallback && !hasAlt) return null;
  if (!hasAlt) return anthropicFallback;

  return {
    tier: "cheap",
    providerLabel: describeCheapPipelineProvider(),
    async completeJson(userPrompt, maxTokens) {
      if (isKimiConfigured()) {
        try {
          const text = await completeTextKimi(userPrompt, maxTokens);
          const parsed = extractJsonFromLlmText(text);
          if (parsed) return parsed;
        } catch (e) {
          logCheapProviderFallback("kimi", e);
        }
      }

      if (isNvidiaConfigured()) {
        try {
          const text = await completeTextNvidia(userPrompt, maxTokens);
          const parsed = extractJsonFromLlmText(text);
          if (parsed) return parsed;
        } catch (e) {
          logCheapProviderFallback("nvidia", e);
        }
      }

      if (!anthropicFallback) {
        throw new Error(
          "Kimi/NVIDIA failed or returned invalid JSON, and ANTHROPIC_API_KEY is not set for fallback",
        );
      }
      console.info("[thesis_pipeline] cheap_path_anthropic_fallback");
      return anthropicFallback.completeJson(userPrompt, maxTokens);
    },
  };
}

/**
 * @param tier — `cheap` (Kimi → NVIDIA → Haiku) for structured steps 1–3; `premium` for thesis prose.
 */
export function createPipelineLlmClient(tier: PipelineLlmTier = "cheap"): PipelineLlmClient | null {
  if (tier === "premium") {
    return createAnthropicTierClient("premium");
  }
  return createCheapPipelineClient();
}

export function describePipelineLlmSetup(): { cheap: string; premium: string } {
  return {
    cheap: describeCheapPipelineProvider(),
    premium: `anthropic:${resolvePremiumAnthropicModel()}`,
  };
}

/** Anthropic cheap-tier JSON (remodel fallback after Kimi / NVIDIA). */
export async function completeCheapAnthropicJson(
  userPrompt: string,
  maxTokens: number,
): Promise<unknown | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  const model = resolveCheapAnthropicModel();
  const text = await completeTextAnthropic(model, userPrompt, maxTokens);
  return extractJsonFromLlmText(text);
}

/** NVIDIA NIM JSON fallback for remodel / pipeline. */
export async function completeNvidiaJson(
  userPrompt: string,
  maxTokens: number,
): Promise<unknown | null> {
  if (!isNvidiaConfigured()) return null;
  try {
    const text = await completeTextNvidia(userPrompt, maxTokens);
    return extractJsonFromLlmText(text);
  } catch {
    return null;
  }
}
