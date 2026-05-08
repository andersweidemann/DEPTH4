import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { FeedSignalCard } from "@/components/thesis-engine-v2/FeedSignalCard";
import { PromotedMacroEventCard } from "@/components/macro-reasoning/PromotedMacroEventCard";
import { thesesLiveLine } from "@/lib/thesis-engine-v2/live-header-copy";
import { MOCK_FEED_SIGNALS, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPromotedMacroReasoningRows,
  toPromotedCardModel,
  type PromotedCardModel,
} from "@/lib/feed/promoted-macro-events";
import { fetchThesisSlugMap } from "@/lib/feed/thesis-slugs";

export const metadata: Metadata = {
  title: "DEPTH4 · Feed",
  description: "Incoming macro signals matched into active theses.",
};

export default async function Feed2Page() {
  const readyCount = MOCK_THESES.filter((t) => t.status === "ready").length;
  const activeCount = MOCK_THESES.filter((t) => t.status === "active").length;
  const liveLine = thesesLiveLine(readyCount, MOCK_THESES.length);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let promotedCards: PromotedCardModel[] = [];
  let thesisSlugById = new Map<string, string>();

  if (user) {
    const rows = await fetchPromotedMacroReasoningRows(supabase);
    promotedCards = rows.map(toPromotedCardModel).filter((c): c is NonNullable<typeof c> => c !== null);
    const thesisIds = promotedCards.flatMap((c) => c.reasoning.affected_theses);
    thesisSlugById = await fetchThesisSlugMap(supabase, thesisIds);
  }

  return (
    <>
      <AppHeader active="feed" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-5xl px-5 pb-20 pt-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Feed</h1>
            <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
              Incoming macro signals. DEPTH4 matches these into active theses or proposes new ones.
            </p>

            {user && promotedCards.length > 0 ? (
              <div className="mt-10">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Promoted macro narratives
                    </h2>
                    <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-zinc-600">
                      Opus-ranked causal reasoning on promoted discovery clusters. Open a card for the full chain and
                      mispricing view.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#111110]/90 px-4 sm:px-5">
                  {promotedCards.map((card) => (
                    <PromotedMacroEventCard key={card.row.id} card={card} thesisSlugById={thesisSlugById} />
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
                  to populate Opus macro reasoning. Rows appear here when{" "}
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
                to view live macro reasoning on promoted narratives (causal chain + mispricing hypothesis).
              </div>
            ) : null}

            <div className={promotedCards.length > 0 ? "mt-12" : "mt-10"}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Sample signals</h2>
              <p className="mt-1 mb-4 text-[11px] text-zinc-600">Illustrative feed layout — not live Supabase news.</p>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
                {MOCK_FEED_SIGNALS.map((item) => (
                  <FeedSignalCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          </section>

          <aside className="hidden lg:block">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/15 px-4 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Active theses</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
                {activeCount} active · {readyCount} ready
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                The feed surfaces headlines that map cleanly to a thesis first. Unlinked items are shown when no system
                thesis is a clear match yet.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
