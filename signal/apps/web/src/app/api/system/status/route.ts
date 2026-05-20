import { NextResponse } from "next/server";
import { loadPipelineStatus } from "@/lib/system/pipeline-status";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET — pipeline / evidence activity for the live status banner. */
export async function GET() {
  try {
    const supabase = await createClient();
    const status = await loadPipelineStatus(supabase);
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "status_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
