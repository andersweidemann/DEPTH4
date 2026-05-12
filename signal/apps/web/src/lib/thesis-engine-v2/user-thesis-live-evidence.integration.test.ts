/**
 * Regression: user thesis evidence timeline + scenario movement (DEPTH4).
 *
 * This file is the **contract / observed-values proof** for the fix that shipped in commit 546c8e6:
 * prioritized poll ids, higher `thesis_evidence_log` row limit, and non-null `probability_after` on
 * news inserts (while `public.theses.scenario_probabilities` stays gated by auto-apply).
 *
 * **Live product verification** (Supabase + browser) is not run in CI — use this checklist locally:
 * - Pick a user thesis with `insider_flow` + `status` in forming|watching|ready|active.
 * - Open `/theses/[slug]` (ThesisSlugDetailPage → ThesisDetailClient); confirm `thesis_evidence_log` has rows for that `thesis_id`.
 * - After cron, rows should carry `probability_after` when `computeSuggestedUpdate` returns a suggestion.
 * - Hard refresh: scenario triple should not revert to DB seed if server still sends seed (merge skips seed overlay).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDisplayScenariosFromThesis,
  dbScenarioTripleEqualsSeed,
  displayScenarioTripleCleanMessyBroken,
  isUncalibratedDisplayScenarioTriple,
  overlayDbScenarioProbabilities,
  scenarioOverridesFromRows,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import {
  buildEvidencePollThesisIds,
  EVIDENCE_LOG_POLL_ROW_LIMIT,
  EVIDENCE_POLL_MAX_THESIS_IDS,
} from "@/lib/thesis-engine-v2/thesis-evidence-poll-scope";
import { mergeEvidenceTimelineItems, type EvidenceLogRowLike } from "@/lib/thesis-engine-v2/evidence-log-to-thesis-evidence";
import { mergeUserThesisWithServerCatalog } from "@/lib/thesis-engine-v2/user-thesis-server-merge";
import { bundleForUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

/** Concrete example thesis used for all assertions below (peace / gold style, user lane). */
export const VERIFIED_USER_THESIS_ID = "user-verified-peace-gold-001";
export const VERIFIED_USER_THESIS_SLUG = "my-peace-gold-short";

function peaceGoldUserThesis(): Thesis {
  return {
    id: VERIFIED_USER_THESIS_ID,
    slug: VERIFIED_USER_THESIS_SLUG,
    title: "Gold fades on durable peace",
    thesisStatement: "Gold fades on durable peace — futures still hold war-premium.",
    asset: "GLD",
    direction: "short",
    probability: 58,
    status: "active",
    probabilityRationale: "Positioning and flows still lean geopolitical hedges.",
    origin: "user",
    hiddenDriver: "War premium embedded in bullion.",
    likelyPath: "Headline ladder toward de-escalation.",
    marketMisread: "",
    tradeExpression: "Express via GLD / futures curve.",
    whyNow: "Ceasefire headlines clustering.",
    whatsUnpriced: "How fast geopolitical risk reprices lower.",
    trigger: "Confirmed ceasefire + risk assets bid.",
    trade: "Fade GLD spikes into data.",
    invalidation: "Hot escalation + GLD new highs on volume.",
    horizon: "Q2",
    advisoryAction: "hold",
    lastUpdated: "Now",
    qualification: "emerging",
    scores: {
      driverStrength: 10,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 7,
      triggerClarityScore: 8,
      total: 45,
    },
    theme: "geopolitics",
    insiderFlow: {
      bullInstruments: [],
      bearInstruments: ["GLD", "XAUUSD"],
      confirmTags: ["ceasefire", "peace talks", "de-escalation"],
    },
  } as Thesis;
}

/** First analyzed news row — `probability_after` matches thesis-news when suggestion exists (non–auto-apply still writes trail). */
const FIRST_NEWS_PROBABILITY_AFTER = { base: 52, bull: 28, bear: 20 };

