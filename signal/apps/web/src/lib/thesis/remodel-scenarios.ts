import type { SupabaseClient } from "@supabase/supabase-js";
import { completeCheapAnthropicJson, completeNvidiaJson } from "@/lib/ai/thesis-pipeline-llm";
import { completeKimiJsonObject, isKimiJsonConfigured } from "@/lib/macro-reasoning/kimi-messages";
import { resolveCheapAnthropicModel } from "@/lib/macro-reasoning/model-routing";
import { isPlaceholderTradeLevel } from "@/lib/ai/thesis-pipeline-body";
import { getDailyBars } from "@/lib/market-data";
import { maxScenarioDelta } from "@/lib/ai/resolution-probability-update";
import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { resolveQuoteSymbol, parsePriceLevel } from "@/lib/thesis/check-resolution";
import { pickWhatChangedSummary } from "@/lib/thesis/generate-what-changed";
import { SYSTEM_MUTATION, systemUpdateThesis } from "@/lib/thesis-mutation";

export type RemodelTradePlan = {
  entryZone: string;
  stopLoss: string;
  targetPrice: string;
};

export type RemodelScenarios = {
  clean: number;
  messy: number;
  broken: number;
};

export type RemodelResult = {
  thesisId: string;
  thesisSlug: string | null;
  assetSymbol: string;
  oldScenarios: RemodelScenarios;
  newScenarios: RemodelScenarios;
  oldTradePlan: RemodelTradePlan;
  newTradePlan: RemodelTradePlan;
  confidenceDelta: number;
  whatChanged: string;
  currentPrice: number | null;
  processedAt: string;
  scenarioDelta: number;
  levelsChanged: boolean;
};

type LlmRemodelPayload = {
  scenarios?: {
    clean?: { probability?: number; reasoning?: string };
    messy?: { probability?: number; reasoning?: string };
    broken?: { probability?: number; reasoning?: string };
  };
  tradePlan?: {
    entryZone?: string;
    stopLoss?: string;
    targetPrice?: string;
    rationale?: string;
  };
  confidenceDelta?: number;
  whatChanged?: string;
};

function parseDbTriple(raw: unknown): DbScenarioTriple {
  if (!raw || typeof raw !== "object") return { bull: 34, base: 33, bear: 33 };
  const o = raw as Record<string, unknown>;
  const base = Number(o.base);
  const bull = Number(o.bull);
  const bear = Number(o.bear);
  if (![base, bull, bear].every((n) => Number.isFinite(n))) return { bull: 34, base: 33, bear: 33 };
  return { base: Math.round(base), bull: Math.round(bull), bear: Math.round(bear) };
}

export function tripleToCleanMessyBroken(t: DbScenarioTriple): RemodelScenarios {
  return { clean: t.bull, messy: t.base, broken: t.bear };
}

export function cleanMessyBrokenToTriple(s: RemodelScenarios): DbScenarioTriple {
  return { bull: s.clean, base: s.messy, bear: s.broken };
}

export function normalizeScenarioTriple(s: RemodelScenarios): RemodelScenarios {
  let clean = Math.max(5, Math.min(90, Math.round(s.clean)));
  let messy = Math.max(5, Math.min(90, Math.round(s.messy)));
  let broken = Math.max(5, Math.min(90, Math.round(s.broken)));
  const sum = clean + messy + broken;
  if (sum === 100) return { clean, messy, broken };
  clean = Math.round((clean / sum) * 100);
  messy = Math.round((messy / sum) * 100);
  broken = 100 - clean - messy;
  if (broken < 5) {
    broken = 5;
    messy = Math.max(5, 100 - clean - broken);
  }
  return { clean, messy, broken };
}

function readTradePlanFromBody(body: Record<string, unknown>): RemodelTradePlan {
  const tp = (body.tradePlan ?? body.trade_plan) as Record<string, unknown> | undefined;
  const entryZone = String(tp?.entry_zone ?? tp?.entryZone ?? body.entry_zone ?? "").trim();
  const stopLoss = String(tp?.stop ?? body.stop ?? "").trim();
  const targetPrice = String(tp?.target1 ?? tp?.targetPrice ?? body.target1 ?? "").trim();
  return {
    entryZone: entryZone || "—",
    stopLoss: stopLoss || "—",
    targetPrice: targetPrice || "—",
  };
}

function assetFromBody(body: Record<string, unknown>): string {
  return (
    String(body.target_asset ?? body.targetAsset ?? body.asset ?? "")
      .split(/[\s—–-]/)[0]
      ?.trim() || "—"
  );
}

