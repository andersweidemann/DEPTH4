const STORAGE_KEY = "depth4.dismissedUpdateBanner";

export function readDismissedUpdateBannerAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export function dismissUpdateBannerNow(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

/** Hide banner until a thesis update lands after the user dismissed. */
export function shouldShowDailyUpdatesBanner(latestUpdateIso: string | null): boolean {
  if (!latestUpdateIso) return false;
  const dismissedAt = readDismissedUpdateBannerAt();
  if (!dismissedAt) return true;
  return Date.parse(latestUpdateIso) > Date.parse(dismissedAt);
}
