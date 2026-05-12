import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFeedItems } from "@/lib/feed/build-feed-items";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const loadPromoted = !!user || isDepth4PublicReadMode();

  const items = await buildFeedItems(supabase, loadPromoted);
  return NextResponse.json(items);
}
