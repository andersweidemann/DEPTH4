import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_THESES, getThesisDetail, sortThesesForDashboard } from "@/lib/thesis-engine-v2/catalog-data";
import { currentThesisProbabilityFromThesis } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { mapStatus } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import type { Thesis as EngineThesis, ThesisStatus as EngineStatus } from "@/lib/thesis-engine-v2/types";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { inferAssetClassFromTicker } from "@/lib/thesis-helpers";
import type { ThesisDirection, ThesisListItem, ThesisListResponse, ThesisStatus } from "@/types/thesis";

function mapDirection(d: EngineThesis["direction"]): ThesisDirection {
  return d === "short" ? "short" : "long";
}

function mapListStatus(st: EngineStatus): ThesisStatus {
  return mapStatus(st);
}

function engineThesisToListItem(t: EngineThesis, starred: boolean, lastUpdatedIso: string | null): ThesisListItem {
  const mp = getThesisMispricing(t, {});
  const conviction = currentThesisProbabilityFromThesis(t);
  const lastUpdated =
    lastUpdatedIso && !Number.isNaN(Date.parse(lastUpdatedIso)) ? lastUpdatedIso : t.lastUpdated;

  return {
    slug: t.slug,
    title: t.title,
    statement: t.thesisStatement,
    asset: t.asset,
    direction: mapDirection(t.direction),
    status: mapListStatus(t.status),
    conviction: Math.round(conviction),
    mispricingScore: mp.score,
    whyNow: t.whyNow,
    lastUpdated,
    starred,
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
    .select("id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, insider_flow")
    .eq("owner_user_id", userId)
    .eq("thesis_origin", "user")
    .order("updated_at", { ascending: false })
    .limit(200);

  const userTheses: EngineThesis[] = (userRows ?? []).map((row) =>
    userThesisFromSupabaseRow(row as Parameters<typeof userThesisFromSupabaseRow>[0]),
  );

  const slugs = CATALOG_THESES.map((t) => t.slug);
  const { data: headerRows } = await sb
    .from("theses")
    .select("slug, updated_at")
    .in("slug", slugs)
    .eq("thesis_origin", "seeded_system");

  const updatedBySlug = new Map<string, string>();
  for (const r of headerRows ?? []) {
    const o = r as { slug?: string; updated_at?: string | null };
    if (typeof o.slug === "string" && o.updated_at) updatedBySlug.set(o.slug, o.updated_at);
  }

  const catalogEngine: EngineThesis[] = [];
  for (const t of CATALOG_THESES) {
    const detail = getThesisDetail(t.slug);
    if (!detail) continue;
    const iso = updatedBySlug.get(t.slug) ?? null;
    catalogEngine.push({ ...detail.thesis, lastUpdated: iso ? iso : detail.thesis.lastUpdated });
  }

  let combined = sortThesesForDashboard([...catalogEngine, ...userTheses]);

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
    combined = [...combined].sort((a, b) => currentThesisProbabilityFromThesis(b) - currentThesisProbabilityFromThesis(a));
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

  const toItem = (t: EngineThesis) =>
    engineThesisToListItem(t, starredIds.has(t.id), updatedBySlug.get(t.slug) ?? null);

  return {
    focus: focusEngine.slice(0, 12).map(toItem),
    monitor: monitorEngine.slice(0, 12).map(toItem),
  };
}
