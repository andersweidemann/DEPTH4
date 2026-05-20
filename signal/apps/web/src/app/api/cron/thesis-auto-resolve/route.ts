import { NextRequest, NextResponse } from "next/server";
import { assertCronSecret } from "@/lib/cron-auth";
import { runAutoResolutionForThesis } from "@/lib/thesis/auto-resolution-logger";
import { mergeDbBodyIntoThesis } from "@/lib/thesis-engine-v2/thesis-db-body";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE = ["forming", "watching", "ready", "active"] as const;

function thesisFromRow(row: Record<string, unknown>): Thesis | null {
  const id = String(row.id ?? "");
  const slug = String(row.slug ?? "");
  const title = String(row.title ?? "");
  if (!id || !slug) return null;
  const status = String(row.status ?? "watching");
  let t = userThesisFromSupabaseRow({
    id,
    slug,
    title,
    micro_label: typeof row.micro_label === "string" ? row.micro_label : null,
    body: row.body,
    scenario_probabilities: row.scenario_probabilities,
    status,
    insider_flow: row.insider_flow,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  });
  t = mergeDbBodyIntoThesis(t, row.body ?? null);
  return t;
}

export async function GET(req: NextRequest) {
  const denied = assertCronSecret(req);
  if (denied) return denied;

  const sb = createServiceRoleClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const { data: rows, error } = await sb
    .from("theses")
    .select("id, slug, title, micro_label, body, status, scenario_probabilities, insider_flow, created_at, updated_at, thesis_origin")
    .in("status", [...LIVE])
    .limit(120);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let scanned = 0;
  let logged = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    scanned += 1;
    const r = row as Record<string, unknown>;
    const slug = String(r.slug ?? "");
    let thesis: Thesis | null = thesisFromRow(r);
    if (!thesis) {
      const catalog = getThesisDetail(slug);
      thesis = catalog?.thesis ?? null;
      if (thesis) thesis = mergeDbBodyIntoThesis(thesis, r.body ?? null);
    }
    if (!thesis) continue;

    try {
      const result = await runAutoResolutionForThesis(
        sb,
        thesis,
        slug,
        typeof r.created_at === "string" ? r.created_at : null,
      );
      if (result.logged) logged += 1;
    } catch (e) {
      errors.push(`${slug}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    logged,
    errors: errors.slice(0, 10),
  });
}
