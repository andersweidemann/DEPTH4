import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const accentBtn =
  "inline-flex h-10 items-center justify-center rounded-md bg-[#E8473F] px-6 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#E8473F]/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8473F]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111110]";

const accentMuted = "text-[#E8473F]/90";

export const metadata: Metadata = {
  title: "DEPTH4 — Macro thesis engine",
  description:
    "DEPTH4 reads macro headlines, maps how stories unfold across four future states, and flags where the market is still behind — so you trade the narrative, not just the headline.",
};

export default function HomePage() {
  return (
    <div>
      {/* A — Hero */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-14 pt-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
            See the trade before the market catches up
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-300">
            News drives prices. DEPTH4 reads the macro headlines, maps how stories unfold across four future states, and flags
            where the market is still behind — so you trade the narrative, not just the headline.
          </p>

          <Link href="/signup" className={`mt-6 ${accentBtn}`}>
            Start free
          </Link>

          <p className="mt-3 text-[11px] text-zinc-600">Free forever. Upgrade when you need positions.</p>
        </div>

        <div className="lg:col-span-6">
          <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c0e] ring-1 ring-white/[0.05]">
            <Image
              src="/landing/theses-list-cropped.png"
              alt="DEPTH4 thesis list showing live macro theses with conviction scores and status badges"
              width={1200}
              height={800}
              className="h-auto w-full object-cover object-top"
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      {/* B — How it works */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accentMuted}`}>How it works</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">
              From headline to trade plan in four steps
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
              Most traders react to the first headline. DEPTH4 follows the full story arc — so you see the second, third, and
              fourth moves before the market prices them in.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="flex gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8473F]/10 text-[11px] font-semibold ${accentMuted}`}
              >
                1
              </span>
              <div>
                <p className="text-[13px] font-medium text-zinc-200">Pick a thesis or create your own</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
                  Start from DEPTH4&apos;s live macro board — war risk, Fed policy, oil supply, AI earnings — or type your own idea
                  and let the engine map it.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8473F]/10 text-[11px] font-semibold ${accentMuted}`}
              >
                2
              </span>
              <div>
                <p className="text-[13px] font-medium text-zinc-200">DEPTH4 maps four future states</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
                  Each thesis unfolds across confirmed facts, first market reaction, spillover effects, and systemic backdrop. You
                  see the chain, not just the headline.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8473F]/10 text-[11px] font-semibold ${accentMuted}`}
              >
                3
              </span>
              <div>
                <p className="text-[13px] font-medium text-zinc-200">Conviction + mispricing at every depth</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
                  The engine estimates how likely the thesis is to play out (conviction) and where the market still looks behind at
                  each step (mispricing).
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8473F]/10 text-[11px] font-semibold ${accentMuted}`}
              >
                4
              </span>
              <div>
                <p className="text-[13px] font-medium text-zinc-200">Trade the depth with the edge</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-400">
                  Entry, stop, and target levels are sketched for the most mispriced depth — not just the hero headline. Monitor
                  with scenario-based alerts as the story evolves.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* C — Think four moves ahead */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accentMuted}`}>The DEPTH4 difference</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Think four moves ahead</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
              Strong chess players see the sequence that follows. DEPTH4 does the same for macro shocks — mapping how each story
              unfolds across four future states so you see where the real edge lives.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
              The moat is depth selection: the same story can be fully priced at Level 2 while the real edge survives at Level 3–4.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
              <div className="min-w-[240px] shrink-0 rounded-lg border border-[#E8473F]/20 bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]">
                  Level 1 · Confirmed (0–24h)
                </p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Fed pauses; statement verifies higher-for-longer bias.</p>
                <p className="mt-2 text-[12px] text-zinc-500">Wait for verification, then size into the chain.</p>
              </div>
              <div className="min-w-[240px] shrink-0 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Level 2 · This week (1–7d)</p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Rates reprice first; duration whipsaws as cuts drift.</p>
                <p className="mt-2 text-[12px] text-zinc-500">Duration reacts — e.g. TLT / curve proxies.</p>
              </div>
              <div className="min-w-[240px] shrink-0 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Level 3 · This month (7–30d)</p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Spillovers hit funding + margins; credit and cyclicals diverge.</p>
                <p className="mt-2 text-[12px] text-zinc-500">Credit vs quality if funding stays tight.</p>
              </div>
              <div className="min-w-[240px] shrink-0 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Level 4 · This quarter (30–90d+)</p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Systemic shift: leadership rotates toward cashflows/defensives.</p>
                <p className="mt-2 text-[12px] text-zinc-500">Delayed cuts + USD strength pressure duration and EM importers.</p>
              </div>
            </div>
            <p className="mt-6 max-w-3xl text-[12px] text-zinc-600">
              Example: a Fed pause headline moves bonds (Level 2). But the real edge is in credit spreads tightening over the
              following month (Level 3) and leadership rotating to cash-flow names for the quarter (Level 4).
            </p>
          </div>
        </div>
      </section>

      {/* D — Product in action */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accentMuted}`}>Product</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">See the full thesis lifecycle</h2>
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c0e] transition-colors hover:border-white/[0.12]">
              <Image
                src="/landing/theses-list.png"
                alt="Thesis list view"
                width={1200}
                height={800}
                className="w-full"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">Live thesis board — conviction, mispricing, status at a glance</p>
          </div>
          <div>
            <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#0c0c0e] transition-colors hover:border-white/[0.12]">
              <Image
                src="/landing/thesis-detail.png"
                alt="Thesis detail view"
                width={1200}
                height={800}
                className="w-full"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">Resolution paths, trade plan, four-level cascade, AI assistant</p>
          </div>
        </div>
      </section>

      {/* E — Built for macro traders */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accentMuted}`}>Who it&apos;s for</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Built for traders who read the story</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
              Stop staring at charts. Prices move because of stories. DEPTH4 helps you understand what&apos;s happening in the world,
              why it matters for your positions, and how to turn that view into a structured trade.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5 transition-colors hover:border-white/[0.12]">
              <p className="text-[13px] font-semibold text-zinc-200">Live thesis tracking</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                Watch macro theses evolve across evidence updates, conviction changes, and outcomes — all in one place. No more
                scattered notes and forgotten trade ideas.
              </p>
            </div>
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5 transition-colors hover:border-white/[0.12]">
              <p className="text-[13px] font-semibold text-zinc-200">Mispricing analysis</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                See where the market is still behind at each depth level. Conviction tells you if the idea is right; mispricing tells
                you where the edge is.
              </p>
            </div>
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5 transition-colors hover:border-white/[0.12]">
              <p className="text-[13px] font-semibold text-zinc-200">Position linking + review</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                Link trades to theses so monitoring, alerts, and post-trade review stay connected to the narrative that drove the
                trade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* F — Social proof */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accentMuted}`}>Trusted by macro traders</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Join traders who trade the narrative</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5 transition-colors hover:border-white/[0.12]">
            <p className="text-[13px] leading-relaxed text-zinc-300">
              &quot;I used to chase headlines. Now I see the full chain — from the Fed statement to credit spreads to sector rotation.
              DEPTH4 gave me the framework I was missing.&quot;
            </p>
            <p className="mt-4 text-[11px] text-zinc-500">Macro trader · $2M AUM</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5 transition-colors hover:border-white/[0.12]">
            <p className="text-[13px] leading-relaxed text-zinc-300">
              &quot;The four-level cascade changed how I think about time horizons. I&apos;m not trading the headline anymore — I&apos;m trading
              the third-order effect that hasn&apos;t priced in yet.&quot;
            </p>
            <p className="mt-4 text-[11px] text-zinc-500">Options trader · ex-bank desk</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5 transition-colors hover:border-white/[0.12]">
            <p className="text-[13px] leading-relaxed text-zinc-300">
              &quot;Conviction plus mispricing is the scorecard I always wanted. I can see if the story is right AND if the trade is still
              attractive. That&apos;s the edge.&quot;
            </p>
            <p className="mt-4 text-[11px] text-zinc-500">Equity PM · Family office</p>
          </div>
        </div>
      </section>

      {/* G — Simple pricing */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${accentMuted}`}>Pricing</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Simple pricing</h2>
          </div>
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Free</p>
                <p className="mt-2 text-[13px] text-zinc-400">For exploring the macro engine</p>
                <p className="mt-4 text-lg font-semibold text-zinc-200">—</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Analyst</p>
                <p className="mt-2 text-[13px] text-zinc-400">Position linking + full thesis tracking</p>
                <p className="mt-4 text-lg font-semibold text-zinc-200">$29/mo</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 transition-colors hover:border-white/[0.12]">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Pro</p>
                <p className="mt-2 text-[13px] text-zinc-400">Publish + community + leaderboard</p>
                <p className="mt-4 text-lg font-semibold text-zinc-200">$79/mo</p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#E8473F] transition-colors duration-200 hover:text-[#E8473F]/80"
            >
              See full comparison →
            </Link>
          </div>
        </div>
      </section>

      {/* H — Final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-4 rounded-lg border border-white/[0.06] bg-zinc-900/30 px-6 py-5 transition-colors hover:border-white/[0.12] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-zinc-50">Start seeing the full story</h3>
            <p className="mt-1 text-[13px] text-zinc-400">Free tier. No credit card. Upgrade when you&apos;re ready.</p>
          </div>
          <Link href="/signup" className={`shrink-0 ${accentBtn}`}>
            Start free
          </Link>
        </div>
      </section>
    </div>
  );
}
