import { describe, expect, it } from "vitest";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import {
  deriveLifecycleState,
  HOME_EMERGING_CAP,
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

  it("partitionHomeBuckets respects tradable and emerging caps on catalog seed", () => {
    const p = partitionHomeBuckets(CATALOG_THESES);
    expect(p.tradable.length).toBeLessThanOrEqual(HOME_TRADABLE_CAP);
    expect(p.emerging.length).toBeLessThanOrEqual(HOME_EMERGING_CAP);
    const placed = new Set([...p.tradable, ...p.emerging, ...p.monitoring].map((t) => t.id));
    for (const t of CATALOG_THESES) {
      if (t.status === "resolved" || t.status === "invalidated") continue;
      expect(placed.has(t.id)).toBe(true);
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
