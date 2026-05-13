import { describe, expect, it } from "vitest";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import { isThesisMapListableThesis, titleLooksLikeRawSourceMaterial } from "@/lib/theses/thesis-surfacing-quality";

describe("thesis map listability (headline junk + catalog)", () => {
  it("rejects Grupo-style conference / slideshow source titles", () => {
    const title =
      "Grupo Supervielle S.A. (SUPV) Presents at UBS BB Argentina One-on-One Conference 2026 - Slideshow.";
    expect(titleLooksLikeRawSourceMaterial(title)).toBe(true);
  });

  it("rejects titles that mention slideshow alone", () => {
    expect(titleLooksLikeRawSourceMaterial("Some Co Q3 2025 Results - Slideshow")).toBe(true);
  });

  it("always allows shipped catalog theses on the map", () => {
    const t = getThesisBySlug("china-stimulus-copper-long");
    expect(t).toBeDefined();
    expect(isThesisMapListableThesis(t!)).toBe(true);
  });
});
