import type { Metadata } from "next";
import { ThesisDetailClient } from "@/components/thesis-engine-v2/ThesisDetailClient";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogThesisTitleBySlug } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";

type Props = { params: { slug: string } };

export function generateMetadata(): Metadata {
  // User-created theses are stored client-side, so keep metadata generic.
  return { title: "Thesis · DEPTH4" };
}

export default async function ThesisDetailPage({ params }: Props) {
  const supabase = await createClient();
  const catalogDisplayTitle = await fetchCatalogThesisTitleBySlug(supabase, params.slug);

  return <ThesisDetailClient slug={params.slug} catalogDisplayTitle={catalogDisplayTitle} />;
}
