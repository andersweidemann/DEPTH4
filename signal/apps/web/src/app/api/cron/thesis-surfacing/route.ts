import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";
import {
  buildSurfacingPreferenceFromRow,
  loadCatalogEngineTheses,
} from "@/lib/theses/load-catalog-engine-theses";
import { partitionHomeBuckets, surfacedBucketForEngineThesis, thesisMapHomeRankScore } from "@/lib/theses/thesis-home-surfacing";
import { effectiveLifecycleState, isTerminalThesis } from "@/lib/theses/thesis-lifecycle";
import { isThesisMapListableThesis } from "@/lib/theses/thesis-surfacing-quality";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import {
  peekSystemMutationCounters,
  resetSystemMutationCounters,
  SYSTEM_MUTATION,
  systemUpdateThesis,
} from "@/lib/thesis-mutation";

export const runtime = "nodejs";

function parseUpdatedMs(v: string): number {
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return 0;
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runThesisSurfacing();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runThesisSurfacing();
}

async function runThesisSurfacing() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;
  resetSystemMutationCounters();

  const { catalogEngine, dbSurfacingByThesisId: catalogSurfacing } = await loadCatalogEngineTheses(admin);

  const { data: aiRows } = await admin
    .from("theses")
    .select(
      "id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, insider_flow, lifecycle_state, surfaced_bucket, thesis_score, outcome_label, thesis_origin",
    )
    .eq("thesis_origin", "ai_generated")
    .order("updated_at", { ascending: false })
    .limit(200);

  const aiEngine = (aiRows ?? []).map((row) =>
    userThesisFromSupabaseRow(row as Parameters<typeof userThesisFromSupabaseRow>[0]),
  );

  const surfacingByThesisId = new Map<string, ReturnType<typeof buildSurfacingPreferenceFromRow>>();
  for (const row of aiRows ?? []) {
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id) surfacingByThesisId.set(id, buildSurfacingPreferenceFromRow(r));
  }
  catalogSurfacing.forEach((pref, id) => {
    surfacingByThesisId.set(id, pref);
  });

  const lifecycleInputFor = (t: { id: string; status: string }) => ({
    lifecycle_state: surfacingByThesisId.get(t.id)?.lifecycle_state,
    status: t.status,
  });

  const combinedAll = [...catalogEngine, ...aiEngine];
  const combinedListable = combinedAll.filter((t) => isThesisMapListableThesis(t));
  const combinedLive = combinedListable.filter((t) => !isTerminalThesis(lifecycleInputFor(t)));
  const partition = partitionHomeBuckets(combinedLive, {
    effectiveLifecycleFor: (t) => effectiveLifecycleState(lifecycleInputFor(t)),
  });
  const nowIso = new Date().toISOString();

  let updated = 0;
  let auditFailures = 0;
  const errors: string[] = [];

  for (const t of combinedAll) {
    let evidenceMs = 0;
    const ev = await admin
      .from("thesis_evidence_log")
      .select("created_at")
      .eq("thesis_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ev.error) {
      errors.push(`${t.id}:evidence:${ev.error.message}`);
    } else if (ev.data && typeof (ev.data as { created_at?: unknown }).created_at === "string") {
      evidenceMs = parseUpdatedMs((ev.data as { created_at: string }).created_at);
    }

    const thesisMs = parseUpdatedMs(t.lastUpdated);
    const meaningfulMs = Math.max(thesisMs, evidenceMs);
    const lastMeaningfulIso = meaningfulMs > 0 ? new Date(meaningfulMs).toISOString() : nowIso;

    const lifecycle = effectiveLifecycleState(lifecycleInputFor(t));
    const surfacedBucket =
      isThesisMapListableThesis(t) && !isTerminalThesis(lifecycleInputFor(t))
        ? surfacedBucketForEngineThesis(t, partition, lifecycle)
        : null;
    const thesisScore = Math.round(thesisMapHomeRankScore(t));

    const patch = {
      surfaced_bucket: surfacedBucket,
      thesis_score: thesisScore,
      last_meaningful_update_at: lastMeaningfulIso,
      surfacing_computed_at: nowIso,
    };

    const up = await systemUpdateThesis(admin, t.id, patch, {
      actorType: SYSTEM_MUTATION.scheduler.actorType,
      reason: SYSTEM_MUTATION.scheduler.surfacingReason,
      metadata: { cron: "thesis_surfacing", evidence_ms: evidenceMs, thesis_ms: thesisMs },
    });

    if (!up.ok) {
      if (up.auditFailed) auditFailures += 1;
      errors.push(`${t.id}:update:${up.error}`);
    } else {
      updated += 1;
    }
  }

  const mutationCounters = peekSystemMutationCounters();
  if (Object.keys(mutationCounters).length) {
    console.info("[thesis-surfacing] mutation_audit", mutationCounters);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    catalog_count: catalogEngine.length,
    ai_generated_count: aiEngine.length,
    rows_update_attempts: combinedAll.length,
    rows_updated_reported: updated,
    surfacing_computed_at: nowIso,
    audit_failures: auditFailures,
    mutation_counters: mutationCounters,
    errors: errors.slice(0, 50),
  });
}
