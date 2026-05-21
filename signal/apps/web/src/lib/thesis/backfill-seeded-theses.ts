import type { SupabaseClient } from "@supabase/supabase-js";
import { bodyEvidenceCount, verifyPipelineBodyForRender } from "@/lib/ai/thesis-pipeline-body";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import { buildDepth4LlmSystemPrompt } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";
import { completeKimiJsonObject, isKimiJsonConfigured } from "@/lib/macro-reasoning/kimi-messages";
import {
  bodyPatchFromPopulatePayload,
  parsePopulateUserThesisPayload,
  type PopulateAiPayload,
} from "@/lib/thesis/populate-user-thesis-body";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

const LIVE_STATUSES = ["ready", "watching", "active"] as const;
const RATE_LIMIT_MS = 3000;
const MIN_EVIDENCE_TO_SKIP = 2;

export type SeededThesisRow = {
  id: string;
  slug: string;
  title: string;
  body: unknown;
  incentive_analysis: unknown;
  micro_label?: string | null;
  scenario_probabilities?: unknown;
  status?: string;
};

export type SeededBackfillResult = {
  processed: number;
  errors: number;
  total: number;
  skipped: number;
  dryRun: boolean;
  slugs: string[];
  logs: Array<{ slug: string; ok: boolean; message?: string; method?: string }>;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function existingBodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return { ...(body as Record<string, unknown>) };
}

function assetSymbolForRow(row: SeededThesisRow): string {
  const body = existingBodyRecord(row.body);
  const fromBody = str(body.target_asset ?? body.asset);
  if (fromBody && fromBody !== "—") return fromBody.split(/[\s—–\-/]/)[0]!.trim();
  const catalog = getThesisBySlug(row.slug);
  if (catalog?.asset && catalog.asset !== "—") {
    return catalog.asset.split(/[\s—–\-/]/)[0]!.trim();
  }
  return "—";
}

function directionForRow(row: SeededThesisRow): string {
  const body = existingBodyRecord(row.body);
  const fromBody = str(body.direction);
  if (fromBody) return fromBody;
  const catalog = getThesisBySlug(row.slug);
  if (catalog?.direction === "short") return "down";
  if (catalog?.direction === "long") return "up";
  return "watch";
}

function timeHorizonForRow(row: SeededThesisRow): string {
  const body = existingBodyRecord(row.body);
  const fromBody = str(body.time_horizon ?? body.horizon);
  if (fromBody) return fromBody;
  const catalog = getThesisBySlug(row.slug);
  return catalog?.horizon?.trim() || "This quarter";
}

/** Idempotent skip when body already has enough evidence rows. */
export function hasSeededBackfillEvidence(body: unknown): boolean {
  return bodyEvidenceCount(body) >= MIN_EVIDENCE_TO_SKIP;
}

/** True when pipeline body blocks or narrative summary are missing. */
export function needsSeededBodyBackfill(body: unknown): boolean {
  if (hasSeededBackfillEvidence(body)) return false;
  const pipe = verifyPipelineBodyForRender(body);
  if (!pipe.ok) return true;
  const o = existingBodyRecord(body);
  const hasSummary = Boolean(str(o.summary ?? o.one_line_summary));
  const hasNarrative = Boolean(str(o.narrative ?? o.why_thesis_exists));
  const hasCausal = Array.isArray(o.causal_chain) && o.causal_chain.length > 0;
  return !hasSummary || !hasNarrative || !hasCausal;
}

export type SeededBackfillAiPayload = PopulateAiPayload & {
  summary?: string;
  narrative?: string;
};

export function parseSeededBackfillPayload(raw: unknown): SeededBackfillAiPayload | null {
  const base = parsePopulateUserThesisPayload(raw);
  if (!base) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  return {
    ...base,
    summary: str(o.summary) || undefined,
    narrative: str(o.narrative) || undefined,
  };
}

export function normalizeResolutionPathProbabilities(
  paths: NonNullable<PopulateAiPayload["resolutionPaths"]>,
): NonNullable<PopulateAiPayload["resolutionPaths"]> {
  const cleanP = Number(paths.clean && typeof paths.clean === "object" ? paths.clean.probability : NaN);
  const messyP = Number(paths.messy && typeof paths.messy === "object" ? paths.messy.probability : NaN);
  const brokenP = Number(paths.broken && typeof paths.broken === "object" ? paths.broken.probability : NaN);
  const total = cleanP + messyP + brokenP;
  if (!Number.isFinite(total) || total <= 0) return paths;

  const factor = 100 / total;
  const clean = Math.round(cleanP * factor);
  const messy = Math.round(messyP * factor);
  const broken = 100 - clean - messy;

  type PathLeg = { probability?: number; description?: string; trigger?: string };
  const leg = (raw: string | PathLeg | undefined, probability: number): PathLeg => {
    if (!raw || typeof raw === "string") {
      return { probability, description: raw ?? "", trigger: "" };
    }
    return { ...raw, probability };
  };

  return {
    clean: leg(paths.clean, clean),
    messy: leg(paths.messy, messy),
    broken: leg(paths.broken, broken),
  };
}

