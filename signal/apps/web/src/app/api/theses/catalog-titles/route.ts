import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogThesisTitleRows } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";

/**
 * Returns `public.theses.title` for catalog thesis IDs (authenticated reads).
 * Used client-side to align ticker / alerts / book with Supabase when mocks differ.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ titlesByThesisId: {} as Record<string, string> });
  }

  const rows = await fetchCatalogThesisTitleRows(supabase);
  const titlesByThesisId: Record<string, string> = {};
  for (const r of rows) {
    const id = r.id.trim();
    const title = (r.title ?? "").trim();
    if (id && title) titlesByThesisId[id] = title;
  }
  return NextResponse.json({ titlesByThesisId });
}
