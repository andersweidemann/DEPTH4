import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildMutationCoverageReport,
  THESIS_MUTATION_PATH_REGISTRY,
} from "@/lib/thesis-mutation/thesis-mutation-coverage";
import * as flags from "@/lib/thesis-mutation/feature-flags";

describe("thesis-mutation-coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies ensure-ai-thesis and engine crons as mutation_when_flag_on", () => {
    const ids = THESIS_MUTATION_PATH_REGISTRY.map((p) => p.id);
    expect(ids).toContain("ensure_ai_thesis_for_cluster");
    expect(ids).toContain("cron_thesis_surfacing");
    const ai = THESIS_MUTATION_PATH_REGISTRY.find((p) => p.id === "ensure_ai_thesis_for_cluster");
    expect(ai?.mode).toBe("mutation_when_flag_on");
    expect(ai?.actorTypes).toContain("macro");
  });

  it("warns when flag is on but engine actor types have zero 24h updates", () => {
    vi.spyOn(flags, "isThesisMutationEnabled").mockReturnValue(true);
    const report = buildMutationCoverageReport({ user: 2 });
    expect(report.flagEnabled).toBe(true);
    expect(report.warnings.some((w) => w.includes("scheduler"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("news"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("macro"))).toBe(true);
  });

  it("marks paths as mutation-backed when flag is enabled", () => {
    vi.spyOn(flags, "isThesisMutationEnabled").mockReturnValue(true);
    const report = buildMutationCoverageReport({ scheduler: 10, news: 5, macro: 3, user: 1 });
    const surfacing = report.paths.find((p) => p.id === "cron_thesis_surfacing");
    expect(surfacing?.effectiveLabel).toContain("Mutation-backed");
  });
});
