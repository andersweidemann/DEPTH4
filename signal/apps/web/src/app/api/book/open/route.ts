import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadThesisDetailBundleForApi } from "@/lib/thesis-engine-v2/load-thesis-api-bundle";
import type { Position as BookPosition } from "@/lib/thesis-engine-v2/types";
import type { Position as ApiPosition } from "@/types/position";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapOne(p: BookPosition, slug: string, title: string): ApiPosition {
  return {
    id: p.id,
    thesisSlug: slug,
    thesisTitle: title,
    direction: p.side === "short" ? "short" : "long",
    status: p.tradeStatus === "open" ? "open" : p.tradeStatus === "stopped" ? "stopped" : "closed",
    entryPrice: typeof p.entryPrice === "number" ? p.entryPrice : 0,
    exitPrice: typeof p.exitPrice === "number" ? p.exitPrice : undefined,
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    session: "synced",
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const thesisSlug = typeof o.thesisSlug === "string" ? o.thesisSlug.trim() : "";
  const direction = o.direction === "short" ? "short" : o.direction === "long" ? "long" : "";
  const entryPrice = typeof o.entryPrice === "number" && Number.isFinite(o.entryPrice) ? o.entryPrice : NaN;
  if (!thesisSlug || !direction || Number.isNaN(entryPrice)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const bundle = await loadThesisDetailBundleForApi(supabase, thesisSlug, user.id);
  if (!bundle) {
    return NextResponse.json({ error: "thesis_not_found" }, { status: 404 });
  }

  const t = bundle.thesis;
  const title = t.title;
  const nowIso = new Date().toISOString();
  const pos: BookPosition = {
    id: randomUUID(),
    symbol: t.asset,
    side: direction,
    linkedThesisId: t.id,
    thesisStatus: t.status,
    tradeStatus: "open",
    openedAt: nowIso,
    entryPrice,
    recommendation: t.advisoryAction,
    probability: t.probability,
    latestUpdate: "Opened from Book",
  };

  const { data, error } = await supabase
    .from("depth4_user_book")
    .select("positions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const raw = (data as { positions?: unknown } | null)?.positions;
  const arr = Array.isArray(raw) ? (raw as BookPosition[]) : [];
  const next = [...arr, pos];

  const { error: upErr } = await supabase.from("depth4_user_book").upsert(
    {
      user_id: user.id,
      positions: next,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ position: mapOne(pos, thesisSlug, title) });
}
