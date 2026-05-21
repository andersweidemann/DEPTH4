import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbScenarioTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { RemodelScenarios } from "@/lib/thesis/remodel-scenarios";

export const REMODEL_NOTIFICATION_KIND = "thesis_remodel";
export const NEW_THESIS_NOTIFICATION_KIND = "new_thesis";

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

/** Collect user ids subscribed to thesis alerts (stars, owner, book, optional catalog broadcast). */
async function collectThesisNotificationUserIds(
  admin: SupabaseClient,
  input: { thesisId: string; ownerUserId?: string | null; broadcastToAllUsers?: boolean },
): Promise<Set<string>> {
  const userIds = new Set<string>();

  const { data: stars } = await admin.from("thesis_stars").select("user_id").eq("thesis_id", input.thesisId);
  for (const row of stars ?? []) {
    const uid = String((row as { user_id?: unknown }).user_id ?? "").trim();
    if (uid) userIds.add(uid);
  }

  const owner = (input.ownerUserId ?? "").trim();
  if (owner) userIds.add(owner);

  const { data: books } = await admin.from("depth4_user_book").select("user_id, positions").limit(500);
  for (const row of books ?? []) {
    const uid = String((row as { user_id?: unknown }).user_id ?? "").trim();
    if (!uid) continue;
    const positions = (row as { positions?: unknown }).positions;
    if (!Array.isArray(positions)) continue;
    if (positions.some((p) => p && typeof p === "object" && (p as { linkedThesisId?: string }).linkedThesisId === input.thesisId)) {
      userIds.add(uid);
    }
  }

  if (input.broadcastToAllUsers) {
    const { data: allUsers } = await admin.from("users").select("id").limit(500);
    for (const row of allUsers ?? []) {
      const uid = String((row as { id?: unknown }).id ?? "").trim();
      if (uid) userIds.add(uid);
    }
  }

  return userIds;
}

/**
 * Fan out remodel bell notifications. Catalog theses broadcast to all signed-in users;
 * user theses notify stars, owner, and book holders.
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
    broadcastToAllUsers?: boolean;
  },
): Promise<number> {
  const userIds = await collectThesisNotificationUserIds(admin, {
    thesisId: input.thesisId,
    ownerUserId: input.ownerUserId,
    broadcastToAllUsers: input.broadcastToAllUsers ?? !input.ownerUserId,
  });
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

export type NewThesisNotificationMetadata = {
  thesis_slug: string;
  asset_symbol: string;
  edge_score: number | null;
};

/** Stable bell id for new thesis alerts. */
export function newThesisNotificationAlertKey(notificationId: string): string {
  return `new_thesis:${notificationId.trim()}`;
}

/**
 * Notify users when DEPTH4 creates a new catalog thesis (broadcast to all signed-in users).
 */
export async function insertNewThesisNotifications(
  admin: SupabaseClient,
  input: {
    thesisId: string;
    thesisTitle: string;
    thesisSlug: string;
    assetSymbol: string;
    edgeScore: number | null;
    broadcastToAllUsers?: boolean;
  },
): Promise<number> {
  const userIds = await collectThesisNotificationUserIds(admin, {
    thesisId: input.thesisId,
    broadcastToAllUsers: input.broadcastToAllUsers ?? true,
  });
  if (userIds.size === 0) return 0;

  const title = `New thesis: ${input.thesisTitle.trim() || "Macro thesis"}`;
  const body = `DEPTH4 mapped a new research thesis on ${input.assetSymbol.trim() || "macro assets"}.`;
  const metadata: NewThesisNotificationMetadata = {
    thesis_slug: input.thesisSlug,
    asset_symbol: input.assetSymbol,
    edge_score: input.edgeScore,
  };

  const rows = Array.from(userIds).map((user_id) => ({
    user_id,
    thesis_id: input.thesisId,
    kind: NEW_THESIS_NOTIFICATION_KIND,
    title,
    body,
    metadata,
    thesis_update_id: null,
  }));

  const { error } = await admin.from("depth4_notifications").insert(rows as never);
  if (error) {
    console.warn("[new-thesis-notifications] insert_failed", { message: error.message, count: rows.length });
    return 0;
  }
  return rows.length;
}
