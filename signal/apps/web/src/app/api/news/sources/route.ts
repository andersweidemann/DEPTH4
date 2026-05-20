import { NextResponse } from "next/server";
import { fetchNewsSourceRows } from "@/lib/news/news-sources-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = await createClient();
    const sources = await fetchNewsSourceRows(sb);
    return NextResponse.json({ ok: true, sources });
  } catch (e) {
    const message = e instanceof Error ? e.message : "sources_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
