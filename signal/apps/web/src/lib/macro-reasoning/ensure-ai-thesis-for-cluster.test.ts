import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAiThesisForDiscoveryCluster } from "@/lib/macro-reasoning/ensure-ai-thesis-for-cluster";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { pickAiThesisStatementFromReasoning } from "@/lib/theses/thesis-surfacing-quality";

function thickReasoningChain(): string {
  const l1 =
    "Headlines confirm coordinated prints on energy supply and OPEC commentary that is more binding than last quarter.";
  const l2 =
    "Near-term futures lift XLE and USO first while HY energy curves test whether funding stress is localized or broad.";
  const l3 =
    "The market is pricing infinite shale elasticity, but DEPTH4 sees OPEC plus draws breaking that default — if inventories keep falling while discipline holds, the curve is wrong and cash bonds in majors reprice tighter.";
  const l4 =
    "Year backdrop rotates leadership toward cashflow-heavy energy and away from capex-heavy narratives until balances prove otherwise — XLE stays the clean expression while single names lag on idiosyncratic noise.";
  return [
    "LEVEL 1 (CONFIRMED TODAY — 0–24h):",
    l1,
    "",
    "LEVEL 2 (THIS WEEK — 1–7d):",
    l2,
    "",
    "LEVEL 3 (THIS MONTH — 7–30d):",
    l3,
    "",
    "LEVEL 4 (THIS QUARTER — 30–90d+):",
    l4,
  ].join("\n");
}

function minimalReasoning(over: Partial<MacroEventReasoning> = {}): MacroEventReasoning {
  return {
    event_summary: "Co issued Q1 results.",
    actors: [],
    geography: [],
    domain: "banks",
    direction_of_change: "mixed",
    confidence: 0.5,
    first_order_effects: ["Print landed."],
    second_order_effects: ["Spreads on watch."],
    third_order_effects: ["Policy path matters."],
    impacted_assets: [],
    impacted_sectors: [],
    affected_theses: [],
    thesis_relation: "adjacent",
    thesis_trade_line: "",
    probability_before_pct: null,
    probability_after_pct: null,
    probability_update: "",
    trade_implication: "Neutral tape.",
    reasoning_chain: thickReasoningChain(),
    reasoning_summary: "Story threads through Q1.",
    mispricing_hypothesis: "The market still prices too much shale elasticity — OPEC proves barrels matter first.",
    per_catalog_thesis: [],
    ...over,
  };
}

function createThesesMock(opts: { existingThesisId?: string | null }) {
  let fromCall = 0;
  const insertSpy = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));

  const admin = {
    from: vi.fn((table: string) => {
      expect(table).toBe("theses");
      fromCall += 1;
      if (fromCall === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: opts.existingThesisId ? { id: opts.existingThesisId } : null,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      return { insert: insertSpy };
    }),
  };

  return { admin: admin as unknown as SupabaseClient, insertSpy, getFromCallCount: () => fromCall };
}

describe("ensureAiThesisForDiscoveryCluster (registry insert path)", () => {
  it("rejects junk cluster: no insert when trade/summary are not registry-safe heroes", async () => {
    const hint = "B3 S.A. - Brasil, Bolsa, Balcão (BOLSY) Q1 2026 Earnings Call Transcript.";
    const reasoning = minimalReasoning({
      thesis_trade_line: "Grupo Supervielle S.A. (SUPV) Q1 2026 Earnings Call Transcript.",
      event_summary: "Company issued results.",
    });
    expect(
      pickAiThesisStatementFromReasoning({
        titleHint: hint,
        thesisTradeLine: reasoning.thesis_trade_line ?? "",
        eventSummary: reasoning.event_summary ?? "",
      }),
    ).toBe("");

    const { admin, insertSpy, getFromCallCount } = createThesesMock({});
    const out = await ensureAiThesisForDiscoveryCluster(admin, {
      clusterId: "00000000-0000-4000-8000-00000000cafe",
      titleHint: hint,
      reasoning,
    });
    expect(out).toEqual({ ok: false, reason: "reject_non_causal_hero_for_registry" });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(getFromCallCount()).toBe(1);
  });

  it("inserts when thesis_trade_line is a valid causal hero; title is forecast not source copy", async () => {
    const hint = "SomeCo (ABC) Q1 2026 Earnings Call Transcript.";
    const trade =
      "XLE will stay bid as OPEC discipline holds while the market still embeds too much shale elasticity into the summer window.";
    const reasoning = minimalReasoning({
      thesis_trade_line: trade,
      event_summary: "Energy tape firming.",
    });
    expect(
      pickAiThesisStatementFromReasoning({
        titleHint: hint,
        thesisTradeLine: reasoning.thesis_trade_line ?? "",
        eventSummary: reasoning.event_summary ?? "",
      }),
    ).toBe(trade);

    const { admin, insertSpy } = createThesesMock({});
    const out = await ensureAiThesisForDiscoveryCluster(admin, {
      clusterId: "00000000-0000-4000-8000-00000000babe",
      titleHint: hint,
      reasoning,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected insert ok");
    expect(out.created).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0] as { title?: string; thesis_origin?: string };
    expect(row.thesis_origin).toBe("ai_generated");
    expect(row.title).toBe(trade.slice(0, 160));
    expect(row.title).not.toContain("Transcript");
  });

  it("rejects sell-side deck phrasing in hero", async () => {
    const reasoning = minimalReasoning({
      thesis_trade_line:
        "XLE will stay bid as management keeps Long-Term Targets On Track into next quarter.",
    });
    const { admin, insertSpy } = createThesesMock({});
    const out = await ensureAiThesisForDiscoveryCluster(admin, {
      clusterId: "00000000-0000-4000-8000-00000000beef",
      titleHint: null,
      reasoning,
    });
    expect(out).toEqual({ ok: false, reason: "reject_analyst_style_hero" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("short-circuits when an ai_generated row already exists for the cluster", async () => {
    const reasoning = minimalReasoning({
      thesis_trade_line: "TLT will stay under pressure as cuts land later than futures price over the next quarter.",
    });
    const { admin, insertSpy } = createThesesMock({ existingThesisId: "already-there" });
    const out = await ensureAiThesisForDiscoveryCluster(admin, {
      clusterId: "00000000-0000-4000-8000-00000000abcd",
      titleHint: null,
      reasoning,
    });
    expect(out).toEqual({ ok: true, thesisId: "already-there", created: false });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
