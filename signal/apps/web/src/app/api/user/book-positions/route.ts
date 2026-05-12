import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseUser } from "@/lib/auth/supabase-route-client";
import type { Position } from "@/lib/thesis-engine-v2/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPosition(x: unknown): x is Position {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.symbol === "string" &&
    (p.side === "long" || p.side === "short") &&
    typeof p.linkedThesisId === "string" &&
    typeof p.openedAt === "string" &&
    typeof p.tradeStatus === "string"
  );
}

/** GET — account Book positions (source of truth). */
export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;
  const sb: SupabaseClient = auth.supabase;
  const { user } = auth;

  const { data, error } = await sb.from("depth4_user_book").select("positions,updated_at").eq("user_id", user.id).maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const raw = (data as { positions?: unknown } | null)?.positions;
  const arr = Array.isArray(raw) ? raw : [];
  const positions = arr.filter(isPosition);

  return NextResponse.json({
    ok: true,
    positions,
    updated_at: (data as { updated_at?: string } | null)?.updated_at ?? null,
  });
}

/** PATCH — replace Book positions for the signed-in user (full array). */
export async function PATCH(req: NextRequest) {
  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return auth.response;
  const sb: SupabaseClient = auth.supabase;
  const { user } = auth;

  const body = (await req.json().catch(() => null)) as { positions?: unknown } | null;
  const raw = body?.positions;
  if (!Array.isArray(raw)) return NextResponse.json({ ok: false, error: "invalid_positions" }, { status: 400 });
  const positions = raw.filter(isPosition);
  if (positions.length !== raw.length) {
    return NextResponse.json({ ok: false, error: "invalid_position_shape" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await sb.from("depth4_user_book").upsert(
    {
      user_id: user.id,
      positions,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
