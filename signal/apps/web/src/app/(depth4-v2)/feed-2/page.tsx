import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { FeedSignalCard } from "@/components/thesis-engine-v2/FeedSignalCard";
import { PromotedMacroEventCard } from "@/components/macro-reasoning/PromotedMacroEventCard";
import { thesesLiveHeaderNeutral } from "@/lib/thesis-engine-v2/live-header-copy";
import { MOCK_FEED_SIGNALS } from "@/lib/thesis-engine-v2/mock-data";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPromotedMacroReasoningRows,
  toPromotedCardModel,
  type PromotedCardModel,
} from "@/lib/feed/promoted-macro-events";
import { fetchThesisMetaMap, type ThesisMeta } from "@/lib/feed/thesis-slugs";

export const metadata: Metadata = {
  title: "DEPTH4 · Feed",
  description: "Incoming macro signals matched into active theses.",
};

export default async function Feed2Page() {
  const liveLine = thesesLiveHeaderNeutral();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let promotedCards: PromotedCardModel[] = [];
  let thesisMetaById = new Map<string, ThesisMeta>();

  if (user) {
    const rows = await fetchPromotedMacroReasoningRows(supabase);
    promotedCards = rows.map(toPromotedCardModel).filter((c): c is NonNullable<typeof c> => c !== null);
    const thesisIds = promotedCards.flatMap((c) => c.reasoning.affected_theses);
    thesisMetaById = await fetchThesisMetaMap(supabase, thesisIds);
  }

  return (
    <>
      <AppHeader active="feed" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Feed</h1>
            <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              Scan headlines mapped into theses. Open reasoning when a line deserves a read — the feed stays light on
              purpose.
            </p>

            {user && promotedCards.length > 0 ? (
              <div className="mt-10">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Promoted macro narratives
                    </h2>
                    <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-zinc-600">
                      Live cluster summaries — thesis link, one impact line, optional prob. Full chain on the reasoning
                      page.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#111110]/90 px-4 sm:px-5">
                  {promotedCards.map((card) => (
                    <PromotedMacroEventCard key={card.row.id} card={card} thesisMetaById={thesisMetaById} />
                  ))}
                </div>
              </div>
            ) : null}

            {user && promotedCards.length === 0 ? (
              <div className="mt-10 rounded-lg border border-dashed border-white/[0.08] bg-zinc-900/20 px-4 py-6 sm:px-5">
                <p className="text-[13px] font-medium text-zinc-300">No promoted reasoning yet</p>
                <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-zinc-500">
                  Promote at least one discovery cluster and run{" "}
                  <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] text-zinc-400">
                    /api/cron/event-reasoning
                  </code>{" "}
                  to generate the narrative card. Rows appear here when{" "}
                  <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] text-zinc-400">
                    event_reasoning
                  </code>{" "}
                  exists for a promoted cluster.
                </p>
              </div>
            ) : null}

            {!user ? (
              <div className="mt-6 rounded-lg border border-[#E8473F]/20 bg-[#E8473F]/[0.06] px-4 py-3 text-[12px] leading-relaxed text-zinc-300">
                <Link href="/login" className="font-medium text-[#E8473F] underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                to view promoted narrative cards (headline → thesis map). Open any card for full reasoning.
              </div>
            ) : null}

            {!user ? (
              <div className={promotedCards.length > 0 ? "mt-12" : "mt-10"}>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Demo signals</h2>
                <p className="mt-1 mb-4 text-[11px] text-zinc-600">Layout preview only — not connected to live news.</p>
                <div className="rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
                  {MOCK_FEED_SIGNALS.map((item) => (
                    <FeedSignalCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <aside className="hidden lg:block">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/15 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Feed context</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                Promoted narratives use live <span className="text-zinc-300">event_reasoning</span> when available. Star
                theses to pull matching evidence into alerts and the live ticker.
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Thesis readiness counts are shown on the Live theses grid, not inferred here.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
