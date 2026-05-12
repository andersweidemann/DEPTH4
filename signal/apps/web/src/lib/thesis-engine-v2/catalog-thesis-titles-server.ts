import type { SupabaseClient } from "@supabase/supabase-js";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { mergeDbBodyIntoThesis, normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";
import { dbScenarioTripleEqualsSeed } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

export type CatalogThesisTitleRow = {
  id: string;
  slug: string | null;
  title: string;
  micro_label?: string | null;
  body?: unknown | null;
  scenario_probabilities?: unknown | null;
};

const CATALOG_THESIS_IDS = Array.from(new Set<string>(Object.values(SYSTEM_THESIS_IDS)));

/** Load `title`, `micro_label`, and optional `body` for seeded catalog theses. */
export async function fetchCatalogThesisTitleRows(supabase: SupabaseClient): Promise<CatalogThesisTitleRow[]> {
  if (!CATALOG_THESIS_IDS.length) return [];

  const { data, error } = await supabase
    .from("theses")
    .select("id, slug, title, micro_label, body, scenario_probabilities")
    .in("id", CATALOG_THESIS_IDS);
  if (error || !data?.length) return [];

  return (data as CatalogThesisTitleRow[]).filter((r) => typeof r.id === "string" && typeof r.title === "string");
}

/**
 * Prefer Supabase `title` / `micro_label` / `body` when present; keep in-app baseline fallbacks otherwise.
 *
 * @param theses — shipped catalog baseline (`CATALOG_THESES` from `catalog-data.ts`).
 */
export function mergeCatalogThesesWithDbTitles(theses: Thesis[], rows: CatalogThesisTitleRow[]): Thesis[] {
  const byId = new Map<string, CatalogThesisTitleRow>();
  for (const r of rows) {
    const id = (r.id ?? "").trim();
    if (id) byId.set(id, r);
  }
  return theses.map((t) => {
    const row = byId.get(t.id);
    if (!row) return normalizeThesisNarrativeFields(t);
    const dbTitle = (row.title ?? "").trim();
    const dbMicro = (row.micro_label ?? "").trim();
    let next: Thesis = {
      ...t,
      ...(dbTitle ? { title: dbTitle } : {}),
      ...(dbMicro ? { microLabel: dbMicro } : {}),
    };
    next = mergeDbBodyIntoThesis(next, row.body ?? null);
    return next;
  });
}

/** `public.theses.scenario_probabilities` — base=messy, bull=clean, bear=broken. */
export type CatalogThesisScenarioProbabilities = { base: number; bull: number; bear: number };

export type CatalogThesisHeader = {
  title: string | null;
  microLabel: string | null;
  body: unknown | null;
  scenarioProbabilities: CatalogThesisScenarioProbabilities | null;
};

export function parseScenarioProbabilities(raw: unknown): CatalogThesisScenarioProbabilities | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const b = o.base;
  const bu = o.bull;
  const be = o.bear;
  if (typeof b === "number" && typeof bu === "number" && typeof be === "number") {
    return { base: Math.round(b), bull: Math.round(bu), bear: Math.round(be) };
  }
  return null;
}

/**
 * Scan evidence-shaped rows **newest first** (same contract as `thesis_evidence_log` ordered `created_at desc`).
 *
 * **Precedence:** the first row whose `probability_after` parses to a **non-seed** triple wins. Rows with
 * **NULL**, invalid JSON, or the **shared seed** `{base:40,bull:35,bear:25}` are skipped — a newer NULL row
 * never blocks an older evaluated triple.
 *
 * {@link fetchLatestNonSeedScenarioTripleFromEvidenceLog} also applies `.not("probability_after","is",null)` at
 * SQL for efficiency; this function is the canonical scan logic if that filter is ever relaxed.
 */
export function pickLatestNonSeedEvidenceTripleFromDescendingRows(
  rows: ReadonlyArray<{ probability_after?: unknown }>,
): CatalogThesisScenarioProbabilities | null {
  for (const row of rows) {
    const p = parseScenarioProbabilities(row.probability_after);
    if (p && !dbScenarioTripleEqualsSeed(p)) return p;
  }
  return null;
}

