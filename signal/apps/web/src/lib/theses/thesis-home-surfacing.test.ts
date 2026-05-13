import { describe, expect, it } from "vitest";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import {
  deriveLifecycleState,
  HOME_EMERGING_CAP,
  HOME_TRADABLE_BUCKET_MAX,
  HOME_TRADABLE_CAP,
  partitionHomeBuckets,
} from "@/lib/theses/thesis-home-surfacing";

describe("thesis-home-surfacing (Phase 1)", () => {
  it("deriveLifecycleState: forming → discovered, ready → live, resolved → resolved", () => {
    expect(deriveLifecycleState("forming")).toBe("discovered");
    expect(deriveLifecycleState("watching")).toBe("live");
    expect(deriveLifecycleState("ready")).toBe("live");
    expect(deriveLifecycleState("active")).toBe("live");
    expect(deriveLifecycleState("resolved")).toBe("resolved");
    expect(deriveLifecycleState("invalidated")).toBe("invalidated");
  });

  it("HOME_TRADABLE_CAP alias matches tradable slot max", () => {
    expect(HOME_TRADABLE_CAP).toBe(HOME_TRADABLE_BUCKET_MAX);
  });

  it("partitionHomeBuckets places every non-terminal catalog thesis in exactly one live bucket", () => {
    const p = partitionHomeBuckets(CATALOG_THESES);
    expect(p.tradable.length).toBeLessThanOrEqual(HOME_TRADABLE_BUCKET_MAX);
    expect(p.emerging.length).toBeLessThanOrEqual(HOME_EMERGING_CAP);

    const live = CATALOG_THESES.filter((t) => t.status !== "resolved" && t.status !== "invalidated");
    const placed = new Set([...p.tradable, ...p.emerging, ...p.monitoring].map((t) => t.id));
    expect(placed.size).toBe(live.length);
    for (const t of live) {
      expect(placed.has(t.id)).toBe(true);
    }
  });

  it("ready/active rows that miss tradable floors or lose the slot race land in monitoring", () => {
    const live = CATALOG_THESES.filter((t) => t.status !== "resolved" && t.status !== "invalidated");
    const p = partitionHomeBuckets(CATALOG_THESES);
    const tradableIds = new Set(p.tradable.map((t) => t.id));
    const readyActive = live.filter((t) => t.status === "ready" || t.status === "active");
    for (const t of readyActive) {
      if (!tradableIds.has(t.id)) {
        expect(p.monitoring.some((x) => x.id === t.id)).toBe(true);
      }
    }
  });

  it("partitionHomeBuckets excludes ineligible rows from tradable/emerging/monitoring pools", () => {
    const catalog = CATALOG_THESES[0];
    if (!catalog) return;
    const ghost = { ...catalog, id: "ghost-ai-1", slug: "ghost-ai-1-slug", status: "forming" as const };
    const combined = [catalog, ghost];
    const p = partitionHomeBuckets(combined, {
      homeBucketEligible: (t) => t.id !== "ghost-ai-1",
    });
    const placed = new Set([...p.tradable, ...p.emerging, ...p.monitoring].map((t) => t.id));
    expect(placed.has("ghost-ai-1")).toBe(false);
  });
});
