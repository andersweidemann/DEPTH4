import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";

function slugify(input: string, suffix: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "thesis"}-${suffix}`;
}

/** Minimal user-owned thesis for `public.theses` insert (Chunk 9 POST /api/theses). */
export function buildDraftUserThesisFromForm(input: {
  statement: string;
  asset: string;
  direction: "long" | "short";
  id: string;
}): Thesis {
  const statement = input.statement.trim();
  const asset = input.asset.trim() || "—";
  const direction = input.direction;
  const slug = slugify(statement, input.id.slice(0, 8));
  const now = new Date().toISOString();
  const placeholder =
    "Draft — expand this thesis on the detail page. This stub keeps one field per narrative block without duplicating the hero sentence.";

  const shell: Thesis = {
    id: input.id,
    slug,
    title: statement.slice(0, 160) || "New thesis",
    thesisStatement: statement,
    microLabel: null,
    asset,
    direction,
    probability: 50,
    status: "forming" as ThesisStatus,
    probabilityRationale: "Initial draft conviction — refine scenarios on the thesis page.",
    origin: "user",
    hiddenDriver: placeholder,
    likelyPath: placeholder,
    marketMisread: "",
    tradeExpression: placeholder,
    whyNow: "Add the catalyst window and what changed recently.",
    whatsUnpriced: "State the single misread the tape is still carrying.",
    trigger: "Define the observable gate that proves the thesis is live.",
    trade: "Describe the risk-defined expression in words; levels live in Trade plan after quotes load.",
    invalidation: "Write the stand-down that retires the idea cleanly.",
    horizon: "Weeks to quarters (edit to match your clock)",
    advisoryAction: "watch",
    lastUpdated: now,
    qualification: "emerging",
    scores: {
      driverStrength: 10,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 8,
      triggerClarityScore: 8,
      total: 46,
    },
    theme: "macro",
    thesisCascade: {
      l1Confirmed: "Facts that are already true in the market tape.",
      l2ThisQuarter: "What can shift over the next few weeks.",
      l3ThisYear: "How payoff extends if the thesis works.",
      l4Backdrop2026: "Structural bias that supports or fights the idea this year.",
    },
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
  };

  return normalizeThesisNarrativeFields(shell);
}
