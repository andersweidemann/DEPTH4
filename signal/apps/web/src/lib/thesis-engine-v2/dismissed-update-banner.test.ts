import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  readDismissedUpdateBannerAt,
  shouldShowDailyUpdatesBanner,
} from "@/lib/thesis-engine-v2/dismissed-update-banner";

describe("dismissed-update-banner", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
      removeItem(k: string) {
        delete this.store[k];
      },
    });
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows banner until dismissed, then hides until a newer update", () => {
    const updateAt = "2026-05-19T12:00:00.000Z";
    expect(shouldShowDailyUpdatesBanner(updateAt)).toBe(true);
    localStorage.setItem("depth4.dismissedUpdateBanner", "2026-05-19T12:30:00.000Z");
    expect(shouldShowDailyUpdatesBanner(updateAt)).toBe(false);
    expect(shouldShowDailyUpdatesBanner("2026-05-19T11:00:00.000Z")).toBe(false);
    expect(shouldShowDailyUpdatesBanner("2026-05-19T13:00:00.000Z")).toBe(true);
    expect(readDismissedUpdateBannerAt()).toBeTruthy();
  });
});
