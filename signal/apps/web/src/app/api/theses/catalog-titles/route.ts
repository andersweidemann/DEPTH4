import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogThesisTitleRows } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";

/**
 * Returns `public.theses.title`, `micro_label`, and optional `body` JSON for catalog thesis IDs (authenticated reads).
 * Used client-side to align ticker / alerts / book / narrative with Supabase when DB fields differ from the baseline bundle.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !isDepth4PublicReadMode()) {
    return NextResponse.json({
      titlesByThesisId: {} as Record<string, string>,
      microLabelsByThesisId: {} as Record<string, string>,
      bodiesByThesisId: {} as Record<string, unknown>,
      slugsByThesisId: {} as Record<string, string>,
    });
  }

  const rows = await fetchCatalogThesisTitleRows(supabase);
  const titlesByThesisId: Record<string, string> = {};
  const microLabelsByThesisId: Record<string, string> = {};
  const bodiesByThesisId: Record<string, unknown> = {};
  const slugsByThesisId: Record<string, string> = {};
  for (const r of rows) {
    const id = r.id.trim();
    const title = (r.title ?? "").trim();
    const micro = (r.micro_label ?? "").trim();
    const slug = (r.slug ?? "").trim();
    if (id && title) titlesByThesisId[id] = title;
    if (id && micro) microLabelsByThesisId[id] = micro;
    if (id && slug) slugsByThesisId[id] = slug;
    if (id && r.body !== undefined && r.body !== null && typeof r.body === "object") {
      bodiesByThesisId[id] = r.body as Record<string, unknown>;
    }
  }
  return NextResponse.json({ titlesByThesisId, microLabelsByThesisId, bodiesByThesisId, slugsByThesisId });
}
