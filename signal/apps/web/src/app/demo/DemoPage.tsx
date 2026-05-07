"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity, FileText, LayoutList, ListOrdered } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { FeedItemFourLayer } from "@/components/feed/FeedItemFourLayer";
import { demoAraghchi } from "@/lib/demoFeedViewModels";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";
import { BackButton } from "@/components/brand/BackButton";

const briefMd = `## Overnight
- Crude gapped; copper caught a bid on supply headlines.
- Rates vol picked up in EU session.

## Watch today
- **Inventories** (US) — if draw vs consensus, **Scenario A** in your energy view firms up.
- **DXY** into NY — affects your unhedged USD book.

## Your portfolio
- **FCX** benefits if copper risk-on holds; in SEK, rough upside +4–8k on a 2% move (illustrative).
- **VLO** — if spot runs, your open buy may need a level review.

## Order book
- **VLO** limit: consider moving 1–2% if spot is chasing (dummy copy).

## Key times today
- 14:30 US data — could reset crude beta.
`;

type Tab = "feed" | "portfolio" | "orders" | "briefing";

const mockPos = [
  { ticker: "FCX", qty: 200, valueSek: 184_000 },
  { ticker: "VLO", qty: 40, valueSek: 78_200 },
] as const;

const mockOrders = [
  { ticker: "VLO", dir: "limit buy", at: 142.5, near: true },
  { ticker: "FCX", dir: "limit sell", at: 52, near: false },
] as const;

export function DemoPage() {
  const [tab, setTab] = useState<Tab>("feed");
  const [l4, sL4] = useState(true);

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950/90 px-3 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <BackButton fallbackHref="/" label="Back" className="px-2 py-1 text-[12px]" />
          <div className="text-sm">
            <Depth4Wordmark size="sm" />
            <span className="ml-2 text-amber-200 text-xs font-medium border border-amber-600/50 rounded px-1.5 py-0.5 bg-amber-950/60">Demo</span>
          </div>
        </div>
        <Link className="text-sm text-amber-500/90 hover:text-amber-400 underline" href="/">
          Home
        </Link>
      </header>

      {l4 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90" role="alertdialog" aria-modal="true">
          <div className="max-w-lg w-full bg-zinc-900 rounded-2xl p-6 space-y-3 text-zinc-100 border-2 border-red-500/70 shadow-2xl">
            <h2 className="text-lg font-bold">L4 example — this line is the push</h2>
            <p className="text-sm font-medium leading-relaxed text-zinc-200">{demoAraghchi.notificationText}</p>
            <p className="text-xs text-zinc-500">{demoAraghchi.headline}</p>
            <Button onClick={() => sL4(false)} className="w-full" type="button">
              Acknowledge
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 max-w-[1800px] mx-auto w-full grid md:grid-cols-[280px_1fr_300px]">
        <aside className="border-r border-zinc-800 p-3 h-auto md:h-dvh overflow-y-auto hidden md:block">
          <h2 className="text-sm font-medium text-zinc-400">Portfolio (fake)</h2>
          <p className="text-2xl font-semibold">262,200 <span className="text-zinc-500 text-base">SEK</span></p>
          <p className="text-xs text-zinc-500">Illustrative only.</p>
          <ul className="text-sm space-y-1 mt-2">
            {mockPos.map((x) => (
              <li key={x.ticker} className="flex justify-between">
                {x.ticker} <span>{x.valueSek.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-2 md:p-3 pb-20 md:pb-3 overflow-y-auto">
          {tab === "feed" && (
            <div className="max-w-3xl">
              <p className="text-xs text-zinc-500 mb-2">
                Headline → story → scenarios → your book. Fictional sample.
              </p>
              <FeedItemFourLayer
                model={demoAraghchi}
                defaultOpenL2
                defaultOpenL4={false}
                proUnlocked
              />
            </div>
          )}
          {tab === "portfolio" && (
            <ul className="p-2 space-y-1 text-sm">
              {mockPos.map((x) => (
                <li key={x.ticker} className="flex justify-between border-b border-zinc-800 py-1">
                  <span>{x.ticker}</span>
                  <span>{x.valueSek.toLocaleString()} SEK</span>
                </li>
              ))}
            </ul>
          )}
          {tab === "orders" && (
            <ul className="p-2 text-sm space-y-1">
              {mockOrders.map((o) => (
                <li
                  key={o.ticker + o.at}
                  className="flex justify-between py-1 border-b border-zinc-800"
                >
                  <span>
                    {o.ticker} {o.dir} @ {o.at}
                  </span>
                  {o.near && <span className="text-xs text-rose-300 font-medium">near trigger (demo)</span>}
                </li>
              ))}
            </ul>
          )}
          {tab === "briefing" && (
            <article className="prose prose-sm max-w-none dark:prose-invert p-2">
              <ReactMarkdown>{briefMd}</ReactMarkdown>
            </article>
          )}
        </div>

        <aside className="border-l border-zinc-800 p-2 space-y-2 h-dvh overflow-y-auto hidden md:block text-sm">
          <h2 className="text-xs text-zinc-500 uppercase">Event (same as demo card)</h2>
          <p className="font-medium text-zinc-200">{demoAraghchi.headline}</p>
          <p className="text-xs text-amber-200">Watch Oman / Muscat wires, not the Islamabad photo line.</p>
          <h2 className="text-xs text-zinc-500 uppercase pt-2">Order queue (fake)</h2>
          {mockOrders.map((o) => (
            <p key={o.ticker + o.at} className="text-xs text-zinc-300">
              {o.ticker} — {o.near ? "Review vs scenario" : "On watch"}
            </p>
          ))}
        </aside>
      </div>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-700/80 bg-zinc-950/95 text-zinc-200 flex justify-around py-2"
        aria-label="Mobile main"
      >
        {(
          [
            ["feed", LayoutList],
            ["portfolio", Activity],
            ["orders", ListOrdered],
            ["briefing", FileText],
          ] as const
        ).map(([a, I]) => (
          <button
            type="button"
            key={a}
            onClick={() => setTab(a)}
            className={tab === a ? "flex flex-col items-center text-xs text-orange-400" : "flex flex-col items-center text-xs text-zinc-500"}
          >
            <I className="h-5 w-5" />
            {a[0]!.toUpperCase() + a.slice(1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
