import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedItem } from "@/types/feed";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { CURATED_FOCUS_CATALOG_ORDER } from "@/lib/thesis-engine-v2/curated-focus-theses";
import {
  dbScenarioTripleEqualsSeed,
  thesisConvictionPctFromDbTriple,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { dbScenarioTripleFromMacroHeadlineLeadPct } from "@/lib/macro-reasoning/macro-headline-probability-to-db-triple";
import { pickStrongestCatalogThesisId } from "@/lib/macro-reasoning/pick-strongest-catalog-thesis";
import { safeParseMacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { formingNarrativeLineFromMacro } from "@/lib/feed/forming-narrative";
import {
  fetchPromotedMacroReasoningRows,
  parseReasoningPayload,
  toPromotedCardModel,
  type EventReasoningNewsJoin,
} from "@/lib/feed/promoted-macro-events";
import { fetchAiThesisIdByDiscoveryClusterIds, fetchThesisMetaMap, type ThesisMeta } from "@/lib/feed/thesis-slugs";

function formatFeedTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString();
}

function parseProb(raw: unknown): { base: number; bull: number; bear: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const b = o.base;
  const bu = o.bull;
  const be = o.bear;
  if (typeof b === "number" && typeof bu === "number" && typeof be === "number") {
    return { base: b, bull: bu, bear: be };
  }
  return null;
}

function headlineFromDescription(desc: string, max = 120): string {
  const t = desc.trim();
  if (!t) return "Thesis update";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function thesisMetaToFeedThesisFields(meta: ThesisMeta | undefined) {
  const slug = meta?.slug ?? null;
  const title = meta?.title ?? null;
  let asset = meta?.asset ?? null;
  let direction = meta?.direction ?? null;
  if (slug && (!asset || !direction)) {
    const d = getThesisDetail(slug);
    if (d) {
      asset = asset ?? d.thesis.asset;
      direction = direction ?? (d.thesis.direction === "short" ? "short" : d.thesis.direction === "long" ? "long" : null);
    }
  }
  return {
    thesisSlug: slug,
    thesisTitle: title,
    thesisAsset: asset,
    thesisDirection: direction,
    linkedThesisSlug: slug,
    linkedThesisTitle: title,
  };
}

async function fetchFormingNarrativeByNewsEventIds(
  supabase: SupabaseClient,
  newsEventIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(newsEventIds.map((x) => x.trim()).filter(Boolean)));
  if (!ids.length) return out;

  const { data, error } = await supabase
    .from("event_reasoning")
    .select("news_event_id, reasoning, created_at")
    .in("news_event_id", ids)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return out;

  for (const row of data as { news_event_id?: string; reasoning?: unknown }[]) {
    const nid = typeof row.news_event_id === "string" ? row.news_event_id.trim() : "";
    if (!nid || out.has(nid)) continue;
    const p = safeParseMacroEventReasoning(row.reasoning);
    if (!p.ok) continue;
    const line = formingNarrativeLineFromMacro(p.data);
    if (line) out.set(nid, line);
  }
  return out;
}

async function fetchNewsHeadlineItems(supabase: SupabaseClient, limit: number): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("news_events")
    .select("id, headline, source, published_at, signal_level")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    headline: string | null;
    source: string | null;
    published_at: string | null;
    signal_level: number | null;
  }[];

  const formingByNewsId = await fetchFormingNarrativeByNewsEventIds(
    supabase,
    rows.map((r) => r.id),
  );

  return rows.map((row) => {
    const iso = row.published_at;
    const headline = (row.headline ?? "").trim() || "Headline unavailable";
    return {
      id: `news-${row.id}`,
      type: "headline" as const,
      source: (row.source ?? "").trim() || "Wire",
      headline,
      timestamp: formatFeedTimestamp(iso),
      signalLevel: typeof row.signal_level === "number" ? row.signal_level : 0,
      thesisSlug: null,
      thesisTitle: null,
      thesisAsset: null,
      thesisDirection: null,
      oldConviction: null,
      newConviction: null,
      changeDirection: null,
      summary: headline,
      body: undefined,
      linkedThesisSlug: null,
      linkedThesisTitle: null,
      formingNarrative: formingByNewsId.get(row.id) ?? null,
    };
  });
}

