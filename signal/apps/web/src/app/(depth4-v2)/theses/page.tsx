import type { Metadata } from "next";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { ThesesDashboardClient } from "@/components/thesis-engine-v2/ThesesDashboardClient";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";
import { MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Live theses",
  description: "Tracks macro events the market hasn't priced in yet.",
};

export default function ThesesDashboardPage({
  searchParams,
}: {
  searchParams?: { openDrawer?: string | string[] };
}) {
  const raw = searchParams?.openDrawer;
  const initialDrawerSlug =
    typeof raw === "string" ? raw : Array.isArray(raw) && raw.length ? String(raw[0]) : null;

  const liveLine = thesesLiveHeaderNeutral();

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-5xl px-5 pb-14 pt-4">
        <ThesesDashboardClient systemTheses={MOCK_THESES} initialDrawerSlug={initialDrawerSlug} />
      </main>
    </>
  );
}
