/** ISO timestamp from `body.tradePlan.lastRemodeledAt` after cascade re-model. */
export function lastRemodeledAtFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const tp = o.tradePlan ?? o.trade_plan;
  if (!tp || typeof tp !== "object" || Array.isArray(tp)) return null;
  const row = tp as Record<string, unknown>;
  const at = row.lastRemodeledAt ?? row.last_remodeled_at;
  return typeof at === "string" && at.trim() ? at.trim() : null;
}

const REMODEL_CHIP_MS = 24 * 86_400_000;

export function isRecentlyRemodeled(iso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!iso?.trim()) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= 0 && nowMs - t < REMODEL_CHIP_MS;
}
