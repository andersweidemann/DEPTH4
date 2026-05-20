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
    .filter((x): x is FeedItem => x !== null)
    .filter((item) => Boolean(item.linkedThesisSlug?.trim()));
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
    .in("change_type", ["thesis_remodel", "scenario_shift", "evidence", "field_update"])
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
    const isRemodel =
      row.change_type === "thesis_remodel" || meta.source === "remodel_thesis_scenarios";
    if (!isRemodel) continue;

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

function assetDirectionFromBody(body: unknown): { asset: string | null; direction: "long" | "short" | null } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { asset: null, direction: null };
  const o = body as Record<string, unknown>;
  const asset = typeof o.asset === "string" && o.asset.trim() ? o.asset.trim() : null;
  const d = o.direction === "short" ? "short" : o.direction === "long" ? "long" : null;
  return { asset, direction: d };
}

function statusChangeLabel(toStatus: string): string {
  const s = toStatus.trim().toLowerCase();
  if (s === "resolved") return "Thesis resolved";
  if (s === "invalidated") return "Thesis invalidated";
  if (s === "active") return "Thesis active";
  if (s === "ready") return "Thesis ready";
  if (s === "watching") return "Thesis watching";
  return "Status change";
}

async function fetchThesisCreatedFeedItems(supabase: SupabaseClient, limit: number): Promise<FeedItem[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("theses")
    .select("id, slug, title, micro_label, body, thesis_origin, created_at")
    .eq("thesis_origin", "ai_generated")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  const out: FeedItem[] = [];
  for (const row of data as {
    id?: unknown;
    slug?: unknown;
    title?: unknown;
    micro_label?: unknown;
    body?: unknown;
    thesis_origin?: unknown;
    created_at?: unknown;
  }[]) {
    const id = String(row.id ?? "").trim();
    const slug = String(row.slug ?? "").trim();
    const title = String(row.title ?? "").trim();
    if (!id || !slug || !title) continue;
    const meta = thesisMetaToFeedThesisFields({
      slug,
      title,
      microLabel: typeof row.micro_label === "string" ? row.micro_label : null,
      asset: assetDirectionFromBody(row.body).asset,
      direction: assetDirectionFromBody(row.body).direction,
    });
    const sourceLine =
      typeof row.micro_label === "string" && row.micro_label.trim()
        ? `AI-generated · ${row.micro_label.trim()}`
        : "AI-generated from analyzed macro news";
    out.push({
      id: `created-${id}`,
      type: "thesis_created",
      source: "DEPTH4",
      headline: title,
      timestamp: formatFeedTimestamp(typeof row.created_at === "string" ? row.created_at : null),
      signalLevel: 2,
      ...meta,
      oldConviction: null,
      newConviction: null,
      changeDirection: null,
      summary: sourceLine,
      body: sourceLine,
      linkedThesisSlug: slug,
      linkedThesisTitle: title,
      createdMeta: {
        origin: String(row.thesis_origin ?? "ai_generated"),
        sourceLine,
      },
    });
  }
  return out;
}

