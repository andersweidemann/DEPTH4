/**
 * Single entry point for DEPTH4 platform LLM system prompts.
 * Every user-facing write path on depth4.com should use these builders.
 */
import {
  DEPTH4_RETAIL_VOICE_CONSTITUTION_FOR_LLM,
  DEPTH4_RETAIL_VOICE_TEST,
} from "@/lib/thesis-engine-v2/depth4-retail-voice-constitution";

export const DEPTH4_JSON_OUTPUT_RULE =
  "You output strict JSON only. No markdown fences or commentary outside the JSON object.";

/** Retail voice test + constitution (macro prompts embed this block). */
export function depth4VoiceBlockForLlm(): string {
  return `${DEPTH4_RETAIL_VOICE_TEST}\n\n${DEPTH4_RETAIL_VOICE_CONSTITUTION_FOR_LLM}`;
}

export type BuildDepth4LlmSystemPromptOptions = {
  /** Task-specific role line, e.g. "You are DEPTH4's trade-plan writer." */
  preamble?: string;
  /** Append JSON-only rule (default true). Set false for prose/chat. */
  jsonOnly?: boolean;
  /** Extra task rules after the global constitution. */
  extra?: string;
};

/**
 * Standard system prompt for structured JSON LLM calls (pipeline, remodel, repair, etc.).
 */
export function buildDepth4LlmSystemPrompt(opts: BuildDepth4LlmSystemPromptOptions = {}): string {
  const jsonOnly = opts.jsonOnly !== false;
  const parts: string[] = [];
  if (opts.preamble?.trim()) parts.push(opts.preamble.trim());
  if (jsonOnly) parts.push(DEPTH4_JSON_OUTPUT_RULE);
  parts.push(depth4VoiceBlockForLlm());
  if (opts.extra?.trim()) parts.push(opts.extra.trim());
  return parts.join("\n\n");
}

/** Prose responses (thesis chat, reflections, etc.). */
export function buildDepth4ProseSystemPrompt(preamble: string, extra?: string): string {
  return buildDepth4LlmSystemPrompt({ preamble, jsonOnly: false, extra });
}

/** Default system string for pipeline / Kimi / NVIDIA / Anthropic JSON helpers. */
export const DEPTH4_PLATFORM_JSON_SYSTEM = buildDepth4LlmSystemPrompt({ jsonOnly: true });
