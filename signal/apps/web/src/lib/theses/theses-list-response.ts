import type { SupabaseClient } from "@supabase/supabase-js";
import { sortThesesForDashboard } from "@/lib/thesis-engine-v2/catalog-data";
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
  deriveLifecycleState,
  partitionHomeBuckets,
  surfacedBucketForEngineThesis,
  thesisScoreV0,
} from "@/lib/theses/thesis-home-surfacing";
import { passesDepth4ThesisSurfacingQualityBar } from "@/lib/theses/thesis-surfacing-quality";
import {
  buildSurfacingPreferenceFromRow,
  loadCatalogEngineTheses,
  type ThesisDbSurfacingPreference,
} from "@/lib/theses/load-catalog-engine-theses";

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

function engineThesisToListItem(t: EngineThesis, starred: boolean, lastUpdatedIso: string | null): ThesisListItem {
  const mp = getThesisMispricing(t, {});
  const dm = getThesisDisplayModel(t);
  const conviction = Math.round(dm.convictionPct);
  const lastUpdated =
    lastUpdatedIso && !Number.isNaN(Date.parse(lastUpdatedIso)) ? lastUpdatedIso : t.lastUpdated;

  return {
    thesisId: t.id,
    listBaselineScenarioTriple: listBaselineScenarioTripleFromEngineThesis(t),
    slug: t.slug,
    title: t.title,
    statement: t.thesisStatement,
    asset: t.asset,
    direction: mapDirection(t.direction),
    status: mapListStatus(t.status),
    conviction,
    convictionIsTemplateEstimate: dm.convictionIsTemplateEstimate,
    mispricingScore: mp.score,
    whyNow: t.whyNow,
    lastUpdated,
    starred,
  };
}

/** List row merge: prefers DB surfacing columns when present (Phase 4); AI rows that fail the thesis bar never get a home bucket. */
export function thesisListItemFromEngine(
  t: EngineThesis,
  starred: boolean,
  lastUpdatedIso: string | null,
  partition: ReturnType<typeof partitionHomeBuckets>,
  db?: ThesisDbSurfacingPreference,
  options?: { aiThesisIdSet?: Set<string> },
): ThesisListItem {
  const base = engineThesisToListItem(t, starred, lastUpdatedIso);
  let bucket =
    db?.surfaced_bucket !== undefined ? db.surfaced_bucket : surfacedBucketForEngineThesis(t, partition);
  if (options?.aiThesisIdSet?.has(t.id) && !passesDepth4ThesisSurfacingQualityBar(t)) {
    bucket = null;
  }
  const lifecycle_state = db?.lifecycle_state ?? deriveLifecycleState(t.status);
  const thesis_score = db?.thesis_score !== undefined ? db.thesis_score : Math.round(thesisScoreV0(t));
  const outcome_label = db?.outcome_label;
  return {
    ...base,
    lifecycle_state,
    surfaced_bucket: bucket,
    thesis_score,
    ...(outcome_label != null ? { outcome_label } : {}),
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

export async function buildThesesListResponse(
  sb: SupabaseClient,
  userId: string,
  query: {
    starred?: boolean;
    status?: string;
    assetClass?: string;
    sort?: string;
  },
): Promise<ThesisListResponse> {
  const { data: starRows } = await sb.from("thesis_stars").select("thesis_id").eq("user_id", userId).limit(5000);
  const starredIds = new Set(
    (starRows ?? []).map((r) => String((r as { thesis_id?: unknown }).thesis_id ?? "").trim()).filter(Boolean),
  );

  const { data: userRows } = await sb
    .from("theses")
    .select(
      "id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, insider_flow, lifecycle_state, surfaced_bucket, thesis_score, outcome_label",
    )
    .eq("owner_user_id", userId)
    .eq("thesis_origin", "user")
    .order("updated_at", { ascending: false })
    .limit(200);

  const userTheses: EngineThesis[] = (userRows ?? []).map((row) =>
    userThesisFromSupabaseRow(row as Parameters<typeof userThesisFromSupabaseRow>[0]),
  );

  const { data: aiRows } = await sb
    .from("theses")
    .select(
      "id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, insider_flow, lifecycle_state, surfaced_bucket, thesis_score, outcome_label",
    )
    .eq("thesis_origin", "ai_generated")
    .order("updated_at", { ascending: false })
    .limit(120);

  const aiTheses: EngineThesis[] = (aiRows ?? []).map((row) =>
    userThesisFromSupabaseRow(row as Parameters<typeof userThesisFromSupabaseRow>[0]),
  );

  const { catalogEngine, discardBulkWriterCollapse, dbSurfacingByThesisId } = await loadCatalogEngineTheses(sb);
  const surfacingByThesisId = new Map<string, ThesisDbSurfacingPreference>(dbSurfacingByThesisId);
  for (const row of userRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id) surfacingByThesisId.set(id, buildSurfacingPreferenceFromRow(r));
  }
  for (const row of aiRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id) surfacingByThesisId.set(id, buildSurfacingPreferenceFromRow(r));
  }
  if (discardBulkWriterCollapse && process.env.NODE_ENV === "development") {
    console.warn(
      "[DEPTH4] Discarding unanimous catalog scenario triple 80/15/5 across many theses — treat as corrupt DB/evidence stamp; fix writers in Supabase.",
      { catalogRowCount: catalogEngine.length },
    );
  }

  let combined = sortThesesForDashboard([...catalogEngine, ...aiTheses, ...userTheses]);

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

  const focusEngine = combined.filter((t) => t.status === "ready" || t.status === "active");
  const focusSlugSet = new Set(focusEngine.map((t) => t.slug));
  const monitorEngine = combined.filter((t) => !focusSlugSet.has(t.slug));

  const aiThesisIdSet = new Set(aiTheses.map((x) => x.id));
  const partition = partitionHomeBuckets(combined, {
    homeBucketEligible: (t) => !aiThesisIdSet.has(t.id) || passesDepth4ThesisSurfacingQualityBar(t),
  });

  const mapEngine = (t: EngineThesis) =>
    thesisListItemFromEngine(t, starredIds.has(t.id), null, partition, surfacingByThesisId.get(t.id), {
      aiThesisIdSet,
    });

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
