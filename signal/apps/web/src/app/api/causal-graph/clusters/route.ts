import { NextResponse } from "next/server";
import { buildCausalGraphClusters } from "@/lib/causal-map/build-causal-graph";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isDepth4PublicReadMode()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const payload = await buildCausalGraphClusters(supabase);
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
