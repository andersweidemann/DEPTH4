import { NextRequest, NextResponse } from "next/server";
import { buildGlobalCausalGraph } from "@/lib/causal-map/build-causal-graph";
import { buildCrossThesisUpdates } from "@/lib/feed/build-cross-thesis-updates";
import { fetchThesisSlugMap } from "@/lib/feed/thesis-slugs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contextThesisSlug = req.nextUrl.searchParams.get("contextThesisSlug")?.trim() || null;

  try {
    const { data: starRows, error: starErr } = await supabase
      .from("thesis_stars")
      .select("thesis_id")
      .eq("user_id", user.id)
      .limit(5000);
    if (starErr) throw starErr;

    const slugById = await fetchThesisSlugMap(
      supabase,
      (starRows ?? []).map((r: { thesis_id: string }) => r.thesis_id),
    );
    const starredSlugs = new Set(slugById.values());
    const graph = await buildGlobalCausalGraph(supabase);
    const updates = buildCrossThesisUpdates(graph, starredSlugs, graph.lastUpdated, contextThesisSlug);

    return NextResponse.json(updates, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "cross_thesis_feed_failed";
    console.error("[api/feed/cross-thesis]", message, err);
    return NextResponse.json({ error: "cross_thesis_feed_failed", message }, { status: 500 });
  }
}
