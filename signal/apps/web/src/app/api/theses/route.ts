import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { buildThesesListResponse } from "@/lib/theses/theses-list-response";
import { buildDraftUserThesisFromForm } from "@/lib/theses/draft-user-thesis";
import {
  normalizeThesisNarrativeFields,
  thesisToDbBodyPayload,
} from "@/lib/thesis-engine-v2/thesis-db-body";
import { buildAnatomyFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import {
  normalizeInsiderFlowForDb,
  scenarioProbabilitiesForDb,
} from "@/lib/thesis-engine-v2/insider-flow-config";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { parseIncentiveAnalysis } from "@/lib/thesis/incentive-analysis";
import { resolveIncentiveAnalysisColumn } from "@/lib/thesis/resolve-incentive-analysis-column";
import { createThesisMutationService, isThesisMutationEnabled } from "@/lib/thesis-mutation";
import { applyThesisEventLink } from "@/lib/causal-graph/apply-thesis-event-link";
import { loadEventLinkContext, resolveEventId } from "@/lib/causal-graph/load-event-link-context";
import { validateThesisEventLink } from "@/lib/causal-graph/causal-validator";
import { thesisLinkInputFromThesis } from "@/lib/causal-graph/thesis-link-input";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isThesisRecord(x: unknown): x is Thesis {
  if (!x || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.slug === "string" && typeof t.title === "string" && typeof t.status === "string";
}

export async function GET(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const starred = sp.get("starred") === "true";
  const status = sp.get("status")?.trim() || "";
  const assetClass = sp.get("assetClass")?.trim() || "All";
  const sort = sp.get("sort")?.trim() || "recent";

  const payload = await buildThesesListResponse(auth.sb, auth.user.id, {
    starred: starred || undefined,
    status: status || undefined,
    assetClass: assetClass || undefined,
    sort: sort || undefined,
  });
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sb, user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const statement = typeof o.statement === "string" ? o.statement : "";
  const asset = typeof o.asset === "string" ? o.asset : "";
  const direction = o.direction === "short" ? "short" : o.direction === "long" ? "long" : "";
  if (!statement.trim() || !asset.trim() || !direction) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const id = randomUUID();
  let thesis = normalizeThesisNarrativeFields(buildDraftUserThesisFromForm({ statement, asset, direction, id }));
  if (!thesis.structuredAnatomy) {
    thesis = { ...thesis, structuredAnatomy: buildAnatomyFromThesis(thesis) };
  }
  const fromBody = parseIncentiveAnalysis(o.incentive_analysis);
  if (fromBody) thesis = { ...thesis, incentiveAnalysis: fromBody };
  if (thesis.origin === "system" || isSystemThesisId(thesis.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const incentiveColumn = await resolveIncentiveAnalysisColumn(thesis, null, true);

  const eventIdRaw =
    typeof o.eventId === "string"
      ? o.eventId
      : typeof o.causalEventId === "string"
        ? o.causalEventId
        : undefined;
  const eventSlugRaw =
    typeof o.eventSlug === "string" ? o.eventSlug : typeof o.causalEventSlug === "string" ? o.causalEventSlug : undefined;

  let pendingEventId: string | null = null;
  if (eventIdRaw || eventSlugRaw) {
    const admin = createServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }
    pendingEventId = await resolveEventId(admin, { eventId: eventIdRaw, eventSlug: eventSlugRaw });
    if (!pendingEventId) {
      return NextResponse.json({ error: "event_not_found" }, { status: 404 });
    }
    const linkCtx = await loadEventLinkContext(admin, pendingEventId);
    if (!linkCtx) {
      return NextResponse.json({ error: "event_not_found" }, { status: 404 });
    }
    const validation = validateThesisEventLink(thesisLinkInputFromThesis(thesis), linkCtx.event, linkCtx.clusterTheses);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "causal_validation_failed", details: validation.errors, warnings: validation.warnings },
        { status: 400 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const row = {
    id: thesis.id,
    title: thesis.title,
    status: thesis.status,
    thesis_origin: "user" as const,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    insider_flow: normalizeInsiderFlowForDb(thesis.insiderFlow),
    slug: thesis.slug,
    owner_user_id: user.id,
    updated_at: nowIso,
    body: thesisToDbBodyPayload(thesis),
    created_at: nowIso,
    ...(incentiveColumn != null ? { incentive_analysis: incentiveColumn } : {}),
  };

  try {
    if (isThesisMutationEnabled()) {
      const mutation = createThesisMutationService(sb);
      await mutation.createThesis(row, {
        actorType: "user",
        actorId: user.id,
        reason: "User created thesis via POST /api/theses",
      });
    } else {
      const { error: insErr } = await sb.from("theses").insert(row);
      if (insErr) {
        const msg = insErr.message.toLowerCase();
        if (msg.includes("duplicate") || msg.includes("unique")) {
          return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
        }
        return NextResponse.json({ error: insErr.message }, { status: 400 });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert_failed";
    if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "slug_conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (pendingEventId) {
    const admin = createServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }
    const linked = await applyThesisEventLink(admin, {
      thesisId: thesis.id,
      eventId: pendingEventId,
      thesisForValidation: thesisLinkInputFromThesis(thesis),
    });
    if (!linked.ok) {
      await admin.from("theses").delete().eq("id", thesis.id);
      return NextResponse.json(
        {
          error: linked.error,
          details: linked.validation.errors,
          warnings: linked.validation.warnings,
        },
        { status: linked.status },
      );
    }
    return NextResponse.json({
      success: true,
      thesis: isThesisRecord(thesis) ? { slug: thesis.slug, id: thesis.id, eventId: pendingEventId } : null,
      warnings: linked.validation.warnings,
    });
  }

  return NextResponse.json({ success: true, thesis: isThesisRecord(thesis) ? { slug: thesis.slug, id: thesis.id } : null });
}
