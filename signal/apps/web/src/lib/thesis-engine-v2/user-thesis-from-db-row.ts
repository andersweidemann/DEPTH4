import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { insiderFlowFromDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { mergeUserThesisWithServerCatalog } from "@/lib/thesis-engine-v2/user-thesis-server-merge";

const ALLOWED = new Set<ThesisStatus>(["forming", "watching", "ready", "active", "resolved", "invalidated"]);

/** Rebuild a client `Thesis` from a `public.theses` row owned by the signed-in user. */
export function userThesisFromSupabaseRow(row: {
  id: string;
  slug: string;
  title: string;
  micro_label?: string | null;
  body?: unknown;
  scenario_probabilities?: unknown;
  status: string;
  insider_flow?: unknown;
  updated_at?: string | null;
}): Thesis {
  const st = ALLOWED.has(row.status as ThesisStatus) ? (row.status as ThesisStatus) : "watching";
  const shell: Thesis = {
    id: row.id,
    slug: row.slug,
    title: row.title || "Untitled thesis",
    thesisStatement: row.title || "Untitled thesis",
    microLabel: row.micro_label ?? null,
    asset: "—",
    direction: "watch",
    probability: 50,
    status: st,
    probabilityRationale: "Synced from your account.",
    origin: "user",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: "",
    horizon: "—",
    advisoryAction: "watch",
    lastUpdated: row.updated_at ? `Synced · ${row.updated_at}` : "Synced",
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
    insiderFlow: insiderFlowFromDb(row.insider_flow),
  };

  let t = mergeDbBodyIntoThesis(shell, row.body ?? null);
  t = mergeUserThesisWithServerCatalog(
    t,
    {
      title: row.title,
      microLabel: row.micro_label ?? null,
      body: row.body ?? null,
      scenarioProbabilities: parseScenarioProbabilities(row.scenario_probabilities),
    },
    { forceApplyDbProbabilities: true },
  );
  return t;
}
