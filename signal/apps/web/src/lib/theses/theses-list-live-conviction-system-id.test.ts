import { beforeEach, describe, expect, it, vi } from "vitest";

const loadUserThesesMock = vi.hoisted(() => vi.fn<[], import("@/lib/thesis-engine-v2/types").Thesis[]>(() => []));

vi.mock("@/lib/thesis-engine-v2/user-theses", () => ({
  loadUserTheses: () => loadUserThesesMock(),
}));

import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { resolveListRowBaselineThesis } from "@/lib/theses/theses-list-live-conviction";
import type { ThesisListItem } from "@/types/thesis";

describe("resolveListRowBaselineThesis (system id guard)", () => {
  beforeEach(() => {
    loadUserThesesMock.mockReset();
    loadUserThesesMock.mockReturnValue([]);
  });

  it("does not let session user rows shadow a catalog system thesis id", () => {
    const d = getThesisDetail("strait-hormuz-oil-long")!;
    const poison: Thesis = {
      ...d.thesis,
      id: "th-hormuz",
      slug: "session-poison-slug",
      title: "Poison row",
    };
    loadUserThesesMock.mockReturnValue([poison]);

    const item: ThesisListItem = {
      thesisId: "th-hormuz",
      listBaselineScenarioTriple: { base: 40, bull: 35, bear: 25 },
      slug: d.thesis.slug,
      title: d.thesis.title,
      statement: d.thesis.thesisStatement,
      asset: d.thesis.asset,
      direction: "long",
      status: "Active",
      conviction: 0,
      convictionIsTemplateEstimate: false,
      mispricingScore: 0,
      whyNow: "",
      lastUpdated: "",
      starred: false,
    };

    const base = resolveListRowBaselineThesis(item);
    expect(base?.slug).toBe("strait-hormuz-oil-long");
    expect(base?.title).not.toBe("Poison row");
  });
});