type BodyEvidenceRow = { date: string; source: string; excerpt: string; url?: string | null };

function dedupeEvidenceRows(rows: BodyEvidenceRow[]): BodyEvidenceRow[] {
  const seen = new Set<string>();
  const out: BodyEvidenceRow[] = [];
  for (const row of rows) {
    const key = `${row.source.toLowerCase()}|${row.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Merge `thesis_evidence_log` descriptions into `body.evidence` when log rows exist. */
export function mergeLogEvidenceIntoBodyEvidence(
  bodyEvidence: BodyEvidenceRow[],
  logRows: Array<{
    created_at?: string | null;
    description?: string | null;
    metadata?: unknown;
  }>,
): BodyEvidenceRow[] {
  const fromLog: BodyEvidenceRow[] = [];
  for (const row of logRows) {
    const excerpt = str(row.description);
    if (!excerpt) continue;
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const date =
      str(meta.date) ||
      (row.created_at ? String(row.created_at).slice(0, 10) : "") ||
      new Date().toISOString().slice(0, 10);
    fromLog.push({
      date,
      source: str(meta.source) || "News",
      excerpt,
      url: meta.url != null ? String(meta.url) : null,
    });
  }
  return dedupeEvidenceRows([...bodyEvidence, ...fromLog]);
}

function buildBackfillPrompt(row: SeededThesisRow, assetSymbol: string, direction: string, timeHorizon: string): string {
  const incentiveJson = JSON.stringify(row.incentive_analysis ?? {}, null, 2);
  return [
    "You are backfilling a DEPTH4 macro thesis that only has a title, asset, direction, and incentive analysis.",
    "Generate a complete thesis body with standard DEPTH4 fields.",
    "",
    "THESIS INFO:",
    `- Title: ${row.title}`,
    `- Asset: ${assetSymbol}`,
    `- Direction: ${direction}`,
    `- Time horizon: ${timeHorizon}`,
    `- Incentive analysis: ${incentiveJson}`,
    "",
    "Generate:",
    "1. summary — 2-3 sentence thesis overview (probabilistic, research framing)",
    "2. narrative — full thesis reasoning, 3-5 short paragraphs",
    "3. tradePlan — entryZone, stopLoss, targetPrice, rationale (research framing, not orders)",
    "4. resolutionPaths — clean / messy / broken with probabilities summing to 100",
    "5. causal_chain — 2-3 steps linking event to asset price",
    "6. evidence — 2-4 realistic items with date, source, excerpt",
    "",
    "Output ONLY JSON:",
    "{",
    '  "summary": "...",',
    '  "narrative": "...",',
    '  "tradePlan": { "entryZone": "$X-Y", "stopLoss": "$Z", "targetPrice": "$W", "rationale": "..." },',
    '  "resolutionPaths": {',
    '    "clean": { "probability": 40, "description": "...", "trigger": "..." },',
    '    "messy": { "probability": 35, "description": "...", "trigger": "..." },',
    '    "broken": { "probability": 25, "description": "...", "trigger": "..." }',
    "  },",
    '  "causal_chain": [{ "step": 1, "event": "...", "asset": "...", "expected_move": "..." }],',
    '  "evidence": [{ "date": "2024-01-15", "source": "Reuters", "excerpt": "..." }]',
    "}",
    "",
    "COMPLIANCE: Probabilistic language only. No buy/sell imperatives. No certainty.",
    'Frame as "the thesis implies" or "analysis suggests" — never "you should" or "we are initiating".',
  ].join("\n");
}

function enrichedBodyFromAi(
  parsed: SeededBackfillAiPayload,
  assetSymbol: string,
  existingBody: Record<string, unknown>,
): { body: Record<string, unknown>; scenarioProbabilities: { base: number; bull: number; bear: number } } {
  const normalized: SeededBackfillAiPayload = {
    ...parsed,
    resolutionPaths: parsed.resolutionPaths
      ? normalizeResolutionPathProbabilities(parsed.resolutionPaths)
      : parsed.resolutionPaths,
  };

  const { body, scenarioProbabilities } = bodyPatchFromPopulatePayload(normalized, assetSymbol);
  const summary = str(normalized.summary);
  const narrative = str(normalized.narrative);

  return {
    body: {
      ...existingBody,
      ...body,
      ...(summary ? { one_line_summary: summary, summary } : {}),
      ...(narrative ? { why_thesis_exists: narrative, narrative } : {}),
      backfilled_at: new Date().toISOString(),
    },
    scenarioProbabilities,
  };
}

async function fetchLogEvidence(admin: SupabaseClient, thesisId: string) {
  const { data, error } = await admin
    .from("thesis_evidence_log")
    .select("created_at, description, metadata")
    .eq("thesis_id", thesisId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return [];
  return data ?? [];
}

export type BackfillSeededThesesOptions = {
  slug?: string;
  limit?: number;
  dryRun?: boolean;
  rateLimitMs?: number;
};

export async function backfillSeededTheses(
  options: BackfillSeededThesesOptions = {},
): Promise<SeededBackfillResult> {
  const dryRun = options.dryRun === true;
  const logs: SeededBackfillResult["logs"] = [];

  if (!isKimiJsonConfigured()) {
    return {
      processed: 0,
      errors: 1,
      total: 0,
      skipped: 0,
      dryRun,
      slugs: [],
      logs: [{ slug: "*", ok: false, message: "KIMI_API_KEY not configured" }],
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      processed: 0,
      errors: 1,
      total: 0,
      skipped: 0,
      dryRun,
      slugs: [],
      logs: [{ slug: "*", ok: false, message: "SUPABASE_SERVICE_ROLE_KEY not configured" }],
    };
  }

  let query = admin
    .from("theses")
    .select("id, slug, title, body, incentive_analysis, micro_label, scenario_probabilities, status")
    .eq("thesis_origin", "seeded_system");

  if (options.slug?.trim()) {
    query = query.eq("slug", options.slug.trim());
  } else {
    query = query.in("status", [...LIVE_STATUSES]);
  }

  const { data: rows, error: fetchError } = await query;
  if (fetchError) {
    return {
      processed: 0,
      errors: 1,
      total: 0,
      skipped: 0,
      dryRun,
      slugs: [],
      logs: [{ slug: "*", ok: false, message: fetchError.message }],
    };
  }

  const allRows = (rows ?? []) as SeededThesisRow[];
  const total = allRows.length;
  const skipped = allRows.filter((r) => !needsSeededBodyBackfill(r.body)).length;
  const candidates = allRows.filter((r) => needsSeededBodyBackfill(r.body));
  const limited =
    options.limit != null && options.limit > 0 ? candidates.slice(0, options.limit) : candidates;

  if (limited.length === 0) {
    return { processed: 0, errors: 0, total, skipped, dryRun, slugs: [], logs };
  }

  let processed = 0;
  let errors = 0;
  const slugs: string[] = [];

  for (const row of limited) {
    const slug = row.slug?.trim() || row.id;
    slugs.push(slug);
    try {
      const assetSymbol = assetSymbolForRow(row);
      const direction = directionForRow(row);
      const timeHorizon = timeHorizonForRow(row);

      const parsedRaw = await completeKimiJsonObject({
        system: buildDepth4LlmSystemPrompt({
          preamble: "You are DEPTH4's thesis body backfill writer.",
          extra: "Output strict JSON only. No markdown fences.",
        }),
        user: buildBackfillPrompt(row, assetSymbol, direction, timeHorizon),
        maxTokens: 2048,
      });

      const parsed = parseSeededBackfillPayload(parsedRaw);
      if (!parsed) {
        errors++;
        logs.push({ slug, ok: false, message: "invalid_llm_json" });
        continue;
      }

      const existingBody = existingBodyRecord(row.body);
      const { body: enrichedBody, scenarioProbabilities } = enrichedBodyFromAi(
        parsed,
        assetSymbol !== "—" ? assetSymbol : "XAUUSD",
        existingBody,
      );

      const evidenceRows = mergeLogEvidenceIntoBodyEvidence(
        Array.isArray(enrichedBody.evidence)
          ? (enrichedBody.evidence as BodyEvidenceRow[])
          : [],
        await fetchLogEvidence(admin, row.id),
      );
      enrichedBody.evidence = evidenceRows;

      if (!dryRun) {
        const { error: updErr } = await admin
          .from("theses")
          .update({
            body: enrichedBody,
            scenario_probabilities: scenarioProbabilities,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (updErr) {
          errors++;
          logs.push({ slug, ok: false, message: updErr.message });
          continue;
        }
      }

      processed++;
      logs.push({
        slug,
        ok: true,
        method: "kimi_backfill",
        message: dryRun ? "dry_run_ok" : "updated",
      });
    } catch (err) {
      errors++;
      logs.push({ slug, ok: false, message: err instanceof Error ? err.message : "backfill_failed" });
    }

    if (options.rateLimitMs !== 0) {
      await new Promise((r) => setTimeout(r, options.rateLimitMs ?? RATE_LIMIT_MS));
    }
  }

  return {
    processed,
    errors,
    total,
    skipped: skipped + (candidates.length - limited.length),
    dryRun,
    slugs,
    logs,
  };
}
