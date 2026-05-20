import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import {
  defaultScenarioOverridesFromThesis,
  isCatalogThesisId,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { mapStatus } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import type { Thesis as EngineThesis, ThesisStatus as EngineStatus } from "@/lib/thesis-engine-v2/types";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { inferAssetClassFromTicker } from "@/lib/thesis-helpers";
import type { ThesisDirection, ThesisListItem, ThesisListResponse, ThesisStatus } from "@/types/thesis";
import {
  partitionHomeBuckets,
  surfacedBucketForEngineThesis,
  thesisMapHomeRankScore,
} from "@/lib/theses/thesis-home-surfacing";
import { effectiveLifecycleState, isTerminalThesis } from "@/lib/theses/thesis-lifecycle";
import { THESIS_MAP_LIVE_STATUSES } from "@/lib/theses/thesis-surfacing-quality";
import { buildSurfacingPreferenceFromRow, type ThesisDbSurfacingPreference } from "@/lib/theses/load-catalog-engine-theses";
import { resolveAssetSymbol } from "@/lib/theses/resolve-asset-symbol";

function mapDirection(d: EngineThesis["direction"]): ThesisDirection {
  return d === "short" ? "short" : "long";
}

function mapListStatus(st: EngineStatus): ThesisStatus {
  return mapStatus(st);
}

/**
 * Always emit the triple the list API used to compute `conviction`, even when `t.scenarioOverrides` is absent
 * (catalog `detail.thesis` often has no overrides — conviction comes from `defaultScenarioOverridesFromThesis`).
 * Sending `null` here caused stale clients to replay without a triple and fall back to frozen `item.conviction`,
 * which could collapse visually when that field was wrong or shared.
 */
export function listBaselineScenarioTripleFromEngineThesis(t: EngineThesis): { base: number; bull: number; bear: number } {
  const o = t.scenarioOverrides ?? defaultScenarioOverridesFromThesis(t);
  return {
    base: o.base.probability,
    bull: o.bull.probability,
    bear: o.bear.probability,
  };
}

/** One-line context for list rows when `whyNow` is empty (keeps user/AI rows from looking “broken”). */
export function listRowWhyNowLine(t: EngineThesis): string {
  const w = (t.whyNow ?? "").trim();
  if (w) return w;
  const one = (t.oneLineSummary ?? "").trim();
  if (one) return one;
  const micro = typeof t.microLabel === "string" ? t.microLabel.trim() : "";
  if (micro) return micro;
  const stmt = (t.thesisStatement ?? "").trim();
  const title = (t.title ?? "").trim();
  if (stmt && stmt !== title) return stmt.length > 220 ? `${stmt.slice(0, 217)}…` : stmt;
  if (stmt) return stmt;
  return "";
}

const DB_THESIS_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Slugs that `loadThesisDetailBundleForApi` can resolve — built once per list response. */
export function buildDetailResolvableSlugSet(aiTheses: EngineThesis[], userTheses: EngineThesis[]): Set<string> {
  const slugs = new Set<string>();
  for (const t of CATALOG_THESES) {
    const slug = t.slug.trim();
    if (slug) slugs.add(slug);
  }
  for (const t of aiTheses) {
    const slug = t.slug.trim();
    if (slug) slugs.add(slug);
  }
  for (const t of userTheses) {
    const slug = t.slug.trim();
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/**
 * List clickability guard: slug must be in the conservative set and the row must be catalog-backed
 * or a DB-backed `ai_generated` / `user` thesis.
 *
 * User rows may use client ids (`user-…`) from CreateThesisModal; only `ai_generated` requires a UUID
 * so ghost emerging slugs without a real DB row stay non-clickable.
 */
export function computeDetailResolvableForListRow(t: EngineThesis, resolvableSlugSet: Set<string>): boolean {
  const slug = t.slug.trim();
  if (!slug || !resolvableSlugSet.has(slug)) return false;
  if (isCatalogThesisId(t.id)) return true;
  const id = t.id.trim();
  if (!id) return false;
  if (t.thesisOrigin === "user") return true;
  if (t.thesisOrigin === "ai_generated" && DB_THESIS_ID_RE.test(id)) return true;
  return false;
}

function engineThesisToListItem(
  t: EngineThesis,
  starred: boolean,
  lastUpdatedIso: string | null,
  resolvableSlugSet: Set<string>,
  dbRow?: { title?: string; body?: unknown },
): ThesisListItem {
  const mp = getThesisMispricing(t, {});
  const dm = getThesisDisplayModel(t);
  const conviction = Math.round(dm.convictionPct);
  const lastUpdated =
    lastUpdatedIso && !Number.isNaN(Date.parse(lastUpdatedIso)) ? lastUpdatedIso : t.lastUpdated;

  const user_calibration_phase =
    t.thesisOrigin === "user"
      ? (t.userCalibration?.phase ??
        (t.status === "ready" || t.status === "active" ? "tradeable" : "assessing"))
      : undefined;

  return {
    thesisId: t.id,
    listBaselineScenarioTriple: listBaselineScenarioTripleFromEngineThesis(t),
    slug: t.slug,
    title: t.title,
    statement: t.thesisStatement,
    asset: resolveAssetSymbol({
      assetLabel: t.asset,
      title: dbRow?.title ?? t.title,
      body: dbRow?.body,
    }),
    direction: mapDirection(t.direction),
    status: mapListStatus(t.status),
    conviction,
    convictionIsTemplateEstimate: dm.convictionIsTemplateEstimate,
    mispricingScore: mp.score,
    whyNow: listRowWhyNowLine(t),
    lastUpdated,
    starred,
    detailResolvable: computeDetailResolvableForListRow(t, resolvableSlugSet),
    ...(user_calibration_phase ? { user_calibration_phase } : {}),
  };
}

/** List row merge: prefers DB surfacing columns when present (Phase 4). */
export function thesisListItemFromEngine(
  t: EngineThesis,
  starred: boolean,
  lastUpdatedIso: string | null,
  partition: ReturnType<typeof partitionHomeBuckets>,
  resolvableSlugSet: Set<string>,
  db?: ThesisDbSurfacingPreference & { title?: string; body?: unknown },
): ThesisListItem {
  const base = engineThesisToListItem(t, starred, lastUpdatedIso, resolvableSlugSet, db);
  const lifecycle_state = effectiveLifecycleState({
    lifecycle_state: db?.lifecycle_state,
    status: t.status,
  });
  const bucket =
    db?.surfaced_bucket !== undefined
      ? db.surfaced_bucket
      : surfacedBucketForEngineThesis(t, partition, lifecycle_state);
  const thesis_score =
    db?.thesis_score !== undefined ? db.thesis_score : Math.round(thesisMapHomeRankScore(t));
  const outcome_label = db?.outcome_label;
  const outcome = db?.outcome;
  const detailResolvable = computeDetailResolvableForListRow(t, resolvableSlugSet);

  return {
    ...base,
    lifecycle_state,
    surfaced_bucket: bucket,
    thesis_score,
    ...(outcome_label != null ? { outcome_label } : {}),
    ...(outcome != null ? { outcome } : {}),
    detailResolvable,
  };
}

function parseUpdatedMs(v: string): number {
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return 0;
}

function assetClassFilterOk(asset: string, filter: string): boolean {
  if (filter === "All") return true;
  const cls = inferAssetClassFromTicker(asset);
  return cls === filter;
}

const THESIS_LIST_ROW_SELECT =
  "id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, insider_flow, lifecycle_state, surfaced_bucket, thesis_score, outcome_label, outcome, thesis_origin, quality_score";

export async function buildThesesListResponse(
  sb: SupabaseClient,
  userId: string | null,
  query: {
    starred?: boolean;
    status?: string;
    assetClass?: string;
    sort?: string;
  },
): Promise<ThesisListResponse> {
  const starredIds = new Set<string>();
  if (userId) {
    const { data: starRows } = await sb.from("thesis_stars").select("thesis_id").eq("user_id", userId).limit(5000);
    for (const r of starRows ?? []) {
      const id = String((r as { thesis_id?: unknown }).thesis_id ?? "").trim();
      if (id) starredIds.add(id);
    }
  }

  const { data: rows, error } = await sb
    .from("theses")
    .select(THESIS_LIST_ROW_SELECT)
    .in("status", ["ready", "watching", "active"])
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    console.warn("[buildThesesListResponse] theses_select_failed", error.message);
  }

  const dbRows = rows ?? [];
  let combined: EngineThesis[] = dbRows.map((row) =>
    userThesisFromSupabaseRow(row as Parameters<typeof userThesisFromSupabaseRow>[0]),
  );

  const surfacingByThesisId = new Map<string, ThesisDbSurfacingPreference>();
  const listRowMetaByThesisId = new Map<string, { title?: string; body?: unknown }>();
  for (const row of dbRows) {
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (!id) continue;
    surfacingByThesisId.set(id, buildSurfacingPreferenceFromRow(r));
    listRowMetaByThesisId.set(id, {
      title: typeof r.title === "string" ? r.title : undefined,
      body: r.body,
    });
  }

  if (query.starred) {
    combined = combined.filter((t) => starredIds.has(t.id));
  }
  if (query.status === "Ready") {
    combined = combined.filter((t) => t.status === "ready");
  }
  const ac = query.assetClass?.trim() || "All";
  if (ac !== "All") {
    combined = combined.filter((t) => assetClassFilterOk(t.asset, ac));
  }

  const sort = query.sort?.trim() || "recent";
  if (sort === "conviction") {
    combined = [...combined].sort(
      (a, b) => getThesisDisplayModel(b).convictionPct - getThesisDisplayModel(a).convictionPct,
    );
  } else if (sort === "mispricing") {
    combined = [...combined].sort(
      (a, b) => getThesisMispricing(b, {}).score - getThesisMispricing(a, {}).score,
    );
  } else {
    combined = [...combined].sort((a, b) => parseUpdatedMs(b.lastUpdated) - parseUpdatedMs(a.lastUpdated));
  }

  const lifecycleInputFor = (t: EngineThesis) => ({
    lifecycle_state: surfacingByThesisId.get(t.id)?.lifecycle_state,
    status: t.status,
  });

  /** DB `lifecycle_state` can be stale; live `status` wins for the map list. */
  const combinedLive = combined.filter(
    (t) => THESIS_MAP_LIVE_STATUSES.has(t.status) || !isTerminalThesis(lifecycleInputFor(t)),
  );

  const focusEngine = combinedLive.filter((t) => t.status === "ready" || t.status === "active");
  const focusSlugSet = new Set(focusEngine.map((t) => t.slug));
  const monitorEngine = combinedLive.filter((t) => !focusSlugSet.has(t.slug));

  const partition = partitionHomeBuckets(combinedLive, {
    effectiveLifecycleFor: (t) => effectiveLifecycleState(lifecycleInputFor(t)),
  });

  const resolvableSlugSet = buildDetailResolvableSlugSet(
    combined.filter((t) => t.thesisOrigin === "ai_generated"),
    combined.filter((t) => t.thesisOrigin === "user"),
  );

  const mapEngine = (t: EngineThesis) =>
    thesisListItemFromEngine(
      t,
      starredIds.has(t.id),
      null,
      partition,
      resolvableSlugSet,
      { ...surfacingByThesisId.get(t.id), ...listRowMetaByThesisId.get(t.id) },
    );

  const userTheses = combined.filter((t) => t.thesisOrigin === "user");
  if (process.env.NODE_ENV === "development" && userTheses.length >= 3) {
    const signatures = userTheses.map((t) => {
      const c = Math.round(getThesisDisplayModel(t).convictionPct);
      const o = t.scenarioOverrides;
      const triple = o ? `${o.bull.probability}/${o.base.probability}/${o.bear.probability}` : "no-overrides";
      return `${c}|${triple}`;
    });
    if (new Set(signatures).size === 1) {
      console.warn(
        "[DEPTH4 dev] All loaded user theses share the same conviction + scenario triple — check DB merge / API wiring:",
        signatures[0],
        { count: userTheses.length },
      );
    }
  }

  if (process.env.NODE_ENV === "development") {
    const catalogRows = combined.filter((t) => isCatalogThesisId(t.id));
    if (catalogRows.length >= 4) {
      const sigs = catalogRows.map((t) => {
        const tr = listBaselineScenarioTripleFromEngineThesis(t);
        const c = Math.round(getThesisDisplayModel(t).convictionPct);
        return `${tr.base}/${tr.bull}/${tr.bear}|${c}`;
      });
      if (new Set(sigs).size === 1) {
        const s = sigs[0] ?? "";
        const [tri, convStr] = s.split("|");
        const conv = Number(convStr);
        // Benign: shipped catalog narrative defaults are mostly clean 40 / messy 35 / broken 25 → DB 35/40/25 → 75%.
        const benignShippedCatalogBaseline = tri === "35/40/25" && conv === 75;
        // Bad: observed production collapse — messy-heavy 80 / clean 15 / broken 5 → 95% headline conviction.
        const looksLikeWriterCollapse = tri === "80/15/5" && conv === 95;
        if (looksLikeWriterCollapse || (!benignShippedCatalogBaseline && catalogRows.length >= 4)) {
          console.warn(
            "[DEPTH4 dev] buildThesesListResponse: every catalog thesis shares one scenario triple + conviction — if this is not 35/40/25|75, check Supabase `theses.scenario_probabilities` / evidence `probability_after`.",
            { signature: s, catalogRowCount: catalogRows.length },
          );
        }
      }
    }
  }

  return {
    focus: focusEngine.map(mapEngine),
    monitor: monitorEngine.map(mapEngine),
    home: {
      tradable: partition.tradable.map(mapEngine),
      emerging: partition.emerging.map(mapEngine),
      monitoring: partition.monitoring.map(mapEngine),
      archivePreview: partition.archivePreview.map(mapEngine),
    },
  };
}