async function fetchConvictionChangeItems(supabase: SupabaseClient, limit: number): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("thesis_evidence_log")
    .select("id, thesis_id, created_at, event_type, description, probability_before, probability_after, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    thesis_id: string;
    created_at: string;
    event_type: string;
    description: string | null;
    probability_before: unknown;
    probability_after: unknown;
    metadata: unknown;
  }[];

  const thesisIds = Array.from(new Set(rows.map((r) => String(r.thesis_id ?? "").trim()).filter(Boolean)));
  const metaById = await fetchThesisMetaMap(supabase, thesisIds);

  const out: FeedItem[] = [];
  for (const row of rows) {
    let before = parseProb(row.probability_before);
    const after = parseProb(row.probability_after);
    if (!after) continue;
    if (!before) {
      const metaObj = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
      const pbPct = metaObj.probability_before_pct;
      if (typeof pbPct === "number" && Number.isFinite(pbPct)) {
        before = dbScenarioTripleFromMacroHeadlineLeadPct(pbPct);
      }
    }
    if (!before) continue;
    if (dbScenarioTripleEqualsSeed(before) && dbScenarioTripleEqualsSeed(after)) continue;

    const oldC = thesisConvictionPctFromDbTriple(before);
    const newC = thesisConvictionPctFromDbTriple(after);
    if (oldC === newC) continue;

    const meta = metaById.get(String(row.thesis_id).trim());
    const t = thesisMetaToFeedThesisFields(meta);
    const metaObj = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    const sourceRaw = metaObj.source;
    const source = typeof sourceRaw === "string" && sourceRaw.trim() ? sourceRaw.trim() : "DEPTH4";

    const changeDirection: "up" | "down" = newC > oldC ? "up" : "down";
    const desc = (row.description ?? "").trim();
    const summary =
      desc ||
      (changeDirection === "up"
        ? "Conviction increased after new evidence on this thesis."
        : "Conviction decreased after new evidence on this thesis.");

    out.push({
      id: `conv-${row.id}`,
      type: "conviction_change",
      source,
      headline: headlineFromDescription(desc || row.event_type || "Thesis update"),
      timestamp: formatFeedTimestamp(row.created_at),
      signalLevel: typeof metaObj.signal_level === "number" ? metaObj.signal_level : 0,
      ...t,
      oldConviction: oldC,
      newConviction: newC,
      changeDirection,
      summary,
      body: undefined,
      linkedThesisSlug: t.linkedThesisSlug,
      linkedThesisTitle: t.linkedThesisTitle,
    });
  }
  return out;
}

