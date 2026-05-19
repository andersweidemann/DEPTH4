import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { RemodelScenarios } from "@/lib/thesis/remodel-scenarios";

export const REMODEL_NOTIFICATION_KIND = "thesis_remodel";

export type RemodelNotificationMetadata = {
  probability_diffs: {
    clean: { before: number; after: number };
    messy: { before: number; after: number };
    broken: { before: number; after: number };
  };
  scenario_probabilities_before: DbScenarioTriple;
  scenario_probabilities_after: DbScenarioTriple;
  thesis_slug: string | null;
  update_kind: string;
};

export function buildRemodelNotificationMetadata(input: {
  oldTriple: DbScenarioTriple;
  newTriple: DbScenarioTriple;
  oldScenarios: RemodelScenarios;
  newScenarios: RemodelScenarios;
  thesisSlug: string | null;
  updateKind: string;
}): RemodelNotificationMetadata {
  return {
    probability_diffs: {
      clean: { before: input.oldScenarios.clean, after: input.newScenarios.clean },
      messy: { before: input.oldScenarios.messy, after: input.newScenarios.messy },
      broken: { before: input.oldScenarios.broken, after: input.newScenarios.broken },
    },
    scenario_probabilities_before: input.oldTriple,
    scenario_probabilities_after: input.newTriple,
    thesis_slug: input.thesisSlug,
    update_kind: input.updateKind,
  };
}

/** Stable bell id — pairs with `depth4_user_alert_state.alert_key`. */
export function remodelNotificationAlertKey(notificationId: string): string {
  return `remodel:${notificationId.trim()}`;
}

/**
 * Fan out remodel bell notifications to users who starred the thesis (and owner if user thesis).
 */
export async function insertRemodelNotifications(
  admin: SupabaseClient,
  input: {
    thesisId: string;
    thesisTitle: string;
    thesisUpdateId: string;
    whatChanged: string;
    metadata: RemodelNotificationMetadata;
    ownerUserId?: string | null;
  },
): Promise<number> {
  const { data: stars, error: starErr } = await admin
    .from("thesis_stars")
    .select("user_id")
    .eq("thesis_id", input.thesisId);
  if (starErr) {
    console.warn("[remodel-notifications] thesis_stars_fetch_failed", { message: starErr.message });
    return 0;
  }

  const userIds = new Set<string>();
  for (const row of stars ?? []) {
    const uid = String((row as { user_id?: unknown }).user_id ?? "").trim();
    if (uid) userIds.add(uid);
  }
  const owner = (input.ownerUserId ?? "").trim();
  if (owner) userIds.add(owner);
  if (userIds.size === 0) return 0;

  const title = input.thesisTitle.trim() || "Thesis";
  const body = input.whatChanged.trim() || "Scenarios and trade plan were updated.";
  const rows = Array.from(userIds).map((user_id) => ({
    user_id,
    thesis_id: input.thesisId,
    kind: REMODEL_NOTIFICATION_KIND,
    title,
    body,
    metadata: input.metadata,
    thesis_update_id: input.thesisUpdateId,
  }));

  const { error } = await admin.from("depth4_notifications").insert(rows as never);
  if (error) {
    console.warn("[remodel-notifications] insert_failed", { message: error.message, count: rows.length });
    return 0;
  }
  return rows.length;
}
