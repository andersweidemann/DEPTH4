"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";
import { V2_PLAN_LABEL, V2_PLAN_ORDER } from "@/lib/thesis-engine-v2/plan";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";

export type ThesisNavTab = "theses" | "feed" | "book" | "community" | "leaderboard" | "help";

export function AppHeader({
  active,
  liveLine,
  alertsSlot,
  bookSummarySlot,
}: {
  active: ThesisNavTab;
  liveLine: string;
  /** Optional bell + notification panel (DEPTH4 v2 live alerts). */
  alertsSlot?: ReactNode;
  /** Optional Book session performance summary (shown under live line). */
  bookSummarySlot?: ReactNode;
}) {
  const { plan } = useV2Plan();
  const planLabel = V2_PLAN_LABEL[plan] ?? plan;
  const tierLabel = plan === V2_PLAN_ORDER[0] ? "Free Tier" : planLabel;
  const tab = (id: ThesisNavTab, href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "min-h-11 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors sm:min-h-0 sm:px-2 sm:py-1 sm:text-xs",
        active === id
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-500 hover:text-zinc-300",
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Depth4Wordmark href="/theses" size="md" className="leading-none" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alertsSlot}
            <span className="text-sm text-zinc-500" aria-label="Current tier">
              {tierLabel}
            </span>
          </div>
        </div>
        <nav
          className="mt-3 -mx-1 flex flex-nowrap items-center gap-1 overflow-x-auto px-1 pb-1 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          aria-label="Primary"
        >
          {tab("theses", "/theses", "Theses")}
          {tab("feed", "/feed-2", "Feed")}
          {tab("book", "/book-2", "Book")}
          {tab("community", "/community", "Community")}
          {tab("leaderboard", "/leaderboard", "Leaderboard")}
          {tab("help", "/help", "Help")}
        </nav>
        <p className="mt-2 text-[12px] leading-snug text-zinc-500 sm:mt-3 sm:text-[11px]">{liveLine}</p>
        {bookSummarySlot ? <div className="mt-2 sm:mt-3">{bookSummarySlot}</div> : null}
      </div>
    </header>
  );
}
