/**
 * TS mirror of Python `signal_api/ai/model_routing.py` tier caps and env naming
 * for Vercel/Next cron routes that cannot call the FastAPI router in-process.
 *
 * Cheap pipeline steps: Kimi → NVIDIA NIM → Anthropic Haiku (first available wins).
 * Thesis writing (step 4): Anthropic premium — see `resolvePremiumAnthropicModel`.
 */

export const TIER_MAX_TOKENS = { cheap: 1536, standard: 4096, premium: 8192 } as const;

export type ModelTaskTierKey = keyof typeof TIER_MAX_TOKENS;

/** Cron-local task ids — extend as more TS-side LLM jobs appear. */
export type CronLlmTaskType = "macro_event_reasoning" | "macro_registry_repair";

const CRON_TASK_DEFAULT_TIER: Record<CronLlmTaskType, ModelTaskTierKey> = {
  macro_event_reasoning: "premium",
  macro_registry_repair: "premium",
};

export function defaultTierForCronTask(task: CronLlmTaskType): ModelTaskTierKey {
  return CRON_TASK_DEFAULT_TIER[task] ?? "standard";
}

export function tierMaxTokens(tier: ModelTaskTierKey): number {
  return TIER_MAX_TOKENS[tier];
}

/** Retired aliases that return 404 on the Anthropic Messages API. */
const RETIRED_ANTHROPIC_MODEL_IDS = new Set([
  "claude-3-5-haiku-latest",
  "claude-opus-4-7",
]);

/** Default cheap model for pipeline steps, remodel fallback, and incentive analysis. */
export const DEFAULT_CHEAP_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";

/**
 * Cheap-tier Anthropic model — `ANTHROPIC_MODEL_CHEAP`, then `ANTHROPIC_MODEL`, then Haiku 4.5.
 * Maps retired env values (e.g. `claude-3-5-haiku-latest`) to the current default.
 */
export function resolveCheapAnthropicModel(env: NodeJS.ProcessEnv = process.env): string {
  const cheap = (env.ANTHROPIC_MODEL_CHEAP ?? "").trim();
  const fallback = (env.ANTHROPIC_MODEL ?? "").trim();
  const pick = cheap || fallback;
  if (pick && !RETIRED_ANTHROPIC_MODEL_IDS.has(pick)) return pick;
  return DEFAULT_CHEAP_ANTHROPIC_MODEL;
}

export const DEFAULT_KIMI_MODEL = "kimi-k2.6";
/** Keys from https://platform.kimi.ai — use `https://api.moonshot.ai/v1` */
export const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.ai/v1";
/** Keys from https://platform.moonshot.cn — set `KIMI_BASE_URL` to this explicitly */
export const KIMI_BASE_URL_CHINA = "https://api.moonshot.cn/v1";

export function normalizeKimiApiKey(raw: string | undefined): string {
  let k = (raw ?? "").trim();
  if (k.toLowerCase().startsWith("bearer ")) {
    k = k.slice(7).trim();
  }
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

export function isKimiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(normalizeKimiApiKey(env.KIMI_API_KEY));
}

export function resolveKimiModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.KIMI_MODEL ?? "").trim() || DEFAULT_KIMI_MODEL;
}

export function resolveKimiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.KIMI_BASE_URL ?? "").trim();
  if (explicit) return explicit;
  const region = (env.KIMI_REGION ?? "").trim().toLowerCase();
  if (region === "cn" || region === "china") return KIMI_BASE_URL_CHINA;
  return DEFAULT_KIMI_BASE_URL;
}

/** User-visible thesis copy and escalation path — not Kimi by default. */
export function resolvePremiumAnthropicModel(env: NodeJS.ProcessEnv = process.env): string {
  const premium = (env.ANTHROPIC_MODEL_PREMIUM ?? "").trim();
  const fallback = (env.ANTHROPIC_MODEL ?? "").trim();
  const pick = premium || fallback;
  if (pick && !RETIRED_ANTHROPIC_MODEL_IDS.has(pick)) return pick;
  return resolveCheapAnthropicModel(env);
}

export const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";
export const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function normalizeNvidiaApiKey(raw: string | undefined): string {
  let k = (raw ?? "").trim();
  if (k.toLowerCase().startsWith("bearer ")) k = k.slice(7).trim();
  return k;
}

export function isNvidiaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(normalizeNvidiaApiKey(env.NVIDIA_API_KEY));
}

export function resolveNvidiaModel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NVIDIA_MODEL ?? "").trim() || DEFAULT_NVIDIA_MODEL;
}

export function resolveNvidiaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NVIDIA_BASE_URL ?? "").trim() || DEFAULT_NVIDIA_BASE_URL;
}

/** Label for logs / test script (full fallback chain). */
export function describeCheapPipelineProvider(env: NodeJS.ProcessEnv = process.env): string {
  const chain: string[] = [];
  if (isKimiConfigured(env)) chain.push(`kimi:${resolveKimiModel(env)}`);
  if (isNvidiaConfigured(env)) chain.push(`nvidia:${resolveNvidiaModel(env)}`);
  chain.push(`anthropic:${resolveCheapAnthropicModel(env)}`);
  return chain.join(" → ");
}

/**
 * Anthropic model id for a cron task — align env with API:
 * - premium tier: ANTHROPIC_MODEL_PREMIUM, then ANTHROPIC_MODEL
 * - else: ANTHROPIC_MODEL_CHEAP, then ANTHROPIC_MODEL
 */
export function resolveCronAnthropicModel(env: NodeJS.ProcessEnv, task: CronLlmTaskType): string {
  const tier = defaultTierForCronTask(task);
  const premium = (env.ANTHROPIC_MODEL_PREMIUM ?? "").trim();
  const fallback = (env.ANTHROPIC_MODEL ?? "").trim();
  if (tier === "premium") {
    return resolvePremiumAnthropicModel(env);
  }
  return resolveCheapAnthropicModel(env);
}
