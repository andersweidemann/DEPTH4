import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUserIdForThesisDetailApi } from "@/lib/thesis-engine-v2/thesis-detail-api-auth";
import { fetchCatalogThesisHeaderBySlug } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { fetchThesisRowBySlug } from "@/lib/thesis-engine-v2/fetch-thesis-row-by-slug";
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

  const header = await fetchCatalogThesisHeaderBySlug(supabase, slug);
  const row = await fetchThesisRowBySlug(supabase, slug, userId);
  const body = header.body ?? row?.body ?? null;

  return NextResponse.json({ ok: true, bundle: bundle as ThesisDetailBundle, body });
}
