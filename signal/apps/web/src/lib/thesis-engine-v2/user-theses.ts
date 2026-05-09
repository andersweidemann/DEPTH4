import type { Thesis, ThesisDetailBundle, ThesisEvidence, ThesisScenario, ThesisUpdate } from "@/lib/thesis-engine-v2/types";
import { getThesisBySlug, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";

const USER_THESES_KEY = "depth4.v2.user_theses.v1";

type Stored = {
  theses: Thesis[];
};

function safeParse(raw: string | null): Stored {
  if (!raw) return { theses: [] };
  try {
    const j = JSON.parse(raw) as Partial<Stored>;
    const theses = Array.isArray(j.theses) ? (j.theses as Thesis[]) : [];
    return { theses };
  } catch {
    return { theses: [] };
  }
}

function normalizeThesisStatus(t: Thesis): Thesis {
  const st = t.status as Thesis["status"] | "actionable";
  if (st === "actionable") return { ...t, status: "ready" };
  return t;
}

export function loadUserTheses(): Thesis[] {
  if (typeof window === "undefined") return [];
  const s = safeParse(window.sessionStorage.getItem(USER_THESES_KEY));
  // avoid collisions with system slugs
  return s.theses.filter((t) => !getThesisBySlug(t.slug)).map(normalizeThesisStatus);
}

export function saveUserTheses(theses: Thesis[]) {
  if (typeof window === "undefined") return;
  const payload: Stored = { theses };
  try {
    window.sessionStorage.setItem(USER_THESES_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function upsertUserThesis(thesis: Thesis) {
  const cur = loadUserTheses();
  const next = [thesis, ...cur.filter((t) => t.slug !== thesis.slug)];
  saveUserTheses(next);
  return next;
}

export function getUserThesisBySlug(slug: string): Thesis | undefined {
  return loadUserTheses().find((t) => t.slug === slug);
}

/** Route param for `/theses/[slug]` — system catalog + session user theses. */
export function resolveThesisDetailSlug(thesisId: string): string {
  const sys = MOCK_THESES.find((t) => t.id === thesisId);
  if (sys) return sys.slug;
  const u = loadUserTheses().find((t) => t.id === thesisId);
  return u?.slug ?? thesisId;
}

function mkEvidence(thesis: Thesis): ThesisEvidence[] {
  // Seed a small plausible evidence stack for new user theses.
  const p0 = Math.max(25, Math.round(thesis.probability - 10));
  const p1 = Math.max(25, Math.round(thesis.probability - 4));
  return [
    {
      id: `${thesis.id}-ev-1`,
      thesisId: thesis.id,
      source: "DEPTH4",
      timestamp: "Created · now",
      headline: "User thesis created",
      impact: "neutral",
      probabilityBefore: p0,
      probabilityAfter: p1,
      interpretation: "Baseline framing captured; DEPTH4 begins monitoring signal flow against the trigger.",
    },
    {
      id: `${thesis.id}-ev-2`,
      thesisId: thesis.id,
      source: "Reuters",
      timestamp: "Catalogued · +12m",
      headline: "Committee calendar indicates upcoming window",
      impact: "minor_positive",
      probabilityBefore: p1,
      probabilityAfter: thesis.probability,
      interpretation: "Timing compression improves; thesis edges closer to tradeable conditions.",
    },
  ];
}

function mkScenarios(thesis: Thesis): ThesisScenario[] {
  if (thesis.scenarioOverrides) {
    return [
      {
        id: `${thesis.id}-sc-base`,
        thesisId: thesis.id,
        label: "Base case",
        probability: thesis.scenarioOverrides.base.probability,
        confirmation: thesis.scenarioOverrides.base.confirmation,
        marketConsequence: thesis.scenarioOverrides.base.marketConsequence,
      },
      {
        id: `${thesis.id}-sc-bull`,
        thesisId: thesis.id,
        label: "Bull case",
        probability: thesis.scenarioOverrides.bull.probability,
        confirmation: thesis.scenarioOverrides.bull.confirmation,
        marketConsequence: thesis.scenarioOverrides.bull.marketConsequence,
      },
      {
        id: `${thesis.id}-sc-bear`,
        thesisId: thesis.id,
        label: "Bear case",
        probability: thesis.scenarioOverrides.bear.probability,
        confirmation: thesis.scenarioOverrides.bear.confirmation,
        marketConsequence: thesis.scenarioOverrides.bear.marketConsequence,
      },
    ];
  }
  return [
    {
      id: `${thesis.id}-sc-base`,
      thesisId: thesis.id,
      label: "Base case",
      probability: 45,
      confirmation: thesis.trigger,
      marketConsequence: thesis.tradeExpression,
    },
    {
      id: `${thesis.id}-sc-bull`,
      thesisId: thesis.id,
      label: "Bull case",
      probability: 30,
      confirmation: "Trigger confirms earlier than expected; follow-through persists for 2 sessions.",
      marketConsequence: "Targets come into play faster; tighten stop and let it run.",
    },
    {
      id: `${thesis.id}-sc-bear`,
      thesisId: thesis.id,
      label: "Bear case",
      probability: 25,
      confirmation: thesis.invalidation,
      marketConsequence: "Thesis invalidated; exit and log the miss cleanly.",
    },
  ];
}

function mkAdvisoryLog(thesis: Thesis): ThesisUpdate[] {
  return [
    {
      id: `${thesis.id}-u1`,
      thesisId: thesis.id,
      timestamp: "Now",
      text: "User thesis onboarded — monitoring live signals against trigger + invalidation.",
    },
    {
      id: `${thesis.id}-u2`,
      thesisId: thesis.id,
      timestamp: "Next",
      text: "This becomes Ready if the trigger confirms while the market still hasn’t caught up yet.",
    },
  ];
}

export function bundleForUserThesis(thesis: Thesis): ThesisDetailBundle {
  return {
    thesis: normalizeThesisNarrativeFields(thesis),
    evidence: mkEvidence(thesis),
    scenarios: mkScenarios(thesis),
    advisoryLog: mkAdvisoryLog(thesis),
    relatedAssets: [
      { symbol: thesis.asset, note: "Primary chart" },
      { symbol: "SPY", note: "Risk proxy" },
      { symbol: "UUP", note: "USD check" },
    ],
  };
}