function promotedJoinToFeedItem(
  row: EventReasoningNewsJoin,
  thesisMetaById: Map<string, ThesisMeta>,
  aiThesisIdByClusterId: Map<string, string>,
): FeedItem | null {
  const card = toPromotedCardModel(row);
  if (!card) return null;
  const parsed = card.reasoning;
  const reasoningBody = [parsed.reasoning_summary, parsed.reasoning_chain].filter(Boolean).join("\n\n");
  let primaryThesisId = (parsed.affected_theses[0] ?? "").trim();
  if (!primaryThesisId) {
    primaryThesisId =
      pickStrongestCatalogThesisId(parsed.per_catalog_thesis, CURATED_FOCUS_CATALOG_ORDER) ?? "";
  }
  if (!primaryThesisId && row.cluster_id) {
    primaryThesisId = aiThesisIdByClusterId.get(row.cluster_id) ?? "";
  }
  const meta = primaryThesisId ? thesisMetaById.get(primaryThesisId) : undefined;
  const newsJoin = parseReasoningPayload(row)?.news;
  const signalLevel = typeof newsJoin?.signal_level === "number" ? newsJoin.signal_level : 0;
  const t = thesisMetaToFeedThesisFields(meta);
  const linkedSlug = (t.linkedThesisSlug ?? "").trim();
  const formingNarrative = !linkedSlug ? formingNarrativeLineFromMacro(parsed) : null;
  const iso = newsJoin?.published_at ?? row.created_at;
  const summary =
    (parsed.reasoning_summary ?? "").trim() ||
    (parsed.event_summary ?? "").trim() ||
    card.headline;
  const slug = t.thesisSlug ?? undefined;
  const catalog = slug ? getThesisDetail(slug) : undefined;
  const convictionPct = catalog?.thesis?.probability;

  return {
    id: `reason-${row.id}`,
    type: "reasoning",
    source: (card.source ?? "").trim() || "Wire",
    headline: card.headline,
    timestamp: formatFeedTimestamp(iso),
    signalLevel,
    ...t,
    oldConviction: null,
    newConviction: typeof convictionPct === "number" ? convictionPct : null,
    changeDirection: null,
    summary,
    body: reasoningBody.trim() || undefined,
    linkedThesisSlug: t.linkedThesisSlug,
    linkedThesisTitle: t.linkedThesisTitle,
    formingNarrative,
  };
}

async function fetchReasoningItems(supabase: SupabaseClient, loadPromoted: boolean): Promise<FeedItem[]> {
  if (!loadPromoted) return [];
  const rows = await fetchPromotedMacroReasoningRows(supabase);
  const clusterIds = rows
    .map((r) => (typeof r.cluster_id === "string" ? r.cluster_id.trim() : ""))
    .filter(Boolean);
  const aiThesisIdByClusterId = await fetchAiThesisIdByDiscoveryClusterIds(supabase, clusterIds);
  const thesisIds = rows.flatMap((r) => {
    const m = toPromotedCardModel(r);
    return m ? m.reasoning.affected_theses : [];
  });
  const bridgeIds = clusterIds.map((cid) => aiThesisIdByClusterId.get(cid)).filter((x): x is string => !!x);
  const thesisMetaById = await fetchThesisMetaMap(supabase, [...thesisIds, ...bridgeIds]);
  return rows
    .map((r) => promotedJoinToFeedItem(r, thesisMetaById, aiThesisIdByClusterId))
    .filter((x): x is FeedItem => x !== null);
}

function parseRemodelScenarios(raw: unknown): { clean: number; messy: number; broken: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const bull = Number(o.bull ?? o.clean);
  const base = Number(o.base ?? o.messy);
  const bear = Number(o.bear ?? o.broken);
  if (![bull, base, bear].every((n) => Number.isFinite(n))) return null;
  return { clean: Math.round(bull), messy: Math.round(base), broken: Math.round(bear) };
}

