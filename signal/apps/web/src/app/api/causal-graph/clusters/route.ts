import { NextRequest, NextResponse } from "next/server";
import { buildCausalGraphClusters } from "@/lib/causal-map/build-causal-graph";
import {
  filterHiddenFromGraph,
  filterOnlyHiddenFromGraph,
  loadThesesPageActivity,
} from "@/lib/causal-map/theses-page-activity";
import { fetchThesisStatusCounts } from "@/lib/theses/thesis-status-counts";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewHidden = req.nextUrl.searchParams.get("view") === "hidden";

  if (!user && !isDepth4PublicReadMode()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (viewHidden && !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    let payload = await buildCausalGraphClusters(supabase);

    if (user) {
      const { data: hiddenRows, error: hiddenErr } = await supabase
        .from("user_hidden_theses")
        .select("thesis_id")
        .eq("user_id", user.id);
      if (!hiddenErr && hiddenRows) {
        const hiddenIds = new Set(hiddenRows.map((r) => String(r.thesis_id)));
        payload = viewHidden
          ? filterOnlyHiddenFromGraph(payload, hiddenIds)
          : filterHiddenFromGraph(payload, hiddenIds);
      } else if (viewHidden) {
        payload = filterOnlyHiddenFromGraph(payload, new Set());
      }
    }

    const activity = viewHidden
      ? { dailyUpdates: [], recentlyUpdatedThesisIds: [], latestUpdateAt: null }
      : await loadThesesPageActivity(supabase, payload);
    const statusCounts = await fetchThesisStatusCounts(supabase);
    payload = {
      ...payload,
      dailyUpdates: activity.dailyUpdates,
      recentlyUpdatedThesisIds: activity.recentlyUpdatedThesisIds,
      latestUpdateAt: activity.latestUpdateAt,
      statusCounts,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "causal_clusters_failed";
    console.error("[api/causal-graph/clusters]", message, err);
    return NextResponse.json({ error: "causal_clusters_failed", message }, { status: 500 });
  }
}
