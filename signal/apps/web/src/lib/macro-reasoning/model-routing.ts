/**
 * TS mirror of Python `signal_api/ai/model_routing.py` tier caps and env naming
 * for Vercel/Next cron routes that cannot call the FastAPI router in-process.
 *
 * TODO: optional two-hop cheap→premium escalation + Kimi (requires keys on Edge).
 */

export const TIER_MAX_TOKENS = { cheap: 1536, standard: 4096, premium: 8192 } as const;

export type ModelTaskTierKey = keyof typeof TIER_MAX_TOKENS;

/** Cron-local task ids — extend as more TS-side LLM jobs appear. */
export type CronLlmTaskType = "macro_event_reasoning";

const CRON_TASK_DEFAULT_TIER: Record<CronLlmTaskType, ModelTaskTierKey> = {
  macro_event_reasoning: "premium",
};

export function defaultTierForCronTask(task: CronLlmTaskType): ModelTaskTierKey {
  return CRON_TASK_DEFAULT_TIER[task] ?? "standard";
}

export function tierMaxTokens(tier: ModelTaskTierKey): number {
  return TIER_MAX_TOKENS[tier];
}

/**
 * Anthropic model id for a cron task — align env with API:
 * - premium tier: ANTHROPIC_MODEL_PREMIUM, then ANTHROPIC_MODEL
 * - else: ANTHROPIC_MODEL_CHEAP, then ANTHROPIC_MODEL
 */
export function resolveCronAnthropicModel(env: NodeJS.ProcessEnv, task: CronLlmTaskType): string {
  const tier = defaultTierForCronTask(task);
  const premium = (env.ANTHROPIC_MODEL_PREMIUM ?? "").trim();
  const cheap = (env.ANTHROPIC_MODEL_CHEAP ?? "").trim();
  const fallback = (env.ANTHROPIC_MODEL ?? "").trim();
  if (tier === "premium") {
    return premium || fallback || "claude-opus-4-7";
  }
  return cheap || fallback || "claude-3-5-haiku-20241022";
}
