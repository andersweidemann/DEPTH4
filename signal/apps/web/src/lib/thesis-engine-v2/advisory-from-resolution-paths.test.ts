import { describe, expect, it } from "vitest";
import { advisoryHeadlineFromResolutionPaths } from "@/lib/thesis-engine-v2/advisory-from-resolution-paths";

describe("advisoryHeadlineFromResolutionPaths", () => {
  it("prefers stand down when clean+messy edge is weak", () => {
    const s = advisoryHeadlineFromResolutionPaths(25, 30, 45, "enter");
    expect(s).toContain("Stand down");
  });

  it("watchlist when thesis broken risk is elevated", () => {
    const s = advisoryHeadlineFromResolutionPaths(45, 35, 22, "enter");
    expect(s).toContain("Watchlist");
  });

  it("reduced size when messy path is modal", () => {
    const s = advisoryHeadlineFromResolutionPaths(35, 48, 17, "enter");
    expect(s).toContain("reduced size");
  });

  it("clean enter when paths are favorable", () => {
    const s = advisoryHeadlineFromResolutionPaths(48, 35, 12, "enter");
    expect(s).toContain("clean path");
  });
});