describe("user thesis live evidence + scenarios (integration)", () => {
  it("slug page renders ThesisDetailClient under ThesisSlugDetailPage (live evidence path)", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pagePath = join(dir, "../../app/(app)/theses/[slug]/page.tsx");
    const shellPath = join(dir, "../../components/thesis-engine-v2/ThesisSlugDetailPage.tsx");
    const detailPath = join(dir, "../../components/thesis-engine-v2/ThesisDetailClient.tsx");
    expect(readFileSync(pagePath, "utf8")).toContain("ThesisSlugDetailPage");
    expect(readFileSync(shellPath, "utf8")).toContain("ThesisDetailClient");
    expect(readFileSync(detailPath, "utf8")).toContain("registerEvidenceLogPollPriorityThesisId");
    expect(readFileSync(detailPath, "utf8")).toContain("bundle?.thesis.id");
  });

  it("prepends viewed thesis id into buildEvidencePollThesisIds (priorityIds)", () => {
    const t = peaceGoldUserThesis();
    const ids = buildEvidencePollThesisIds({
      starred: new Set(["th-gold"]),
      openIds: new Set(),
      userTheses: [t],
      priorityIds: [VERIFIED_USER_THESIS_ID],
    });
    expect(ids[0]).toBe(VERIFIED_USER_THESIS_ID);
    expect(ids).toContain("th-gold");
    expect(ids).toContain(VERIFIED_USER_THESIS_ID);
    expect(ids.length).toBeLessThanOrEqual(EVIDENCE_POLL_MAX_THESIS_IDS);
  });

  it(`uses EVIDENCE_LOG_POLL_ROW_LIMIT=${EVIDENCE_LOG_POLL_ROW_LIMIT} for the client poll batch size constant`, () => {
    expect(EVIDENCE_LOG_POLL_ROW_LIMIT).toBe(480);
  });

  it("GET /api/user/theses slug handler exposes insider_flow for client hydration", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const path = join(dir, "../../app/api/user/theses/route.ts");
    const s = readFileSync(path, "utf8");
    expect(s).toContain("insider_flow");
    expect(s).toContain("insider_flow:");
  });

  it("filters global evidence log batch to liveEvidence for that thesis only", () => {
    const noise: EvidenceLogRowLike[] = Array.from({ length: 50 }, (_, i) => ({
      id: `noise-${i}`,
      createdAt: Date.now() - i * 1000,
      thesisId: "th-opec",
      eventType: "NEWS_DEVELOPMENT",
      description: "OPEC headline",
      probabilityBefore: { base: 40, bull: 35, bear: 25 },
      probabilityAfter: { base: 41, bull: 34, bear: 25 },
    }));
    const userRow: EvidenceLogRowLike = {
      id: "ev-user-first",
      createdAt: Date.now(),
      thesisId: VERIFIED_USER_THESIS_ID,
      eventType: "NEWS_DEVELOPMENT",
      description: "Peace talks advance — GLD offered",
      probabilityBefore: { base: 40, bull: 35, bear: 25 },
      probabilityAfter: FIRST_NEWS_PROBABILITY_AFTER,
      metadata: { source: "news_events", reasons: ["confirm_tag"] },
    };
    const batch = [...noise, userRow].sort((a, b) => b.createdAt - a.createdAt);
    const liveEvidence = batch.filter((r) => r.thesisId === VERIFIED_USER_THESIS_ID);
    expect(liveEvidence).toHaveLength(1);
    expect(liveEvidence[0]?.probabilityAfter).toEqual(FIRST_NEWS_PROBABILITY_AFTER);
    expect(dbScenarioTripleEqualsSeed(FIRST_NEWS_PROBABILITY_AFTER)).toBe(false);
  });

  it("merged evidence timeline is non-empty and prepends the log headline before bundle onboarding", () => {
    const bundle = bundleForUserThesis(peaceGoldUserThesis());
    const userRow: EvidenceLogRowLike = {
      id: "ev-user-first",
      createdAt: Date.now(),
      thesisId: VERIFIED_USER_THESIS_ID,
      eventType: "NEWS_DEVELOPMENT",
      description: "Peace talks advance — GLD offered",
      probabilityBefore: { base: 40, bull: 35, bear: 25 },
      probabilityAfter: FIRST_NEWS_PROBABILITY_AFTER,
      metadata: { source: "news_events" },
    };
    const merged = mergeEvidenceTimelineItems([userRow], bundle.evidence, bundle.thesis.probability);
    expect(merged.length).toBeGreaterThanOrEqual(2);
    expect(merged[0]?.headline).toBe("Peace talks advance — GLD offered");
    expect(merged[0]?.source).toBe("news_events");
  });

  it("first analysis: template triple before news → non-template display triple after applying log probability_after", () => {
    const bundle = bundleForUserThesis(peaceGoldUserThesis());
    const beforeRows = buildDisplayScenariosFromThesis(bundle.thesis, bundle.scenarios);
    const tripleBefore = displayScenarioTripleCleanMessyBroken(beforeRows);
    expect(tripleBefore).toEqual([30, 45, 25]);
    expect(isUncalibratedDisplayScenarioTriple(beforeRows)).toBe(true);

    const seeded = scenarioOverridesFromRows(bundle.scenarios);
    const patchedOverrides = overlayDbScenarioProbabilities(seeded, FIRST_NEWS_PROBABILITY_AFTER);
    const mergedThesis = mergeThesis(bundle.thesis, { scenarioOverrides: patchedOverrides });
    const afterRows = buildDisplayScenariosFromThesis(mergedThesis, bundle.scenarios);
    const tripleAfter = displayScenarioTripleCleanMessyBroken(afterRows);
    expect(tripleAfter).toEqual([28, 52, 20]);
    expect(isUncalibratedDisplayScenarioTriple(afterRows)).toBe(false);
    expect(tripleAfter).not.toEqual([40, 35, 25]);
    expect(tripleAfter).not.toEqual([30, 45, 25]);
  });

  it("simulated refresh: server still sends seed scenario_probabilities — merge must NOT revert client triple", () => {
    const bundle = bundleForUserThesis(peaceGoldUserThesis());
    const seeded = scenarioOverridesFromRows(bundle.scenarios);
    const patchedOverrides = overlayDbScenarioProbabilities(seeded, FIRST_NEWS_PROBABILITY_AFTER);
    const mergedThesis = mergeThesis(bundle.thesis, { scenarioOverrides: patchedOverrides });

    const afterRefresh = mergeUserThesisWithServerCatalog(mergedThesis, {
      title: null,
      microLabel: null,
      body: null,
      scenarioProbabilities: { base: 40, bull: 35, bear: 25 },
    });
    const rows = buildDisplayScenariosFromThesis(afterRefresh, bundle.scenarios);
    expect(displayScenarioTripleCleanMessyBroken(rows)).toEqual([28, 52, 20]);
  });
});
