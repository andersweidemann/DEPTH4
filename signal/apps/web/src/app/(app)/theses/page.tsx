import type { Metadata } from "next";
import { ThesesDashboardClient } from "@/components/thesis-engine-v2/ThesesDashboardClient";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCatalogThesisTitleRows,
  mergeCatalogThesesWithDbTitles,
} from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";

export const metadata: Metadata = {
  title: "DEPTH4 · Live theses",
  description: "Tracks macro events the market hasn't priced in yet.",
};

export default async function ThesesDashboardPage({
  searchParams,
}: {
  searchParams?: { openDrawer?: string | string[] };
}) {
  const raw = searchParams?.openDrawer;
  const initialDrawerSlug =
    typeof raw === "string" ? raw : Array.isArray(raw) && raw.length ? String(raw[0]) : null;

  const liveLine = thesesLiveHeaderNeutral();

  const supabase = await createClient();
  const titleRows = await fetchCatalogThesisTitleRows(supabase);
  const systemTheses = mergeCatalogThesesWithDbTitles(CATALOG_THESES, titleRows);

  return (
    <>
      {liveLine.trim() ? (
        <p className="mb-4 text-[12px] leading-snug text-zinc-500 sm:text-[11px]">{liveLine}</p>
      ) : null}
      <div className="pb-6 pt-2">
        <ThesesDashboardClient systemTheses={systemTheses} initialDrawerSlug={initialDrawerSlug} />
      </div>
    </>
  );
}
