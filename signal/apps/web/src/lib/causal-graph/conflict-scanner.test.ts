import { describe, expect, it } from "vitest";
import { validateThesisEventLink } from "@/lib/causal-graph/causal-validator";

/** Unit-level mirror of scanner pairing logic (no Supabase). */
describe("conflict scanner pairing", () => {
  it("detects same-asset opposite direction pair", () => {
    const cluster = [
      { slug: "a", targetAssetSymbol: "GLD", direction: "up" as const, title: "A", statement: "" },
      { slug: "b", targetAssetSymbol: "GLD", direction: "down" as const, title: "B", statement: "" },
    ];
    let found = false;
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i]!;
        const b = cluster[j]!;
        if (a.targetAssetSymbol === b.targetAssetSymbol && a.direction !== b.direction) found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("flags semantic mismatch for defense spend under de-escalation", () => {
    const v = validateThesisEventLink(
      {
        slug: "def",
        title: "Defense spending rises",
        statement: "War drives defense spend",
        targetAssetSymbol: "LMT",
        direction: "up",
      },
      {
        title: "War de-escalation",
        category: "geopolitics",
        description: "Peace talks ease tensions",
      },
      [],
    );
    expect(v.valid).toBe(false);
  });
});