async function fetchThesisRemodelFeedItems(supabase: SupabaseClient, limit: number): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("thesis_updates")
    .select("id, thesis_id, created_at, change_type, reason, metadata")
    .in("change_type", ["scenario_shift", "evidence", "field_update"])
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    thesis_id: string;
    created_at: string;
    change_type: string;
    reason: string | null;
    metadata: unknown;
  }[];

  const thesisIds = Array.from(new Set(rows.map((r) => r.thesis_id.trim()).filter(Boolean)));
  const metaById = await fetchThesisMetaMap(supabase, thesisIds);
  const out: FeedItem[] = [];

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    if (meta.source !== "remodel_thesis_scenarios") continue;

    const before = parseRemodelScenarios(meta.scenario_probabilities_before);
    const after = parseRemodelScenarios(meta.scenario_probabilities_after);
    if (!before || !after) continue;

    const probShift = Math.max(
      Math.abs(after.clean - before.clean),
      Math.abs(after.messy - before.messy),
      Math.abs(after.broken - before.broken),
    );
    const oldTp = meta.old_trade_plan as Record<string, unknown> | undefined;
    const newTp = meta.new_trade_plan as Record<string, unknown> | undefined;
    const levelsChanged =
      oldTp &&
      newTp &&
      (String(oldTp.entryZone) !== String(newTp.entryZone) ||
        String(oldTp.stopLoss) !== String(newTp.stopLoss) ||
        String(oldTp.targetPrice) !== String(newTp.targetPrice));

    if (probShift < 10 && !levelsChanged) continue;

    const whatChanged =
      (typeof meta.what_changed === "string" && meta.what_changed.trim()) ||
      (row.reason ?? "").trim() ||
      "Thesis scenarios and trade plan were updated.";

    const t = thesisMetaToFeedThesisFields(metaById.get(row.thesis_id.trim()));
    const headline =
      t.thesisTitle && whatChanged
        ? `${t.thesisTitle}: ${whatChanged.split(/[.!?]/)[0]?.slice(0, 100) ?? whatChanged.slice(0, 100)}`
        : headlineFromDescription(whatChanged);

    out.push({
      id: `remodel-${row.id}`,
      type: "thesis_remodel",
      source: "DEPTH4",
      headline,
      timestamp: formatFeedTimestamp(row.created_at),
      signalLevel: probShift >= 15 ? 3 : 2,
      ...t,
      oldConviction: before.clean,
      newConviction: after.clean,
      changeDirection: after.clean >= before.clean ? "up" : "down",
      summary: whatChanged,
      body: whatChanged,
      linkedThesisSlug: t.linkedThesisSlug,
      linkedThesisTitle: t.linkedThesisTitle,
      remodelMeta: {
        whatChanged,
        oldScenarios: before,
        newScenarios: after,
        oldTradePlan: oldTp
          ? {
              entryZone: String(oldTp.entryZone ?? "—"),
              stopLoss: String(oldTp.stopLoss ?? "—"),
              targetPrice: String(oldTp.targetPrice ?? "—"),
            }
          : undefined,
        newTradePlan: newTp
          ? {
              entryZone: String(newTp.entryZone ?? "—"),
              stopLoss: String(newTp.stopLoss ?? "—"),
              targetPrice: String(newTp.targetPrice ?? "—"),
            }
          : undefined,
        updateKind: typeof meta.update_kind === "string" ? meta.update_kind : row.change_type,
      },
    });
    if (out.length >= limit) break;
  }
  return out;
}

const TYPE_PRIORITY: Record<FeedItem["type"], number> = {
  thesis_remodel: 0,
  conviction_change: 1,
  reasoning: 2,
  headline: 3,
};

function sortKeyMs(iso: string): number {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function mergeAndSortFeedItems(parts: {
  remodel: FeedItem[];
  conviction: FeedItem[];
  reasoning: FeedItem[];
  headlines: FeedItem[];
}): FeedItem[] {
  const merged = [...parts.remodel, ...parts.conviction, ...parts.reasoning, ...parts.headlines];
  merged.sort((a, b) => {
    const byTime = sortKeyMs(b.timestamp) - sortKeyMs(a.timestamp);
    if (byTime !== 0) return byTime;
    return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  });
  return merged;
}

export async function buildFeedItems(supabase: SupabaseClient, loadPromoted: boolean): Promise<FeedItem[]> {
  const [remodel, conviction, reasoning, headlines] = await Promise.all([
    fetchThesisRemodelFeedItems(supabase, 24),
    fetchConvictionChangeItems(supabase, 80),
    fetchReasoningItems(supabase, loadPromoted),
    fetchNewsHeadlineItems(supabase, 48),
  ]);
  return mergeAndSortFeedItems({ remodel, conviction, reasoning, headlines });
}
