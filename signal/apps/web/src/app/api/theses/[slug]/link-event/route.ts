import { NextRequest, NextResponse } from "next/server";
import { applyThesisEventLink } from "@/lib/causal-graph/apply-thesis-event-link";
import { thesisLinkInputFromThesis } from "@/lib/causal-graph/thesis-link-input";
import { loadEventLinkContext, resolveEventId } from "@/lib/causal-graph/load-event-link-context";
import { validateThesisEventLink } from "@/lib/causal-graph/causal-validator";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await ctx.params;
  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const eventId = await resolveEventId(admin, {
    eventId: typeof o.eventId === "string" ? o.eventId : undefined,
    eventSlug: typeof o.eventSlug === "string" ? o.eventSlug : undefined,
  });
  if (!eventId) {
    return NextResponse.json({ error: "missing_event" }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await auth.sb
    .from("theses")
    .select("id, slug, title, owner_user_id, body, status, scenario_probabilities, micro_label, thesis_origin")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "thesis_not_found" }, { status: 404 });
  }
  if (row.owner_user_id !== auth.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let thesis: Thesis = {
    id: String(row.id),
    slug: String(row.slug ?? slug),
    title: String(row.title),
    thesisStatement: String(row.title),
    asset: "—",
    direction: "long",
    probability: 50,
    status: "forming",
    lastUpdated: new Date().toISOString(),
    origin: row.thesis_origin === "user" ? "user" : "system",
  } as Thesis;
  if (row.body) thesis = mergeDbBodyIntoThesis(thesis, row.body);

  const linkCtx = await loadEventLinkContext(admin, eventId, String(row.id));
  if (!linkCtx) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  const thesisInput = thesisLinkInputFromThesis(thesis);
  const validation = validateThesisEventLink(thesisInput, linkCtx.event, linkCtx.clusterTheses);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "causal_validation_failed", details: validation.errors, warnings: validation.warnings },
      { status: 400 },
    );
  }

  const applied = await applyThesisEventLink(admin, {
    thesisId: String(row.id),
    eventId,
    thesisForValidation: thesisInput,
    isPrimary: o.isPrimary !== false,
  });

  if (!applied.ok) {
    return NextResponse.json(
      {
        error: applied.error,
        details: applied.validation.errors,
        warnings: applied.validation.warnings,
      },
      { status: applied.status },
    );
  }

  return NextResponse.json({
    success: true,
    eventId,
    warnings: applied.validation.warnings,
  });
}
