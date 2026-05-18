import { NextResponse } from "next/server";
import { buildCausalChainForSlug } from "@/lib/causal-map/build-causal-chain";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 60;

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

  try {
    const chain = await buildCausalChainForSlug(supabase, slug);
    if (!chain) {
      return NextResponse.json({ error: "no_causal_data" }, { status: 404 });
    }

    return NextResponse.json(chain, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "causal_chain_failed";
    console.error("[api/theses/[slug]/causal]", slug, message, err);
    return NextResponse.json({ error: "causal_chain_failed", message }, { status: 500 });
  }
}
