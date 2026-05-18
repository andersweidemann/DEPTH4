import { NextResponse } from "next/server";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { fetchTrackRecord } from "@/lib/thesis/thesis-outcome-service";
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
    const trackRecord = await fetchTrackRecord(supabase);
    return NextResponse.json(trackRecord, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "track_record_failed";
    console.error("[api/track-record]", message, e);
    return NextResponse.json({ error: "track_record_failed", message }, { status: 500 });
  }
}
