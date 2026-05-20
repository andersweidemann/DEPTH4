"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_THESES_PAGE_PREFERENCES,
  loadThesesPagePreferencesFromStorage,
  notificationPreferencesPatchForThesesUi,
  parseThesesPagePreferences,
  saveThesesPagePreferencesToStorage,
  thesesUiFromNotificationPreferences,
  type ThesesPagePreferences,
} from "@/lib/theses/theses-page-preferences";

export function useThesesPagePreferences() {
  const { isAuthenticated } = useAuth();
  const [prefs, setPrefs] = useState<ThesesPagePreferences>(DEFAULT_THESES_PAGE_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPrefs(loadThesesPagePreferencesFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { user?: { notification_preferences?: unknown } };
        const fromDb = thesesUiFromNotificationPreferences(j.user?.notification_preferences);
        if (fromDb) setPrefs(fromDb);
      } catch {
        // keep local
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, isAuthenticated]);

  const updatePrefs = useCallback(
    (patch: Partial<ThesesPagePreferences> | ((p: ThesesPagePreferences) => ThesesPagePreferences)) => {
      setPrefs((prev) => {
        const next =
          typeof patch === "function"
            ? patch(prev)
            : parseThesesPagePreferences({ ...prev, ...patch });
        saveThesesPagePreferencesToStorage(next);
        if (isAuthenticated) {
          void fetch("/api/user/preferences", {
            method: "PATCH",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              notification_preferences: notificationPreferencesPatchForThesesUi(next),
            }),
          }).catch(() => undefined);
        }
        return next;
      });
    },
    [isAuthenticated],
  );

  const resetPrefs = useCallback(() => {
    updatePrefs({ ...DEFAULT_THESES_PAGE_PREFERENCES });
  }, [updatePrefs]);

  return { prefs, updatePrefs, resetPrefs, hydrated };
}
