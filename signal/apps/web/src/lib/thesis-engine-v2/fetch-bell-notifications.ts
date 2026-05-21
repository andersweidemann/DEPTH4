import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildThesisAlertFromRemodelNotification,
  type Depth4NotificationRow,
} from "@/lib/thesis-engine-v2/thesis-alert-from-remodel-notification";
import type { ThesisAlertEntry } from "@/lib/thesis-engine-v2/thesis-live-context";

const BELL_NOTIFICATION_LIMIT = 20;

export async function fetchBellNotificationsForUser(
  sb: SupabaseClient,
  userId: string,
): Promise<ThesisAlertEntry[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await sb
    .from("depth4_notifications")
    .select("id, created_at, thesis_id, kind, title, body, metadata, read_at, dismissed_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .is("read_at", null)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(BELL_NOTIFICATION_LIMIT);

  if (error || !data?.length) return [];

  const out: ThesisAlertEntry[] = [];
  for (const raw of data) {
    const row = raw as Depth4NotificationRow;
    const pending = buildThesisAlertFromRemodelNotification(row);
    out.push({
      ...pending,
      read: Boolean(row.read_at),
      createdAt: Date.parse(row.created_at) || Date.now(),
    });
  }
  return out;
}

/** Bell remodel rows first, then other alerts; dedupe by stable alert id; preserve read flags. */
export function mergeBellNotificationsIntoAlerts(
  current: ThesisAlertEntry[],
  bell: ThesisAlertEntry[],
  limit = BELL_NOTIFICATION_LIMIT,
): ThesisAlertEntry[] {
  const byId = new Map<string, ThesisAlertEntry>();
  for (const e of current) byId.set(e.id, e);
  for (const b of bell) {
    const prev = byId.get(b.id);
    if (!prev) {
      byId.set(b.id, b);
      continue;
    }
    byId.set(b.id, {
      ...b,
      read: prev.read || b.read,
      createdAt: Math.max(prev.createdAt, b.createdAt),
    });
  }
  return Array.from(byId.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
