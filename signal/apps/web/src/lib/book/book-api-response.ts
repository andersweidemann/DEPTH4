import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Position as ApiPosition,
  PositionStats,
  ResolvedThesis,
  WatchlistItem,
} from "@/types/position";
import type { Position as BookPosition } from "@/lib/thesis-engine-v2/types";
import { catalogSlugForSystemThesisId } from "@/lib/thesis-engine-v2/catalog-slugs";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { computeSessionBookStats } from "@/lib/thesis-engine-v2/book-session-stats";
import { fetchThesisMetaMap, type ThesisMeta } from "@/lib/feed/thesis-slugs";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import type { BookResolvedThesisRow } from "@/lib/thesis/thesis-outcome-service";

function pnlPercentFromPrices(p: BookPosition): number | undefined {
  if (p.tradeStatus !== "closed" && p.tradeStatus !== "stopped") return undefined;
  const entry = typeof p.entryPrice === "number" ? p.entryPrice : null;
  const exit = typeof p.exitPrice === "number" ? p.exitPrice : null;
  if (entry == null || exit == null || !(entry > 0)) return undefined;
  if (p.side === "long") return ((exit - entry) / entry) * 100;
  return ((entry - exit) / entry) * 100;
}

export function mapBookPosition(p: BookPosition, slug: string, title: string): ApiPosition {
  const apiStatus: ApiPosition["status"] =
    p.tradeStatus === "open"
      ? "open"
      : p.tradeStatus === "stopped"
        ? "stopped"
        : p.tradeStatus === "closed"
          ? "closed"
          : "open";

  let pnl: number | undefined;
  let pnlPercent: number | undefined;
  if (p.tradeStatus === "open") {
    if (typeof p.unrealizedPnlNumeric === "number" && !Number.isNaN(p.unrealizedPnlNumeric)) {
      pnl = p.unrealizedPnlNumeric;
    }
  } else if (p.tradeStatus === "closed" || p.tradeStatus === "stopped") {
    if (typeof p.realizedPnlNumeric === "number" && !Number.isNaN(p.realizedPnlNumeric)) {
      pnl = p.realizedPnlNumeric;
    }
    pnlPercent = pnlPercentFromPrices(p);
  }

  return {
    id: p.id,
    thesisSlug: slug || "unknown",
    thesisTitle: title || "Thesis",
    direction: p.side === "short" ? "short" : "long",
    status: apiStatus,
    entryPrice: typeof p.entryPrice === "number" && Number.isFinite(p.entryPrice) ? p.entryPrice : 0,
    exitPrice: typeof p.exitPrice === "number" ? p.exitPrice : undefined,
    pnl,
    pnlPercent,
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    session: "synced",
  };
}

function resolveSlugTitle(linkedThesisId: string, metaById: Map<string, ThesisMeta>): { slug: string; title: string } {
  const m = metaById.get(linkedThesisId);
  if (m) return { slug: m.slug, title: m.title };
  const slug = catalogSlugForSystemThesisId(linkedThesisId);
  if (slug) {
    const detail = getThesisDetail(slug);
    if (detail) return { slug, title: detail.thesis.title };
    return { slug, title: "Catalog thesis" };
  }
  return { slug: "", title: "Unknown thesis" };
}

function buildStats(positions: BookPosition[]): PositionStats {
  const s = computeSessionBookStats(positions);
  const wrMatch = /^(\d+)/.exec(s.winRateStr.trim());
  const winRate = wrMatch ? Number(wrMatch[1]) : 0;

  const closed = positions.filter((p) => p.tradeStatus === "closed" || p.tradeStatus === "stopped");
  const winpcts: number[] = [];
  const losspcts: number[] = [];
  for (const p of closed) {
    const pct = pnlPercentFromPrices(p);
    if (pct == null || !Number.isFinite(pct)) continue;
    if (pct > 0) winpcts.push(pct);
    if (pct < 0) losspcts.push(pct);
  }
  const avgWinPercent = winpcts.length ? winpcts.reduce((a, b) => a + b, 0) / winpcts.length : 0;
  const avgLossPercent = losspcts.length ? losspcts.reduce((a, b) => a + b, 0) / losspcts.length : 0;

  const totalPnL = s.totalRealized + (typeof s.totalUnrealized === "number" ? s.totalUnrealized : 0);

  return {
    totalOpen: s.openCount,
    totalClosed: s.closedTradeCount,
    totalPnL,
    winRate,
    avgWinPercent,
    avgLossPercent,
    avgHoldDuration: s.avgHoldStr,
  };
}

function assetFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "—";
  const o = body as Record<string, unknown>;
  const a = o.asset;
  return typeof a === "string" && a.trim() ? a.trim() : "—";
}

function directionFromBody(body: unknown): "long" | "short" {
  if (!body || typeof body !== "object") return "long";
  const d = (body as Record<string, unknown>).direction;
  return d === "short" ? "short" : "long";
}

function watchlistStatus(dbStatus: string): WatchlistItem["status"] {
  if (dbStatus === "ready") return "Ready";
  if (dbStatus === "active") return "Active";
  return "Watching";
}

function convictionFromScenarioProbabilities(raw: unknown): number {
  const p = parseScenarioProbabilities(raw);
  if (!p) return 0;
  return Math.min(100, Math.max(0, p.bull + p.base));
}

export async function buildBookApiPayload(
  supabase: SupabaseClient,
  userId: string,
  resolvedTheses: BookResolvedThesisRow[],
): Promise<{
  positions: ApiPosition[];
  stats: PositionStats;
  watchlist: WatchlistItem[];
  resolved: ResolvedThesis[];
}> {
  const { data, error } = await supabase
    .from("depth4_user_book")
    .select("positions")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { positions: [], stats: buildStats([]), watchlist: [], resolved: [] };
  }

  const raw = (data as { positions?: unknown } | null)?.positions;
  const arr = Array.isArray(raw) ? raw : [];
  const positionsRaw = arr.filter(isBookPosition);

  const thesisIds = Array.from(new Set(positionsRaw.map((p) => p.linkedThesisId).filter(Boolean)));
  const metaById = await fetchThesisMetaMap(supabase, thesisIds);

  const positions: ApiPosition[] = positionsRaw.map((p) => {
    const { slug, title } = resolveSlugTitle(p.linkedThesisId, metaById);
    return mapBookPosition(p, slug, title);
  });

  const stats = buildStats(positionsRaw);

  const { data: starRows } = await supabase.from("thesis_stars").select("thesis_id").eq("user_id", userId);

  const starredIds = (starRows ?? [])
    .map((r: { thesis_id?: unknown }) => (typeof r.thesis_id === "string" ? r.thesis_id : ""))
    .filter(Boolean);

  let watchlist: WatchlistItem[] = [];
  if (starredIds.length) {
    const { data: thesisRows } = await supabase
      .from("theses")
      .select("id, slug, title, status, updated_at, body, scenario_probabilities")
      .in("id", starredIds);

    watchlist =
      (thesisRows as {
        id: string;
        slug: string | null;
        title: string | null;
        status: string | null;
        updated_at: string | null;
        body: unknown;
        scenario_probabilities: unknown;
      }[])?.map((row) => {
        const slug = (row.slug ?? "").trim();
        const title = (row.title ?? "").trim() || "Thesis";
        const st = typeof row.status === "string" ? row.status : "watching";
        return {
          thesisSlug: slug || row.id,
          thesisTitle: title,
          asset: assetFromBody(row.body),
          direction: directionFromBody(row.body),
          status: watchlistStatus(st),
          conviction: convictionFromScenarioProbabilities(row.scenario_probabilities),
          lastUpdated:
            typeof row.updated_at === "string" && row.updated_at
              ? row.updated_at
              : new Date().toISOString(),
        };
      }) ?? [];
  }

  const resolved: ResolvedThesis[] = resolvedTheses.map((o) => ({
    thesisSlug: o.thesisSlug,
    thesisTitle: o.thesisTitle,
    outcome: o.outcome,
    resolvedAt: o.resolvedAt,
  }));

  return { positions, stats, watchlist, resolved };
}

function isBookPosition(x: unknown): x is BookPosition {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.symbol === "string" &&
    (p.side === "long" || p.side === "short") &&
    typeof p.linkedThesisId === "string" &&
    typeof p.openedAt === "string" &&
    typeof p.tradeStatus === "string"
  );
}
