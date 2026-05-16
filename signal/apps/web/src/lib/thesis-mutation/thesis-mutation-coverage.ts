import { isThesisMutationEnabled } from "@/lib/thesis-mutation/feature-flags";

/** How a known thesis write path relates to the mutation audit rail. */
export type ThesisMutationPathMode =
  | "mutation_when_flag_on"
  | "legacy_when_flag_off"
  | "direct_unaudited";

export type ThesisMutationPathEntry = {
  id: string;
  label: string;
  mode: ThesisMutationPathMode;
  /** Expected `thesis_updates.actor_type` values when audited. */
  actorTypes?: string[];
  notes?: string;
};

/**
 * Registry of important TypeScript thesis mutation paths (repo-audited, Phase 2B).
 * Python / external jobs are listed as out-of-scope for this TS surface.
 */
export const THESIS_MUTATION_PATH_REGISTRY: ThesisMutationPathEntry[] = [
  {
    id: "cron_thesis_surfacing",
    label: "GET/POST /api/cron/thesis-surfacing",
    mode: "mutation_when_flag_on",
    actorTypes: ["scheduler"],
  },
  {
    id: "cron_thesis_news",
    label: "GET/POST /api/cron/thesis-news (scenario apply)",
    mode: "mutation_when_flag_on",
    actorTypes: ["news"],
  },
  {
    id: "macro_persist_event_reasoning",
    label: "persistEventReasoningToThesisState",
    mode: "mutation_when_flag_on",
    actorTypes: ["macro"],
  },
  {
    id: "ensure_ai_thesis_for_cluster",
    label: "ensureAiThesisForDiscoveryCluster",
    mode: "mutation_when_flag_on",
    actorTypes: ["macro"],
    notes: "Create-only; idempotent per discovery_cluster_id",
  },
  {
    id: "post_api_theses",
    label: "POST /api/theses (user create)",
    mode: "mutation_when_flag_on",
    actorTypes: ["user"],
  },
  {
    id: "put_user_theses",
    label: "PUT /api/user/theses (user create/update)",
    mode: "mutation_when_flag_on",
    actorTypes: ["user"],
  },
  {
    id: "insider_flow_cron",
    label: "insider-flow cron",
    mode: "direct_unaudited",
    notes: "Writes flow_anomalies + thesis_evidence_log only; no public.theses updates",
  },
  {
    id: "python_scenario_refinement",
    label: "Python signal_api scenario_refinement",
    mode: "direct_unaudited",
    notes: "Outside TS audit surface (documented deferral)",
  },
];

export type MutationCoverageReport = {
  flagEnabled: boolean;
  paths: Array<
    ThesisMutationPathEntry & {
      effectiveLabel: string;
    }
  >;
  audit24hByActor: Record<string, number>;
  audit24hTotal: number;
  /** Not stored in DB today; surfaced via cron JSON when flag is on. */
  auditFailures24h: null;
  auditFailureTracking: string;
  warnings: string[];
};

const ENGINE_ACTOR_TYPES = ["scheduler", "news", "macro"] as const;

export function buildMutationCoverageReport(audit24hByActor: Record<string, number>): MutationCoverageReport {
  const flagEnabled = isThesisMutationEnabled();
  const audit24hTotal = Object.values(audit24hByActor).reduce((s, n) => s + n, 0);

  const paths = THESIS_MUTATION_PATH_REGISTRY.map((p) => ({
    ...p,
    effectiveLabel:
      p.mode === "mutation_when_flag_on"
        ? flagEnabled
          ? "Mutation-backed (USE_THESIS_MUTATION)"
          : "Legacy direct write (flag off)"
        : p.mode === "legacy_when_flag_off"
          ? "Legacy fallback when flag off"
          : "Direct / out of scope",
  }));

  const warnings: string[] = [];
  if (flagEnabled && audit24hTotal === 0) {
    warnings.push("USE_THESIS_MUTATION is on but no thesis_updates rows in the last 24h.");
  }
  if (flagEnabled) {
    for (const actor of ENGINE_ACTOR_TYPES) {
      if ((audit24hByActor[actor] ?? 0) === 0) {
        warnings.push(`No ${actor} actor updates in 24h — check that the matching cron ran successfully.`);
      }
    }
  }

  return {
    flagEnabled,
    paths,
    audit24hByActor,
    audit24hTotal,
    auditFailures24h: null,
    auditFailureTracking:
      "Audit write failures are not persisted to thesis_updates; they revert the thesis row and appear in cron JSON as audit_failures / thesis_audit_failures.",
    warnings,
  };
}
