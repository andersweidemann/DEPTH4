import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Position } from "@/lib/thesis-engine-v2/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const positionId = typeof o.positionId === "string" ? o.positionId.trim() : "";
  if (!positionId) return NextResponse.json({ ok: false, error: "position_id_required" }, { status: 400 });

  const { data, error } = await supabase
    .from("depth4_user_book")
    .select("positions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const raw = (data as { positions?: unknown } | null)?.positions;
  const arr = Array.isArray(raw) ? raw : [];
  const positions = arr.filter(isPosition);
  const idx = positions.findIndex((p) => p.id === positionId);
  if (idx < 0) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const next = positions.map((p, i) =>
    i === idx
      ? {
          ...p,
          tradeStatus: "closed" as const,
          closedAt: nowIso,
        }
      : p,
  );

  const { error: upErr } = await supabase.from("depth4_user_book").upsert(
    {
      user_id: user.id,
      positions: next,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
