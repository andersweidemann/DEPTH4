import { findComplianceViolations, textLikelyNeedsComplianceRewrite } from "@/lib/thesis/thesis-language-compliance-audit";
import { rewriteThesisLanguage } from "@/lib/thesis/rewrite-thesis-language";

export type BodyStringFieldRef = {
  /** Dot path for logs, e.g. `trade_plan.rationale` */
  path: string;
  value: string;
};

const TOP_LEVEL_STRING_KEYS = [
  "summary",
  "narrative",
  "one_line_summary",
  "thesis_statement",
  "why_thesis_exists",
  "hidden_driver",
  "likely_path",
  "market_misread",
  "trade_expression",
  "why_now",
  "whats_unpriced",
  "trigger",
  "trade",
  "invalidation",
  "time_stop",
  "horizon",
  "probability_rationale",
  "risk_factors",
] as const;

const CASCADE_KEYS = ["l1_confirmed", "l2_this_quarter", "l3_this_year", "l4_backdrop_2026"] as const;

const SCENARIO_LEG_KEYS = ["base", "bull", "bear"] as const;

function strField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 8 ? t : null;
}

function setAtPath(body: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = body;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      cur[key] = created;
      cur = created;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Collect rewritable string fields from a `public.theses.body` JSON object. */
export function collectRewritableBodyFields(body: unknown): BodyStringFieldRef[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const o = body as Record<string, unknown>;
  const refs: BodyStringFieldRef[] = [];

  for (const key of TOP_LEVEL_STRING_KEYS) {
    const v = strField(o[key]);
    if (v) refs.push({ path: key, value: v });
  }

  const tp = (o.trade_plan ?? o.tradePlan) as Record<string, unknown> | undefined;
  if (tp && typeof tp === "object" && !Array.isArray(tp)) {
    const rationale = strField(tp.rationale);
    if (rationale) refs.push({ path: "trade_plan.rationale", value: rationale });
  }

  const rp = (o.resolution_paths ?? o.resolutionPaths) as Record<string, unknown> | undefined;
  if (rp && typeof rp === "object" && !Array.isArray(rp)) {
    for (const leg of ["clean", "messy", "broken"] as const) {
      const v = strField(rp[leg]);
      if (v) refs.push({ path: `resolution_paths.${leg}`, value: v });
    }
  }

  const cascade = o.thesis_cascade as Record<string, unknown> | undefined;
  if (cascade && typeof cascade === "object" && !Array.isArray(cascade)) {
    for (const key of CASCADE_KEYS) {
      const v = strField(cascade[key]);
      if (v) refs.push({ path: `thesis_cascade.${key}`, value: v });
    }
  }

  const overrides = (o.scenario_overrides ?? o.scenarioOverrides) as Record<string, unknown> | undefined;
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const leg of SCENARIO_LEG_KEYS) {
      const L = overrides[leg];
      if (!L || typeof L !== "object" || Array.isArray(L)) continue;
      const row = L as Record<string, unknown>;
      const conf = strField(row.confirmation);
      const cons = strField(row.market_consequence ?? row.marketConsequence);
      if (conf) refs.push({ path: `scenario_overrides.${leg}.confirmation`, value: conf });
      if (cons) refs.push({ path: `scenario_overrides.${leg}.market_consequence`, value: cons });
    }
  }

  return refs;
}

export type BodyRewriteChange = {
  path: string;
  before: string;
  after: string;
  violations: ReturnType<typeof findComplianceViolations>;
};

export type RewriteThesisBodyResult = {
  body: Record<string, unknown>;
  changed: boolean;
  changes: BodyRewriteChange[];
  fieldsScanned: number;
  fieldsSkippedClean: number;
};

export type RewriteThesisBodyOptions = {
  /** When true, compute changes but do not call the LLM. */
  dryRun?: boolean;
  rewriteFn?: (text: string) => Promise<string>;
};

/**
 * Rewrite compliance-risk strings inside a thesis body in place (new object returned).
 */
export async function rewriteThesisBody(
  body: unknown,
  options?: RewriteThesisBodyOptions,
): Promise<RewriteThesisBodyResult> {
  const base =
    body && typeof body === "object" && !Array.isArray(body)
      ? ({ ...(body as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const refs = collectRewritableBodyFields(base);
  const rewriteFn = options?.rewriteFn ?? rewriteThesisLanguage;
  const changes: BodyRewriteChange[] = [];
  let fieldsSkippedClean = 0;

  for (const ref of refs) {
    if (!textLikelyNeedsComplianceRewrite(ref.value)) {
      fieldsSkippedClean += 1;
      continue;
    }

    if (options?.dryRun) {
      changes.push({
        path: ref.path,
        before: ref.value,
        after: ref.value,
        violations: findComplianceViolations(ref.value),
      });
      continue;
    }

    const after = await rewriteFn(ref.value);
    if (after.trim() !== ref.value.trim()) {
      setAtPath(base, ref.path, after);
      changes.push({
        path: ref.path,
        before: ref.value,
        after,
        violations: findComplianceViolations(ref.value),
      });
    }
  }

  return {
    body: base,
    changed: changes.some((c) => c.before.trim() !== c.after.trim()),
    changes,
    fieldsScanned: refs.length,
    fieldsSkippedClean,
  };
}
