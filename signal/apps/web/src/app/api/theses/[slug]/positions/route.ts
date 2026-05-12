import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/auth/supabase-route-client";
import type { Position } from "@/lib/thesis-engine-v2/types";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";

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

export async function GET(req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const auth = await requireSupabaseUser(req);
  if (!auth.ok) return NextResponse.json(null, { status: 200 });

  const { supabase, user } = auth;
  const loaded = await requireThesisForSlug(supabase, slug, user.id);
  if (!loaded) return NextResponse.json(null, { status: 404 });

  const { data, error } = await supabase
    .from("depth4_user_book")
    .select("positions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ open: 0, closed: 0 });

  const raw = (data as { positions?: unknown } | null)?.positions;
  const arr = Array.isArray(raw) ? raw : [];
  const positions = arr.filter(isPosition);
  const thesisId = loaded.thesis.id;
  let open = 0;
  let closed = 0;
  for (const p of positions) {
    if (p.linkedThesisId !== thesisId) continue;
    if (p.tradeStatus === "open") open += 1;
    if (p.tradeStatus === "closed") closed += 1;
  }

  return NextResponse.json({ open, closed });
}
