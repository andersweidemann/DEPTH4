import { authFetch } from "@/lib/api";
import { remodelNotificationAlertKey } from "@/lib/thesis/remodel-notifications";

export function parseRemodelNotificationIdFromAlertKey(alertKey: string): string | null {
  const prefix = "remodel:";
  const k = alertKey.trim();
  if (!k.startsWith(prefix)) return null;
  const id = k.slice(prefix.length).trim();
  return id || null;
}

export function parseNewThesisNotificationIdFromAlertKey(alertKey: string): string | null {
  const prefix = "new_thesis:";
  const k = alertKey.trim();
  if (!k.startsWith(prefix)) return null;
  const id = k.slice(prefix.length).trim();
  return id || null;
}

export function parseBellNotificationIdFromAlertKey(alertKey: string): string | null {
  return parseRemodelNotificationIdFromAlertKey(alertKey) ?? parseNewThesisNotificationIdFromAlertKey(alertKey);
}

export function isRemodelBellAlertKey(alertKey: string): boolean {
  return parseRemodelNotificationIdFromAlertKey(alertKey) != null;
}

export function isBellDbAlertKey(alertKey: string): boolean {
  return parseBellNotificationIdFromAlertKey(alertKey) != null;
}

/** Write-through: mark all unread DB bell rows read + delete rows older than 7 days. */
export async function persistBellNotificationsMarkAllRead(): Promise<void> {
  try {
    await authFetch("/api/user/bell-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
  } catch {
    // best-effort; in-memory alert state still updates
  }
}

export async function persistBellNotificationDismiss(notificationId: string): Promise<void> {
  const id = notificationId.trim();
  if (!id) return;
  try {
    await authFetch("/api/user/bell-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", notificationIds: [id] }),
    });
  } catch {
    // ignore
  }
}

export { remodelNotificationAlertKey };
