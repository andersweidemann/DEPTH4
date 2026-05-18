import { NextResponse } from "next/server";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { createClient } from "@/lib/supabase/server";
import { requireThesisForSlug } from "@/lib/thesis-engine-v2/thesis-api-route-helpers";
import { getOutcomeForThesis } from "@/lib/thesis/thesis-outcome-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 30;

export async function GET(_req: Request, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isDepth4PublicReadMode()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loaded = await requireThesisForSlug(supabase, slug, user?.id ?? null);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const outcome = await getOutcomeForThesis(supabase, loaded.thesis.id);
  if (!outcome) {
    return NextResponse.json({ outcome: null });
  }

  return NextResponse.json(
    { outcome },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
