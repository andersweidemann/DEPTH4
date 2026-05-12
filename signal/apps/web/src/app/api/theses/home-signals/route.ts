import { NextResponse } from "next/server";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import type { ThesisHomeSignalsResponse } from "@/types/thesis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await getAuthedSupabase(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await auth.sb
    .from("theses")
    .select("id, slug, thesis_score")
    .eq("thesis_origin", "seeded_system")
    .not("thesis_score", "is", null)
    .order("thesis_score", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message } satisfies { error: string }, { status: 400 });
  }

  const row = data as { id?: unknown; slug?: unknown; thesis_score?: unknown } | null;
  const thesisId = typeof row?.id === "string" && row.id.trim() ? row.id.trim() : "";
  const slug = typeof row?.slug === "string" && row.slug.trim() ? row.slug.trim() : "";
  const rawScore = row?.thesis_score;
  const thesisScore = typeof rawScore === "number" && Number.isFinite(rawScore) ? Math.round(rawScore) : null;

  const payload: ThesisHomeSignalsResponse = {
    catalogLeader:
      thesisId && slug && thesisScore != null
        ? { thesisId, slug, thesisScore }
        : null,
  };

  return NextResponse.json(payload);
}