async function fetchStatusChangeFeedItems(supabase: SupabaseClient, limit: number): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("thesis_updates")
    .select("id, thesis_id, created_at, change_type, reason, old_values, new_values")
    .eq("change_type", "status_transition")
    .order("created_at", { ascending: false })
    .limit(limit * 2);

  if (error || !data?.length) return [];

  const rows = data as {
    id: string;
    thesis_id: string;
    created_at: string;
    reason: string | null;
    old_values: unknown;
    new_values: unknown;
  }[];

  const thesisIds = Array.from(new Set(rows.map((r) => String(r.thesis_id ?? "").trim()).filter(Boolean)));
  const metaById = await fetchThesisMetaMap(supabase, thesisIds);
  const out: FeedItem[] = [];

  for (const row of rows) {
    const oldV = row.old_values && typeof row.old_values === "object" ? (row.old_values as Record<string, unknown>) : {};
    const newV = row.new_values && typeof row.new_values === "object" ? (row.new_values as Record<string, unknown>) : {};
    const fromStatus = String(oldV.status ?? "").trim();
    const toStatus = String(newV.status ?? "").trim();
    if (!toStatus) continue;

    const label = statusChangeLabel(toStatus);
    const reason = (row.reason ?? "").trim();
    const summary =
      reason ||
      (fromStatus
        ? `${label}: ${fromStatus} → ${toStatus}`
        : `${label} — ${toStatus}`);

    const t = thesisMetaToFeedThesisFields(metaById.get(String(row.thesis_id).trim()));
    if (!t.linkedThesisSlug) continue;

    out.push({
      id: `status-${row.id}`,
      type: "status_change",
      source: "DEPTH4",
      headline: t.thesisTitle ? `${t.thesisTitle}: ${summary}` : summary,
      timestamp: formatFeedTimestamp(row.created_at),
      signalLevel: toStatus === "resolved" || toStatus === "invalidated" ? 3 : 2,
      ...t,
      oldConviction: null,
      newConviction: null,
      changeDirection: null,
      summary,
      body: summary,
      linkedThesisSlug: t.linkedThesisSlug,
      linkedThesisTitle: t.linkedThesisTitle,
      statusMeta: { fromStatus, toStatus, label },
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchKeyEvidenceFeedItems(supabase: SupabaseClient, limit: number): Promise<FeedItem[]> {
  const { data, error } = await supabase
    .from("thesis_evidence_log")
    .select("id, thesis_id, created_at, event_type, description, metadata")
    .order("created_at", { ascending: false })
    .limit(limit * 4);

  if (error || !data?.length) return [];
  return buildKeyEvidenceFromRows(
    data as {
      id: string;
      thesis_id: string;
      created_at: string;
      event_type: string;
      description: string | null;
      metadata: unknown;
    }[],
    supabase,
    limit,
  );
}

async function buildKeyEvidenceFromRows(
  data: {
    id: string;
    thesis_id: string;
    created_at: string;
    event_type: string;
    description: string | null;
    metadata: unknown;
  }[],
  supabase: SupabaseClient,
  limit: number,
): Promise<FeedItem[]> {
  const thesisIds = Array.from(new Set(data.map((r) => String(r.thesis_id ?? "").trim()).filter(Boolean)));
  const metaById = await fetchThesisMetaMap(supabase, thesisIds);
  const out: FeedItem[] = [];

  for (const row of data) {
    const metaObj = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
    const signalLevel = typeof metaObj.signal_level === "number" ? metaObj.signal_level : 0;
    if (signalLevel < 4) continue;

    const desc = (row.description ?? "").trim();
    if (!desc) continue;

    const t = thesisMetaToFeedThesisFields(metaById.get(String(row.thesis_id).trim()));
    if (!t.linkedThesisSlug) continue;

    out.push({
      id: `evidence-${row.id}`,
      type: "key_evidence",
      source: "DEPTH4",
      headline: headlineFromDescription(desc),
      timestamp: formatFeedTimestamp(row.created_at),
      signalLevel,
      ...t,
      oldConviction: null,
      newConviction: null,
      changeDirection: null,
      summary: desc,
      body: desc,
      linkedThesisSlug: t.linkedThesisSlug,
      linkedThesisTitle: t.linkedThesisTitle,
    });
    if (out.length >= limit) break;
  }
  return out;
}

const TYPE_PRIORITY: Record<FeedItem["type"], number> = {
  thesis_remodel: 0,
  thesis_created: 1,
  status_change: 2,
  conviction_change: 3,
  key_evidence: 4,
  reasoning: 5,
  headline: 6,
};

/** Feed is AI activity only — no raw headlines or unmapped discovery noise. */
export function filterAiActivityFeedItems(items: FeedItem[]): FeedItem[] {
  return items.filter((item) => {
    if (item.type === "headline") return false;
    if (item.type === "reasoning" && !item.linkedThesisSlug?.trim()) return false;
    if (!item.linkedThesisSlug?.trim()) return false;
    return true;
  });
}

function sortKeyMs(iso: string): number {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

export function mergeAndSortFeedItems(parts: {
  remodel: FeedItem[];
  created: FeedItem[];
  status: FeedItem[];
  conviction: FeedItem[];
  evidence: FeedItem[];
  reasoning: FeedItem[];
}): FeedItem[] {
  const merged = [
    ...parts.remodel,
    ...parts.created,
    ...parts.status,
    ...parts.conviction,
    ...parts.evidence,
    ...parts.reasoning,
  ];
  merged.sort((a, b) => {
    const byTime = sortKeyMs(b.timestamp) - sortKeyMs(a.timestamp);
    if (byTime !== 0) return byTime;
    return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  });
  return merged;
}

export async function buildFeedItems(supabase: SupabaseClient, loadPromoted: boolean): Promise<FeedItem[]> {
  const [remodel, created, status, conviction, evidence, reasoning] = await Promise.all([
    fetchThesisRemodelFeedItems(supabase, 24),
    fetchThesisCreatedFeedItems(supabase, 16),
    fetchStatusChangeFeedItems(supabase, 16),
    fetchConvictionChangeItems(supabase, 40),
    fetchKeyEvidenceFeedItems(supabase, 12),
    fetchReasoningItems(supabase, loadPromoted),
  ]);
  return filterAiActivityFeedItems(
    mergeAndSortFeedItems({ remodel, created, status, conviction, evidence, reasoning }),
  );
}
