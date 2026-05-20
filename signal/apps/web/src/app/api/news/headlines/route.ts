import { NextRequest, NextResponse } from "next/server";
import { fetchRecentHeadlines } from "@/lib/news/news-sources-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = Math.min(24, Math.max(1, Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "12", 10) || 12));
  try {
    const sb = await createClient();
    const headlines = await fetchRecentHeadlines(sb, limit);
    return NextResponse.json({ ok: true, headlines });
  } catch (e) {
    const message = e instanceof Error ? e.message : "headlines_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
