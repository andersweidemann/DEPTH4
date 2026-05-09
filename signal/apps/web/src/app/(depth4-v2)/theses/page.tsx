import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
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
      <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-5xl px-5 pb-14 pt-4">
        <ThesesDashboardClient systemTheses={systemTheses} initialDrawerSlug={initialDrawerSlug} />
      </main>
    </>
  );
}
