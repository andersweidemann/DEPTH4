import { thesisEvidenceFromBodyJson } from "@/lib/thesis-engine-v2/body-evidence-to-thesis-evidence";
import type { Thesis, ThesisDetailBundle, ThesisEvidence, ThesisScenario, ThesisUpdate } from "@/lib/thesis-engine-v2/types";
import { catalogSlugForSystemThesisId, RESERVED_CATALOG_SLUGS } from "@/lib/thesis-engine-v2/catalog-slugs";
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
  return s.theses
    .filter((t) => !RESERVED_CATALOG_SLUGS.has(t.slug))
    .map((t) => normalizeThesisNarrativeFields(normalizeThesisStatus(t)));
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
  const t = normalizeThesisNarrativeFields(normalizeThesisStatus(thesis));
  const next = [t, ...cur.filter((x) => x.slug !== t.slug)];
  saveUserTheses(next);
  return next;
}

export function getUserThesisBySlug(slug: string): Thesis | undefined {
  return loadUserTheses().find((t) => t.slug === slug);
}

/** Route param for `/theses/[slug]` — system catalog + session user theses. */
export function resolveThesisDetailSlug(thesisId: string): string {
  const catalogSlug = catalogSlugForSystemThesisId(thesisId);
  if (catalogSlug) return catalogSlug;
  const u = loadUserTheses().find((t) => t.id === thesisId);
  return u?.slug ?? thesisId;
}

function mkEvidence(thesis: Thesis): ThesisEvidence[] {
  const p0 = Math.max(25, Math.round(thesis.probability - 4));
  return [
    {
      id: `${thesis.id}-ev-1`,
      thesisId: thesis.id,
      source: "DEPTH4",
      timestamp: "Created · now",
      headline: "User thesis saved",
      impact: "neutral",
      probabilityBefore: p0,
      probabilityAfter: thesis.probability,
      interpretation: "Baseline saved — evidence fills in as headlines and your starred book update.",
    },
  ];
}

/** Exported for Scenario View narrative fallback (same rows as `bundle.scenarios` for user theses). */
export function userThesisScenarioRows(thesis: Thesis): ThesisScenario[] {
  return mkScenarios(thesis);
}

function mkScenarios(thesis: Thesis): ThesisScenario[] {
  if (thesis.scenarioOverrides) {
    return [
      {
        id: `${thesis.id}-sc-base`,
        thesisId: thesis.id,
        pathKey: "messy_win",
        label: "Messy win",
        probability: thesis.scenarioOverrides.base.probability,
        confirmation: thesis.scenarioOverrides.base.confirmation,
        marketConsequence: thesis.scenarioOverrides.base.marketConsequence,
      },
      {
        id: `${thesis.id}-sc-bull`,
        thesisId: thesis.id,
        pathKey: "clean_win",
        label: "Clean win",
        probability: thesis.scenarioOverrides.bull.probability,
        confirmation: thesis.scenarioOverrides.bull.confirmation,
        marketConsequence: thesis.scenarioOverrides.bull.marketConsequence,
      },
      {
        id: `${thesis.id}-sc-bear`,
        thesisId: thesis.id,
        pathKey: "thesis_broken",
        label: "Thesis broken",
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
      pathKey: "messy_win",
      label: "Messy win",
      probability: 45,
      confirmation: `Drivers stay two-way: your trigger for ${thesis.asset} is not fully clean yet, but nothing has proved the thesis dead.`,
      marketConsequence: `Keep the ${thesis.direction} sized for chop; follow Trade plan until data and price pick a side.`,
    },
    {
      id: `${thesis.id}-sc-bull`,
      thesisId: thesis.id,
      pathKey: "clean_win",
      label: "Clean win",
      probability: 30,
      confirmation: thesis.trigger,
      marketConsequence: thesis.tradeExpression,
    },
    {
      id: `${thesis.id}-sc-bear`,
      thesisId: thesis.id,
      pathKey: "thesis_broken",
      label: "Thesis broken",
      probability: 25,
      confirmation: thesis.invalidation,
      marketConsequence: "Follow Invalidation and Book — retire or sharply cut the line; no new entry thesis here.",
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

export function bundleForUserThesis(
  thesis: Thesis,
  opts?: { scenarioProbabilitiesFromDb?: boolean; body?: unknown },
): ThesisDetailBundle {
  const bodyEvidence = opts?.body != null ? thesisEvidenceFromBodyJson(opts.body, thesis.id) : [];
  const evidence = bodyEvidence.length > 0 ? bodyEvidence : mkEvidence(thesis);
  return {
    thesis: normalizeThesisNarrativeFields(thesis),
    evidence,
    scenarios: mkScenarios(thesis),
    advisoryLog: mkAdvisoryLog(thesis),
    relatedAssets: [
      { symbol: thesis.asset, note: "Primary chart" },
      { symbol: "SPY", note: "Risk proxy" },
      { symbol: "UUP", note: "USD check" },
    ],
    ...(opts?.scenarioProbabilitiesFromDb !== undefined
      ? { scenarioProbabilitiesFromDb: opts.scenarioProbabilitiesFromDb }
      : {}),
  };
}

