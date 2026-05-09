import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogThesisTitleRows } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";

/**
 * Returns `public.theses.title` and optional `micro_label` for catalog thesis IDs (authenticated reads).
 * Used client-side to align ticker / alerts / book with Supabase when mocks differ.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({
      titlesByThesisId: {} as Record<string, string>,
      microLabelsByThesisId: {} as Record<string, string>,
    });
  }

  const rows = await fetchCatalogThesisTitleRows(supabase);
  const titlesByThesisId: Record<string, string> = {};
  const microLabelsByThesisId: Record<string, string> = {};
  for (const r of rows) {
    const id = r.id.trim();
    const title = (r.title ?? "").trim();
    const micro = (r.micro_label ?? "").trim();
    if (id && title) titlesByThesisId[id] = title;
    if (id && micro) microLabelsByThesisId[id] = micro;
  }
  return NextResponse.json({ titlesByThesisId, microLabelsByThesisId });
}
