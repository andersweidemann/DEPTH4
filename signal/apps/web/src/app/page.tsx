import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";

export const metadata: Metadata = {
  title: "DEPTH4 — Your macro thesis engine",
  description: "Track unpriced macro narratives, update probability in real time, and act before the market catches up.",
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <Depth4Wordmark size="sm" />
          </div>
          <nav className="flex items-center gap-2 text-[12px]">
            <Link href="/demo" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              View live demo
            </Link>
            <Link href="/pricing" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              Pricing
            </Link>
            <Link href="/login" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              Sign in
            </Link>
            <Link
              href="/signup?next=/onboarding"
              className={cn(
                buttonVariants({ size: "sm" }),
                "rounded-md bg-amber-500 px-3 text-zinc-950 hover:bg-amber-400",
              )}
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-14 pt-12 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-6">
            <Depth4Wordmark size="lg" showTagline align="left" className="text-zinc-100" />
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
              Your macro thesis engine
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-300">
              DEPTH4 tracks unpriced macro narratives across the news cycle, updates probability in real time, and helps
              macro traders act before the market catches up.
            </p>
            <p className="mt-4 text-[13px] text-zinc-400">The news is the fuel. The thesis is the product.</p>

            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href="/signup?next=/onboarding"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "justify-center rounded-md bg-amber-500 text-zinc-950 hover:bg-amber-400",
                )}
              >
                Start free
              </Link>
              <Link
                href="/demo"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "justify-center rounded-md border border-white/[0.10] bg-transparent text-zinc-200 hover:bg-white/[0.06]",
                )}
              >
                View live demo
              </Link>
            </div>
          </div>

          {/* Product screenshot */}
          <div className="lg:col-span-6">
            <div className="bg-zinc-950/35 p-2 ring-1 ring-white/[0.08]">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <span className="text-zinc-400">Live theses</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-zinc-600">Dashboard</span>
                </div>
                <span className="text-[10px] text-zinc-600">Screenshot</span>
              </div>
              <div className="relative aspect-[16/10] overflow-hidden bg-[#0c0c0e]">
                <Image
                  src="/landing/depth4-theses.png"
                  alt="DEPTH4 product screenshot showing live theses dashboard and drawer"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* WHAT DEPTH4 DOES */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Trade the narrative, not just the headline</h2>
            </div>
            <div className="lg:col-span-7">
              <p className="text-[14px] leading-relaxed text-zinc-300">
                A macro thesis is not one headline. It is a multi-event narrative that unfolds across policy shifts,
                speeches, data, and market reaction.
              </p>
              <p className="mt-4 text-[14px] leading-relaxed text-zinc-300">
                DEPTH4 tracks that story across the full news cycle, updates probability in real time, and shows what the
                market still has not priced in.
              </p>
            </div>
          </div>
        </section>

        {/* WHY DEPTH4 */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Think four moves ahead</h2>
              <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
                In chess, strong players think four moves ahead. DEPTH4 brings that same edge to macro trading.
              </p>
            </div>
            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ["Level 1 — Headline", "The raw news event."],
                  ["Level 2 — Thesis", "The multi-event narrative that follows."],
                  ["Level 3 — Mispricing", "Where probability differs from pricing."],
                  ["Level 4 — Trade", "Execution tied to the thesis over time."],
                ].map(([k, v]) => (
                  <div key={k} className="bg-zinc-900/25 px-4 py-3 ring-1 ring-white/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{k}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
                Most traders stop at the news. DEPTH4 connects all four levels so you can see the narrative, the pricing
                gap, and the trade.
              </p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">How it works</h2>
            </div>
            <div className="lg:col-span-7">
              <div className="space-y-3">
                {[
                  ["1. Track the narrative", "Follow macro theses across multiple events, not isolated headlines."],
                  ["2. Measure the probability", "DEPTH4 updates thesis probability as new evidence comes in."],
                  ["3. See the mispricing", "Compare thesis probability to what the market appears to have priced in."],
                  ["4. Link the trade", "Track positions against the thesis, monitor changes, and review outcomes."],
                ].map(([k, v]) => (
                  <div key={k} className="bg-zinc-900/20 px-4 py-3">
                    <p className="text-[12px] font-semibold text-zinc-100">{k}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCT SECTION */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Built for macro traders</h2>
            </div>
            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 gap-2">
                <div className="bg-zinc-900/25 px-4 py-3 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] font-semibold text-zinc-100">Live thesis tracking</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
                    Watch theses evolve across evidence updates, alerts, and outcomes in one place.
                  </p>
                </div>
                <div className="bg-zinc-900/25 px-4 py-3 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] font-semibold text-zinc-100">Mispricing analysis</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
                    Make the “score” concrete by comparing thesis probability to market-implied probability and the gap.
                  </p>
                </div>
                <div className="bg-zinc-900/25 px-4 py-3 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] font-semibold text-zinc-100">Position linking & review</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
                    Link trades to theses so monitoring, alerts, and post-trade review stay connected to the narrative.
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <Link href="/theses" className="text-[12px] font-semibold text-amber-200/90 hover:text-amber-100">
                  Explore the live theses dashboard →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING PREVIEW */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Simple pricing</h2>
            </div>
            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  ["Free", "For exploring the thesis engine", "—"],
                  ["Analyst", "Position linking + full thesis tracking", "$29/mo"],
                  ["Pro", "Publish + community + leaderboard", "$79/mo"],
                ].map(([name, desc, price]) => (
                  <div key={name} className="bg-zinc-900/25 px-4 py-3 ring-1 ring-white/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{name}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{desc}</p>
                    <p className="mt-3 text-[14px] font-semibold tabular-nums text-zinc-100">{price}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Link href="/pricing" className="text-[12px] font-semibold text-amber-200/90 hover:text-amber-100">
                  See full pricing →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* TRUST / LEGAL */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Trust & disclosure</h2>
            </div>
            <div className="lg:col-span-7">
              <p className="text-[13px] leading-relaxed text-zinc-300">
                DEPTH4 is a macro analysis and information tool. Not a broker. Not personalized investment advice.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 text-[12px]">
                <Link href="/terms" className="text-zinc-400 hover:text-zinc-200">
                  Terms
                </Link>
                <span className="text-zinc-700">·</span>
                <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200">
                  Privacy
                </Link>
                <span className="text-zinc-700">·</span>
                <Link href="/risk-disclosure" className="text-zinc-400 hover:text-zinc-200">
                  Risk Disclosure
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10">
          <div className="grid grid-cols-1 gap-6 bg-zinc-900/20 px-5 py-6 ring-1 ring-white/[0.06] lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
                Start tracking macro theses before the market catches up
              </h2>
            </div>
            <div className="lg:col-span-4 lg:flex lg:justify-end">
              <Link
                href="/signup?next=/onboarding"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full justify-center rounded-md bg-amber-500 text-zinc-950 hover:bg-amber-400 lg:w-auto",
                )}
              >
                Create account
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