async function fetchCurrentPrice(assetSymbol: string): Promise<number | null> {
  const quote = resolveQuoteSymbol(assetSymbol);
  if (!quote) return null;
  try {
    const bars = await getDailyBars(quote);
    const close = bars[bars.length - 1]?.close;
    return close != null && Number.isFinite(close) ? close : null;
  } catch (e) {
    console.warn("[remodel-scenarios] price_fetch_failed", {
      assetSymbol,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function formatEvidenceBlock(
  rows: { created_at: string; description: string | null; metadata: unknown }[],
): string {
  return rows
    .slice(0, 8)
    .map((r, i) => {
      const meta =
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      const source = typeof meta.source === "string" ? meta.source : "DEPTH4";
      const headline = (r.description ?? "").replace(/^\[[^\]]+\]\s*/, "").trim() || "Evidence";
      const impact =
        typeof meta.impact_direction === "string" ? meta.impact_direction : "";
      return `${i + 1}. [${source}] ${headline}${impact ? ` (${impact})` : ""} · ${r.created_at.slice(0, 10)}`;
    })
    .join("\n");
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Accept Kimi/Haiku variants (snake_case, flat probs, clean/messy/broken at top level). */
export function normalizeRemodelPayload(raw: unknown): LlmRemodelPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const scenariosIn = (o.scenarios ?? o.scenario_probabilities ?? o.scenarioProbabilities) as
    | Record<string, unknown>
    | undefined;
  const tpIn = (o.tradePlan ?? o.trade_plan ?? o.tradeplan) as Record<string, unknown> | undefined;

  const readPath = (branch: string): { probability?: number; reasoning?: string } | undefined => {
    if (!scenariosIn) return undefined;
    const node = scenariosIn[branch];
    if (node && typeof node === "object") {
      const n = node as Record<string, unknown>;
      return {
        probability: num(n.probability ?? n.prob ?? n.pct),
        reasoning: typeof n.reasoning === "string" ? n.reasoning : undefined,
      };
    }
    const flat = num(scenariosIn[branch]);
    return flat != null ? { probability: flat } : undefined;
  };

  const clean = readPath("clean") ?? readPath("bull");
  const messy = readPath("messy") ?? readPath("base");
  const broken = readPath("broken") ?? readPath("bear");

  const payload: LlmRemodelPayload = {
    scenarios: { clean, messy, broken },
    tradePlan: tpIn
      ? {
          entryZone: String(tpIn.entryZone ?? tpIn.entry_zone ?? "").trim() || undefined,
          stopLoss: String(tpIn.stopLoss ?? tpIn.stop_loss ?? tpIn.stop ?? "").trim() || undefined,
          targetPrice: String(tpIn.targetPrice ?? tpIn.target_price ?? tpIn.target ?? "").trim() || undefined,
          rationale: typeof tpIn.rationale === "string" ? tpIn.rationale : undefined,
        }
      : undefined,
    confidenceDelta: num(o.confidenceDelta ?? o.confidence_delta),
    whatChanged: typeof o.whatChanged === "string" ? o.whatChanged : typeof o.what_changed === "string" ? o.what_changed : undefined,
  };

  const probs = [
    payload.scenarios?.clean?.probability,
    payload.scenarios?.messy?.probability,
    payload.scenarios?.broken?.probability,
  ];
  const hasProbs = probs.some((p) => p != null);
  const hasLevels = [
    payload.tradePlan?.entryZone,
    payload.tradePlan?.stopLoss,
    payload.tradePlan?.targetPrice,
  ].some((v) => typeof v === "string" && v.length > 0);
  return hasProbs || hasLevels ? payload : null;
}

const REMODEL_JSON_SYSTEM =
  "You output strict JSON only. No markdown fences or commentary outside the JSON object.";

const REMODEL_MAX_TOKENS = 1600;

async function completeRemodelJson(prompt: string): Promise<LlmRemodelPayload | null> {
  const retrySuffix =
    "\n\nPRIOR OUTPUT WAS INVALID. Return ONLY one JSON object matching the schema in TASK — no markdown, no commentary.";

  const providers: {
    label: string;
    run: (userPrompt: string) => Promise<unknown | null>;
  }[] = [];

  if (isKimiJsonConfigured()) {
    providers.push({
      label: "kimi:json_object",
      run: (userPrompt) =>
        completeKimiJsonObject({
          system: REMODEL_JSON_SYSTEM,
          user: userPrompt,
          maxTokens: REMODEL_MAX_TOKENS,
        }),
    });
  }

  providers.push({
    label: "nvidia",
    run: (userPrompt) => completeNvidiaJson(userPrompt, REMODEL_MAX_TOKENS),
  });

  providers.push({
    label: `anthropic:${resolveCheapAnthropicModel()}`,
    run: (userPrompt) => completeCheapAnthropicJson(userPrompt, REMODEL_MAX_TOKENS),
  });

  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const userPrompt = attempt === 0 ? prompt : `${prompt}${retrySuffix}`;
      try {
        const raw = await provider.run(userPrompt);
        const normalized = normalizeRemodelPayload(raw);
        if (normalized) {
          console.info("[remodel-scenarios] llm_ok", {
            provider: provider.label,
            attempt: attempt + 1,
          });
          return normalized;
        }
        console.warn("[remodel-scenarios] llm_invalid_payload", {
          provider: provider.label,
          attempt: attempt + 1,
        });
      } catch (e) {
        console.warn("[remodel-scenarios] llm_attempt_failed", {
          provider: provider.label,
          attempt: attempt + 1,
          message: e instanceof Error ? e.message : String(e),
        });
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  return null;
}

export type RemodelThesisOptions = {
  evidenceLogId?: string;
  triggerReason?: string;
};

/**
 * Full thesis re-model: live price + scenarios + trade plan + what-changed audit row.
 */
export async function remodelThesisScenarios(
  admin: SupabaseClient,
  thesisIdOrSlug: string,
  options: RemodelThesisOptions = {},
): Promise<RemodelResult> {
  const key = thesisIdOrSlug.trim();
  const byId = await admin.from("theses").select("*").eq("id", key).maybeSingle();
  let row = byId.data;
  if (!row) {
    const bySlug = await admin.from("theses").select("*").eq("slug", key).maybeSingle();
    row = bySlug.data;
  }
  if (!row) throw new Error("thesis_not_found");

  const thesisId = String(row.id);
  const body =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? (row.body as Record<string, unknown>)
      : {};

  const assetSymbol = assetFromBody(body);
  const direction = String(body.direction ?? "watch");
  const oldTriple = parseDbTriple(row.scenario_probabilities);
  const oldScenarios = tripleToCleanMessyBroken(oldTriple);
  const oldTradePlan = readTradePlanFromBody(body);

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: evidenceRows } = await admin
    .from("thesis_evidence_log")
    .select("id, created_at, description, metadata")
    .eq("thesis_id", thesisId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(12);

  const currentPrice = await fetchCurrentPrice(assetSymbol);
  const rp = (body.resolutionPaths ?? body.resolution_paths) as Record<string, unknown> | undefined;
  const cleanDesc = String(rp?.clean ?? "thesis fully confirmed").slice(0, 400);
  const messyDesc = String(rp?.messy ?? "partial confirmation").slice(0, 400);
  const brokenDesc = String(rp?.broken ?? "thesis invalidated").slice(0, 400);
  const horizon = String(body.time_horizon ?? body.horizon ?? row.horizon ?? "weeks").slice(0, 80);

  const prompt = `You are re-modeling a macro thesis as new evidence arrives. Output ONLY a JSON object.

CURRENT THESIS:
- Title: ${String(row.title ?? "").slice(0, 200)}
- Asset: ${assetSymbol}
- Direction: ${direction}
- Current Price: ${currentPrice != null ? `$${currentPrice}` : "unavailable"}
- Original Entry Zone: ${oldTradePlan.entryZone}
- Original Stop: ${oldTradePlan.stopLoss}
- Original Target: ${oldTradePlan.targetPrice}
- Time Horizon: ${horizon}

SCENARIO FRAMEWORK:
- Clean: ${cleanDesc} (original prob: ${oldScenarios.clean}%)
- Messy: ${messyDesc} (original prob: ${oldScenarios.messy}%)
- Broken: ${brokenDesc} (original prob: ${oldScenarios.broken}%)

RECENT EVIDENCE (last 7 days):
${formatEvidenceBlock(evidenceRows ?? []) || "None logged."}

TASK — JSON only:
{
  "scenarios": {
    "clean": { "probability": number, "reasoning": "1 sentence" },
    "messy": { "probability": number, "reasoning": "1 sentence" },
    "broken": { "probability": number, "reasoning": "1 sentence" }
  },
  "tradePlan": {
    "entryZone": "price range e.g. $78.50-80.50",
    "stopLoss": "price level",
    "targetPrice": "primary target",
    "rationale": "1-2 sentences"
  },
  "confidenceDelta": number (-20 to +20),
  "whatChanged": "2-3 sentences for a macro trader; plain English"
}

RULES:
1. Probabilities must sum to 100; each path 5-90.
2. If price is far from entry for a directional thesis, move entry zone toward current reality — do not keep stale levels.
3. Ground stops/targets in current price when available.
4. If within ~5% of stop, mention risk; within ~5% of target, mention opportunity.`;

  const parsed = await completeRemodelJson(prompt);
  if (!parsed) throw new Error("llm_remodel_failed");

  const newScenarios = normalizeScenarioTriple({
    clean: Number(parsed.scenarios?.clean?.probability ?? oldScenarios.clean),
    messy: Number(parsed.scenarios?.messy?.probability ?? oldScenarios.messy),
    broken: Number(parsed.scenarios?.broken?.probability ?? oldScenarios.broken),
  });

  const newTradePlan: RemodelTradePlan = {
    entryZone: String(parsed.tradePlan?.entryZone ?? oldTradePlan.entryZone).trim() || oldTradePlan.entryZone,
    stopLoss: String(parsed.tradePlan?.stopLoss ?? oldTradePlan.stopLoss).trim() || oldTradePlan.stopLoss,
    targetPrice: String(parsed.tradePlan?.targetPrice ?? oldTradePlan.targetPrice).trim() || oldTradePlan.targetPrice,
  };

  const confidenceDelta = Math.max(
    -20,
    Math.min(20, Math.round(Number(parsed.confidenceDelta ?? 0))),
  );

  const processedAt = new Date().toISOString();
  const nextTriple = cleanMessyBrokenToTriple(newScenarios);
  const scenarioDelta = maxScenarioDelta(oldTriple, nextTriple);
  const levelsChanged =
    oldTradePlan.entryZone !== newTradePlan.entryZone ||
    oldTradePlan.stopLoss !== newTradePlan.stopLoss ||
    oldTradePlan.targetPrice !== newTradePlan.targetPrice;

  const draftResult: RemodelResult = {
    thesisId,
    thesisSlug: typeof row.slug === "string" ? row.slug : null,
    assetSymbol,
    oldScenarios,
    newScenarios,
    oldTradePlan,
    newTradePlan,
    confidenceDelta,
    whatChanged: String(parsed.whatChanged ?? "").trim(),
    currentPrice,
    processedAt,
    scenarioDelta,
    levelsChanged,
  };

  const whatChanged = pickWhatChangedSummary(draftResult);

  const updatedBody: Record<string, unknown> = {
    ...body,
    tradePlan: {
      ...(typeof body.tradePlan === "object" && body.tradePlan ? (body.tradePlan as object) : {}),
      entry_zone: newTradePlan.entryZone,
      stop: newTradePlan.stopLoss,
      target1: newTradePlan.targetPrice,
      target2:
        (typeof body.tradePlan === "object" &&
          body.tradePlan &&
          (body.tradePlan as Record<string, unknown>).target2) ||
        body.target2 ||
        null,
      rationale: parsed.tradePlan?.rationale ?? null,
      lastRemodeledAt: processedAt,
    },
    entry_zone: newTradePlan.entryZone,
    stop: newTradePlan.stopLoss,
    target1: newTradePlan.targetPrice,
  };

  const changeType =
    scenarioDelta >= 10 || levelsChanged ? "scenario_shift" : scenarioDelta >= 3 ? "evidence" : "field_update";

  const upd = await systemUpdateThesis(
    admin,
    thesisId,
    {
      body: updatedBody,
      scenario_probabilities: nextTriple,
      updated_at: processedAt,
      last_meaningful_update_at: processedAt,
    } as never,
    {
      actorType: SYSTEM_MUTATION.news.actorType,
      reason: whatChanged.slice(0, 500),
      changeType,
      metadata: {
        source: "remodel_thesis_scenarios",
        trigger_reason: options.triggerReason ?? "new_evidence",
        what_changed: whatChanged,
        scenario_probabilities_before: oldTriple,
        scenario_probabilities_after: nextTriple,
        old_trade_plan: oldTradePlan,
        new_trade_plan: newTradePlan,
        confidence_delta: confidenceDelta,
        current_price: currentPrice,
        evidence_log_id: options.evidenceLogId ?? null,
        thesis_slug: typeof row.slug === "string" ? row.slug : null,
        update_kind:
          scenarioDelta >= 15
            ? "significant_shift"
            : scenarioDelta >= 10
              ? "probability_shift"
              : levelsChanged
                ? "trade_plan_update"
                : "scenario_refresh",
      },
    },
  );

  if (!upd.ok) throw new Error(upd.error ?? "thesis_update_failed");

  if (options.evidenceLogId) {
    await admin
      .from("thesis_evidence_log")
      .update({
        probability_before: oldTriple,
        probability_after: nextTriple,
      } as never)
      .eq("id", options.evidenceLogId);
  }

  return { ...draftResult, whatChanged };
}

/** Skip remodel when trade plan is still placeholder-only. */
export function thesisNeedsTradePlanRemodel(body: Record<string, unknown>): boolean {
  const tp = readTradePlanFromBody(body);
  return (
    isPlaceholderTradeLevel(tp.entryZone) ||
    isPlaceholderTradeLevel(tp.stopLoss) ||
    isPlaceholderTradeLevel(tp.targetPrice)
  );
}

export function nearLevelPct(current: number, levelRaw: string): number | null {
  const level = parsePriceLevel(levelRaw);
  if (level == null || level === 0) return null;
  return Math.abs((current - level) / level) * 100;
}
