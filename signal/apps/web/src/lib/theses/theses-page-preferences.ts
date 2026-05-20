export type ThesesViewMode = "card" | "compact" | "list" | "matrix";
export type ThesesSortMode = "edge" | "quality" | "updated" | "asset";

export type ThesesPagePreferences = {
  viewMode: ThesesViewMode;
  sort: ThesesSortMode;
  showWatching: boolean;
  showTradeable: boolean;
  showArchived: boolean;
  showAiGenerated: boolean;
  showUserCreated: boolean;
  autoHideDismissed: boolean;
  showActivityBanner: boolean;
  soundOnNewThesis: boolean;
};

export const DEFAULT_THESES_PAGE_PREFERENCES: ThesesPagePreferences = {
  viewMode: "card",
  sort: "edge",
  showWatching: true,
  showTradeable: true,
  showArchived: false,
  showAiGenerated: true,
  showUserCreated: true,
  autoHideDismissed: true,
  showActivityBanner: true,
  soundOnNewThesis: false,
};

const STORAGE_KEY = "depth4.theses-page-preferences.v1";
export const NP_KEY = "depth4ThesesUi";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function parseThesesPagePreferences(raw: unknown): ThesesPagePreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_THESES_PAGE_PREFERENCES };
  const o = raw;
  const viewMode = o.viewMode;
  const sort = o.sort;
  return {
    viewMode:
      viewMode === "compact" || viewMode === "list" || viewMode === "matrix" || viewMode === "card"
        ? viewMode
        : DEFAULT_THESES_PAGE_PREFERENCES.viewMode,
    sort:
      sort === "quality" || sort === "updated" || sort === "asset" || sort === "edge"
        ? sort
        : DEFAULT_THESES_PAGE_PREFERENCES.sort,
    showWatching: o.showWatching !== false,
    showTradeable: o.showTradeable !== false,
    showArchived: o.showArchived === true,
    showAiGenerated: o.showAiGenerated !== false,
    showUserCreated: o.showUserCreated !== false,
    autoHideDismissed: o.autoHideDismissed !== false,
    showActivityBanner: o.showActivityBanner !== false,
    soundOnNewThesis: o.soundOnNewThesis === true,
  };
}

export function loadThesesPagePreferencesFromStorage(): ThesesPagePreferences {
  if (typeof window === "undefined") return { ...DEFAULT_THESES_PAGE_PREFERENCES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THESES_PAGE_PREFERENCES };
    return parseThesesPagePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_THESES_PAGE_PREFERENCES };
  }
}

export function saveThesesPagePreferencesToStorage(prefs: ThesesPagePreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function thesesUiFromNotificationPreferences(np: unknown): ThesesPagePreferences | null {
  if (!isPlainObject(np)) return null;
  const block = np[NP_KEY];
  if (!block) return null;
  return parseThesesPagePreferences(block);
}

export function notificationPreferencesPatchForThesesUi(
  prefs: ThesesPagePreferences,
): Record<string, unknown> {
  return { [NP_KEY]: prefs };
}
