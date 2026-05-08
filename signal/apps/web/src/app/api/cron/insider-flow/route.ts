import { NextRequest, NextResponse } from "next/server";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { buildMockMarketSnapshot } from "@/lib/thesis-engine-v2/insider-flow/mock-market";
import { detectInsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/detect";
import type { InsiderFlowAnomaly } from "@/lib/thesis-engine-v2/insider-flow/types";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function collectMonitoredTheses(theses: Thesis[]): Thesis[] {
  return theses.filter((t) => {
    const cfg = t.insiderFlow;
    if (!cfg) return false;
    const hasInstruments = (cfg.bullInstruments?.length ?? 0) + (cfg.bearInstruments?.length ?? 0) > 0;
    const hasTags = (cfg.confirmTags?.length ?? 0) > 0;
    return hasInstruments && hasTags;
  });
}

export async function GET(req: NextRequest) {
  // Minimal protection for cron: allow if no secret set (local), else require header match.
  const secret = (process.env.INSIDER_FLOW_CRON_SECRET ?? "").trim();
  if (secret) {
    const got = (req.headers.get("x-insider-flow-secret") ?? "").trim();
    if (!got || got !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const nowMs = Date.now();
  const theses = collectMonitoredTheses(MOCK_THESES);

  // Recent headlines (MVP): use thesis titles + mock “desk” updates as a stand-in.
  const recentHeadlines = MOCK_THESES.slice(0, 12).map((t) => ({ headline: t.title, atMs: nowMs - 8 * 60_000 }));

  const symbols = Array.from(
    new Set(
      theses.flatMap((t) => [
        ...(t.insiderFlow?.bullInstruments ?? []),
        ...(t.insiderFlow?.bearInstruments ?? []),
      ]),
    ),
  );
  const market = buildMockMarketSnapshot(nowMs, symbols);

  const anomalies: InsiderFlowAnomaly[] = [];
  for (const t of theses) {
    const cfg = t.insiderFlow!;
    const a = detectInsiderFlowAnomaly({
      nowMs,
      thesisId: t.id,
      thesisTitle: t.title,
      bullInstruments: cfg.bullInstruments ?? [],
      bearInstruments: cfg.bearInstruments ?? [],
      confirmTags: cfg.confirmTags ?? [],
      recentHeadlines,
      market,
    });
    if (a) anomalies.push(a);
  }

  // Optional DB write (only if Supabase env present + service role key is provided).
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (url && anon && service && anomalies.length) {
    // Service-role write for cron only (no user context).
    const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } });
    await admin
      .from("flow_anomalies")
      .insert(
        anomalies.map((a) => ({
          thesis_id: a.thesisId,
          thesis_title: a.thesisTitle,
          pattern_type: a.patternType,
          status: a.status,
          instruments_moved: a.instrumentsMoved,
          return_data: {},
          volume_multiple: a.instrumentsMoved.reduce((m, x) => Math.max(m, x.volume_multiple), 0),
          z_score: a.instrumentsMoved.reduce((m, x) => Math.max(m, Math.abs(x.z_score)), 0),
          matched_tags: a.matchedTags,
          confirmed_headline_at: a.confirmedHeadlineAt ? new Date(a.confirmedHeadlineAt).toISOString() : null,
          invalidated_at: a.invalidatedAt ? new Date(a.invalidatedAt).toISOString() : null,
          notes: a.notes ?? null,
        })),
      )
      .throwOnError();
  }

  return NextResponse.json({ ok: true, nowMs, anomalies });
}

