import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThesisDbSurfacingPreference } from "@/lib/theses/load-catalog-engine-theses";
import { partitionHomeBuckets } from "@/lib/theses/thesis-home-surfacing";
import { buildSurfacingPreferenceFromRow } from "@/lib/theses/load-catalog-engine-theses";
import { thesisListItemFromEngine } from "@/lib/theses/theses-list-response";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import type { ThesisListItem } from "@/types/thesis";

function isTerminalThesisRow(row: { lifecycle_state?: unknown; status?: unknown }): boolean {
  const ls = typeof row.lifecycle_state === "string" ? row.lifecycle_state.trim() : "";
  if (ls === "resolved" || ls === "invalidated" || ls === "archived") return true;
  const st = typeof row.status === "string" ? row.status.trim() : "";
  return st === "resolved" || st === "invalidated" || st === "archived";
}

const ARCHIVE_SELECT =
  "id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, insider_flow, lifecycle_state, surfaced_bucket, thesis_score, outcome_label";

export async function buildThesesArchiveListResponse(
  sb: SupabaseClient,
  userId: string,
): Promise<{ items: ThesisListItem[] }> {
  const { data: starRows } = await sb.from("thesis_stars").select("thesis_id").eq("user_id", userId).limit(5000);
  const starredIds = new Set(
    (starRows ?? []).map((r) => String((r as { thesis_id?: unknown }).thesis_id ?? "").trim()).filter(Boolean),
  );

  const { data: userRows } = await sb
    .from("theses")
    .select(ARCHIVE_SELECT)
    .eq("owner_user_id", userId)
    .eq("thesis_origin", "user")
    .order("updated_at", { ascending: false })
    .limit(400);

  const terminalRows = (userRows ?? []).filter((row) => isTerminalThesisRow(row as Record<string, unknown>));

  const surfacingByThesisId = new Map<string, ThesisDbSurfacingPreference>();
  for (const row of terminalRows) {
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id) surfacingByThesisId.set(id, buildSurfacingPreferenceFromRow(r));
  }

  const engines = terminalRows.map((row) =>
    userThesisFromSupabaseRow(row as Parameters<typeof userThesisFromSupabaseRow>[0]),
  );
  const partition = partitionHomeBuckets(engines);

  const items = engines.map((t) =>
    thesisListItemFromEngine(t, starredIds.has(t.id), null, partition, surfacingByThesisId.get(t.id)),
  );

  return { items };
}
