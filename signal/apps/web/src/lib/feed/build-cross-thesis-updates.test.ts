import { describe, expect, it } from "vitest";
import { CAUSAL_FILTER_FIXTURE } from "@/lib/causal-map/causal-map-filters.fixture";
import { buildCrossThesisUpdates } from "@/lib/feed/build-cross-thesis-updates";
import type { GlobalCausalGraph } from "@/types/causal-graph";

function graphFromFixture(): GlobalCausalGraph {
  return {
    clusters: CAUSAL_FILTER_FIXTURE,
    activeEvents: CAUSAL_FILTER_FIXTURE.length,
    totalTheses: CAUSAL_FILTER_FIXTURE.reduce((n, c) => n + c.theses.length, 0),
    lastUpdated: "2026-05-01T12:00:00Z",
  };
}

describe("buildCrossThesisUpdates", () => {
  it("returns empty when no focal slugs", () => {
    expect(buildCrossThesisUpdates(graphFromFixture(), new Set())).toEqual([]);
  });

  it("emits info when two starred theses share an event", () => {
    const updates = buildCrossThesisUpdates(
      graphFromFixture(),
      new Set(["war-peace-gold-short", "us-defense-repricing"]),
    );
    const info = updates.filter((u) => u.severity === "info");
    expect(info.length).toBeGreaterThanOrEqual(1);
    expect(info[0]!.sharedEventId).toBe("evt-war");
  });

  it("emits opportunity for implied effects without dedicated thesis", () => {
    const updates = buildCrossThesisUpdates(graphFromFixture(), new Set(["war-peace-gold-short"]));
    const opp = updates.find((u) => u.severity === "opportunity");
    expect(opp).toBeDefined();
    expect(opp!.message).toContain("Fertilizer basket");
  });

  it("emits asset conflict when focal theses oppose on same asset", () => {
    const graph = graphFromFixture();
    const cluster = graph.clusters[0]!;
    cluster.theses.push({
      ...cluster.theses[0]!,
      id: "t-gold-long",
      slug: "war-peace-gold-long",
      title: "Gold LONG",
      direction: "up",
    });
    const updates = buildCrossThesisUpdates(
      graph,
      new Set(["war-peace-gold-short", "war-peace-gold-long"]),
    );
    expect(updates.some((u) => u.severity === "conflict" && u.message.includes("XAUUSD"))).toBe(true);
  });

  it("emits conflict from cluster conflictWarnings when focal thesis involved", () => {
    const graph = graphFromFixture();
    graph.clusters[0]!.conflictWarnings.push({
      thesisA: "Gold SHORT",
      thesisB: "Defense LONG",
      conflict: "Opposing read on war de-escalation.",
    });
    const updates = buildCrossThesisUpdates(graph, new Set(["war-peace-gold-short"]));
    expect(updates.some((u) => u.severity === "conflict" && u.message.includes("Opposing read"))).toBe(
      true,
    );
  });

  it("filters by contextThesisSlug", () => {
    const updates = buildCrossThesisUpdates(
      graphFromFixture(),
      new Set(["war-peace-gold-short", "us-defense-repricing"]),
      graphFromFixture().lastUpdated,
      "war-peace-gold-short",
    );
    expect(updates.every((u) => u.affectedThesisSlug === "war-peace-gold-short" || u.affectingThesisSlug === "war-peace-gold-short")).toBe(
      true,
    );
  });

  it("sorts conflict before opportunity before info", () => {
    const graph = graphFromFixture();
    graph.clusters[0]!.theses.push({
      ...graph.clusters[0]!.theses[0]!,
      id: "t-gold-long",
      slug: "war-peace-gold-long",
      title: "Gold LONG",
      direction: "up",
    });
    const updates = buildCrossThesisUpdates(
      graph,
      new Set(["war-peace-gold-short", "war-peace-gold-long", "us-defense-repricing"]),
    );
    const severities = updates.map((u) => u.severity);
    const firstConflict = severities.indexOf("conflict");
    const firstOpp = severities.indexOf("opportunity");
    const firstInfo = severities.indexOf("info");
    if (firstConflict >= 0 && firstOpp >= 0) expect(firstConflict).toBeLessThan(firstOpp);
    if (firstOpp >= 0 && firstInfo >= 0) expect(firstOpp).toBeLessThan(firstInfo);
  });
});
