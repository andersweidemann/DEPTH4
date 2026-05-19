import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUserIdForThesisDetailApi } from "@/lib/thesis-engine-v2/thesis-detail-api-auth";
import { loadThesisDetailBundleForApi } from "@/lib/thesis-engine-v2/load-thesis-api-bundle";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Client hydration for `/theses/[slug]` — catalog, `ai_generated`, and user-owned rows. */
export async function GET(_req: NextRequest, context: { params: { slug: string } }) {
  const slug = context.params.slug?.trim() ?? "";
  if (!slug) return NextResponse.json({ error: "invalid_slug" }, { status: 400 });

  const { supabase, userId } = await getSupabaseAndUserIdForThesisDetailApi(_req);
  const bundle = await loadThesisDetailBundleForApi(supabase, slug, userId);
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, bundle: bundle as ThesisDetailBundle });
}
