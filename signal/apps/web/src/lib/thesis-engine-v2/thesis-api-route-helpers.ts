import type { SupabaseClient } from "@supabase/supabase-js";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type { Thesis as ApiThesis } from "@/types/thesis";
import { mapBundleToApiThesis } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import { loadThesisDetailBundleForApi } from "@/lib/thesis-engine-v2/load-thesis-api-bundle";
import { computeLivePlanForThesis, type ComputeLiveTradePlanResult } from "@/lib/thesis-engine-v2/thesis-api-live-plan";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";

export async function countEvidenceRowsForThesisId(
  supabase: SupabaseClient,
  thesisId: string,
): Promise<number> {
  const id = thesisId.trim();
  if (!id) return 0;
  const { count, error } = await supabase
    .from("thesis_evidence_log")
    .select("id", { count: "exact", head: true })
    .eq("thesis_id", id);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

export type LoadedThesisApiPayload = {
  bundle: ThesisDetailBundle;
  apiThesis: ApiThesis;
  live: ComputeLiveTradePlanResult | null;
};

export async function loadApiThesisPayload(
  supabase: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<LoadedThesisApiPayload | null> {
  const bundle = await loadThesisDetailBundleForApi(supabase, slug, userId);
  if (!bundle) return null;
  const evidenceCount = await countEvidenceRowsForThesisId(supabase, bundle.thesis.id);
  const live = await computeLivePlanForThesis(bundle.thesis);
  const apiThesis = mapBundleToApiThesis(bundle, live, { liveEvidenceCount: evidenceCount });
  return { bundle, apiThesis, live };
}

export async function requireThesisForSlug(
  supabase: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<{ bundle: ThesisDetailBundle; thesis: Thesis } | null> {
  const bundle = await loadThesisDetailBundleForApi(supabase, slug, userId);
  if (!bundle) return null;
  return { bundle, thesis: bundle.thesis };
}
