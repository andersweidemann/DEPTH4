import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { normalizeInsiderFlowForDb, scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import { normalizeThesisNarrativeFields, thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import { buildAnatomyFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import {
  createThesisMutationService,
  isThesisMutationEnabled,
  normalizeUpdateReason,
} from "@/lib/thesis-mutation";
import { resolveIncentiveAnalysisColumn } from "@/lib/thesis/resolve-incentive-analysis-column";
import { fetchThesisRowBySlug } from "@/lib/thesis-engine-v2/fetch-thesis-row-by-slug";
import { THESIS_ORIGIN_USER } from "@/lib/thesis-engine-v2/thesis-db-origins";
import { userThesisUpdateMutationMeta } from "@/lib/thesis-mutation/user-thesis-update-mutation-meta";
import { enforceThesisQualityGate } from "@/lib/thesis/enforce-thesis-quality-gate";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import {
  populateUserThesisBody,
  shouldAutoPopulateUserThesisBody,
} from "@/lib/thesis/populate-user-thesis-body";
import {
  initialStatusFromQualityReport,
  qualityGateInputFromEngineThesis,
  qualityChecksToJson,
  runQualityGate,
} from "@/lib/thesis/quality-gate";

export const runtime = "nodejs";

/** User thesis detail must not be statically cached — cron updates scenario_probabilities + body in Supabase. */
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set<ThesisStatus>([
  "forming",
  "watching",
  "ready",
  "active",
  "resolved",
  "invalidated",
]);

function isThesisRecord(x: unknown): x is Thesis {
  if (!x || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.slug !== "string" || typeof t.title !== "string") return false;
  if (typeof t.status !== "string" || !ALLOWED_STATUS.has(t.status as ThesisStatus)) return false;
  return true;
}

type AuthedClient = { sb: SupabaseClient; user: { id: string } };

async function getAuthedUserThesesClient(req: NextRequest): Promise<AuthedClient | NextResponse> {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return auth;
}

/** Latest DB slice for the signed-in owner — used to refresh user thesis UI after cron / evidence updates. */
export async function GET(req: NextRequest) {
  const auth = await getAuthedUserThesesClient(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const list = req.nextUrl.searchParams.get("list");
  if (list === "1") {
    const { data, error } = await sb
      .from("theses")
      .select(
        "id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, thesis_origin, insider_flow, incentive_analysis",
      )
      .eq("owner_user_id", user.id)
      .eq("thesis_origin", THESIS_ORIGIN_USER)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, theses: data ?? [] });
  }

  const slug = (req.nextUrl.searchParams.get("slug") || "").trim();
  if (!slug || slug.length > 240) {
    return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  }

  const row = await fetchThesisRowBySlug(sb, slug, user.id);
  if (!row) return NextResponse.json({ ok: true, thesis: null });

  return NextResponse.json({
    ok: true,
    thesis: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      micro_label: row.micro_label ?? null,
      body: row.body !== undefined && row.body !== null ? row.body : null,
      scenario_probabilities: parseScenarioProbabilities(row.scenario_probabilities),
      insider_flow: row.insider_flow !== undefined && row.insider_flow !== null ? row.insider_flow : null,
      updated_at: row.updated_at ?? null,
      status: row.status,
      thesis_origin: row.thesis_origin,
      lifecycle_state: row.lifecycle_state ?? null,
      incentive_analysis: row.incentive_analysis ?? null,
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthedUserThesesClient(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const body = (await req.json().catch(() => null)) as { thesis?: unknown; updateReason?: unknown } | null;
  const rawThesis = body?.thesis;
  const updateReason = normalizeUpdateReason(body?.updateReason);
  if (!isThesisRecord(rawThesis)) return NextResponse.json({ ok: false, error: "invalid_thesis" }, { status: 400 });

  let thesis = normalizeThesisNarrativeFields(rawThesis);
  if (!thesis.structuredAnatomy) {
    thesis = { ...thesis, structuredAnatomy: buildAnatomyFromThesis(thesis) };
  }

  if (thesis.origin === "system") {
    return NextResponse.json({ ok: false, error: "system_thesis_readonly" }, { status: 403 });
  }

  if (isSystemThesisId(thesis.id)) {
    return NextResponse.json({ ok: false, error: "system_thesis_readonly" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  const { data: existing, error: selErr } = await sb
    .from("theses")
    .select("id, owner_user_id, incentive_analysis, status")
    .eq("id", thesis.id)
    .maybeSingle();

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 });

  const incentiveColumn = await resolveIncentiveAnalysisColumn(
    thesis,
    (existing as { incentive_analysis?: unknown } | null)?.incentive_analysis,
    !existing,
  );

  const qualityReport = runQualityGate(qualityGateInputFromEngineThesis(thesis), null, []);
  let resolvedStatus = thesis.status;
  if (!existing) {
    resolvedStatus = initialStatusFromQualityReport(qualityReport);
  } else {
    const prevStatus =
      typeof (existing as { status?: unknown }).status === "string"
        ? (existing as { status: string }).status
        : "forming";
    if (prevStatus !== thesis.status) {
      const gate = await enforceThesisQualityGate(sb, thesis.id, prevStatus, thesis.status);
      if (!gate.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: gate.code,
            score: gate.report.score,
            blockers: gate.report.blockers,
            checks: gate.report.checks,
            message: gate.message,
            ...(gate.downgradeTo ? { downgradeTo: gate.downgradeTo } : {}),
            ...(gate.required != null ? { required: gate.required } : {}),
          },
          { status: 400 },
        );
      }
    }
  }

  const baseRow = {
    id: thesis.id,
    title: thesis.title,
    status: resolvedStatus,
    quality_score: qualityReport.score,
    quality_checks: qualityChecksToJson(qualityReport.checks),
    promotion_blocked_reason:
      qualityReport.blockers.length > 0 ? qualityReport.blockers.join(", ") : null,
    thesis_origin: "user" as const,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    insider_flow: normalizeInsiderFlowForDb(thesis.insiderFlow),
    slug: thesis.slug,
    owner_user_id: user.id,
    updated_at: nowIso,
    body: thesisToDbBodyPayload(thesis),
    ...(incentiveColumn !== undefined ? { incentive_analysis: incentiveColumn } : {}),
  };
  const insertRow = { ...baseRow, created_at: nowIso };

  if (existing) {
    const owner = (existing as { owner_user_id?: string | null }).owner_user_id;
    if (owner && owner !== user.id) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (!owner) {
      return NextResponse.json({ ok: false, error: "system_thesis_readonly" }, { status: 403 });
    }
    if (isThesisMutationEnabled()) {
      try {
        const mutation = createThesisMutationService(sb);
        await mutation.updateThesis(thesis.id, baseRow, userThesisUpdateMutationMeta(user.id, updateReason));
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "update_failed" }, { status: 400 });
      }
    } else {
      const { error: upErr } = await sb.from("theses").update(baseRow).eq("id", thesis.id).eq("owner_user_id", user.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
    }
  } else {
    if (isThesisMutationEnabled()) {
      try {
        const mutation = createThesisMutationService(sb);
        await mutation.createThesis(insertRow, {
          actorType: "user",
          actorId: user.id,
          reason: "User thesis insert via PUT /api/user/theses",
        });
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "insert_failed" }, { status: 400 });
      }
    } else {
      const { error: insErr } = await sb.from("theses").insert(insertRow);
      if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }
    if (shouldAutoPopulateUserThesisBody(insertRow.body)) {
      const admin = createServiceRoleClient();
      if (admin) {
        const assetSymbol = thesis.asset?.split(/[\s—–-]/)[0]?.trim() || thesis.title;
        void populateUserThesisBody(admin, thesis.id, {
          title: thesis.title,
          assetSymbol,
          direction: thesis.direction,
          timeHorizon: thesis.horizon || "weeks",
        }).catch((e) => {
          console.warn("[PUT /api/user/theses] populateUserThesisBody failed", {
            thesisId: thesis.id,
            message: e instanceof Error ? e.message : String(e),
          });
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