/**
 * Latest non-seed `probability_after` from `thesis_evidence_log` for SSR / first paint.
 * When `theses.scenario_probabilities` is still the shared seed, evidence is the real source of truth.
 */
export async function fetchLatestNonSeedScenarioTripleFromEvidenceLog(
  supabase: SupabaseClient,
  thesisId: string,
): Promise<CatalogThesisScenarioProbabilities | null> {
  const id = thesisId.trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("thesis_evidence_log")
    .select("probability_after")
    .eq("thesis_id", id)
    .not("probability_after", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error || !data?.length) return null;
  return pickLatestNonSeedEvidenceTripleFromDescendingRows(data as { probability_after?: unknown }[]);
}

/**
 * ## Catalog `scenario_probabilities` + evidence read order
 *
 * 1. **`public.theses.scenario_probabilities`** when present and **not** the shared seed `{base:40,bull:35,bear:25}`.
 * 2. Else **{@link fetchLatestNonSeedScenarioTripleFromEvidenceLog}** (newest non-null rows; first **non-seed** triple).
 * 3. Else shipped narrative defaults in the app (`catalogDefaultScenariosForThesis` / list baseline replay).
 */
export function mergeCatalogDbScenarioColumnWithEvidenceFallback(
  scenarioProbabilitiesColumn: unknown,
  evidenceTriple: CatalogThesisScenarioProbabilities | null,
): CatalogThesisScenarioProbabilities | null {
  let p = parseScenarioProbabilities(scenarioProbabilitiesColumn);
  if (!p || dbScenarioTripleEqualsSeed(p)) {
    if (evidenceTriple) p = evidenceTriple;
  }
  return p;
}

export async function resolveCatalogThesisScenarioProbabilities(
  supabase: SupabaseClient,
  thesisId: string,
  scenarioProbabilitiesColumn: unknown,
): Promise<CatalogThesisScenarioProbabilities | null> {
  const id = thesisId.trim();
  if (!id) return null;
  const parsed = parseScenarioProbabilities(scenarioProbabilitiesColumn);
  const evidence =
    !parsed || dbScenarioTripleEqualsSeed(parsed) ? await fetchLatestNonSeedScenarioTripleFromEvidenceLog(supabase, id) : null;
  return mergeCatalogDbScenarioColumnWithEvidenceFallback(scenarioProbabilitiesColumn, evidence);
}

export async function fetchCatalogThesisHeaderBySlug(supabase: SupabaseClient, slug: string): Promise<CatalogThesisHeader> {
  const s = slug.trim();
  if (!s) return { title: null, microLabel: null, body: null, scenarioProbabilities: null };

  const { data, error } = await supabase
    .from("theses")
    .select("id, title, micro_label, body, scenario_probabilities")
    .eq("slug", s)
    .maybeSingle();
  if (error || !data) return { title: null, microLabel: null, body: null, scenarioProbabilities: null };

  const row = data as {
    id?: unknown;
    title?: unknown;
    micro_label?: unknown;
    body?: unknown;
    scenario_probabilities?: unknown;
  };
  const thesisId = typeof row.id === "string" ? row.id.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const microLabel = typeof row.micro_label === "string" ? row.micro_label.trim() : "";
  const body = row.body !== undefined && row.body !== null ? row.body : null;
  const scenarioProbabilities = thesisId
    ? await resolveCatalogThesisScenarioProbabilities(supabase, thesisId, row.scenario_probabilities)
    : mergeCatalogDbScenarioColumnWithEvidenceFallback(row.scenario_probabilities, null);
  return {
    title: title || null,
    microLabel: microLabel || null,
    body,
    scenarioProbabilities,
  };
}

/** @deprecated Use fetchCatalogThesisHeaderBySlug */
export async function fetchCatalogThesisTitleBySlug(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const h = await fetchCatalogThesisHeaderBySlug(supabase, slug);
  return h.title;
}
