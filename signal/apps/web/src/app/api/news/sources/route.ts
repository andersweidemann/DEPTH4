import { NextResponse } from "next/server";
import { fetchNewsSourceRows } from "@/lib/news/news-sources-data";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = createServiceRoleClient();
    if (!sb) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
    }
    const sources = await fetchNewsSourceRows(sb);
    return NextResponse.json({ ok: true, sources });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sources_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
