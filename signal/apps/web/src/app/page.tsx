import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "DEPTH4 — Macro intelligence & trade planning",
  description:
    "DEPTH4 reads the news, thinks four steps ahead, and turns narratives into tradeable theses with probabilities, price levels, and early-warning signals.",
};

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold tracking-tight text-zinc-100">DEPTH4</span>
            <span className="hidden text-[11px] text-zinc-500 sm:inline">Macro intelligence engine</span>
          </div>
          <nav className="flex items-center gap-2 text-[12px]">
            <Link href="/pricing" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              Pricing
            </Link>
            <Link href="/login" className="px-2 py-1 text-zinc-400 hover:text-zinc-200">
              Sign in
            </Link>
            <Link
              href="/signup?next=/theses"
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
              See the trade before the market does
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-300">
              DEPTH4 is a macro intelligence engine that reads the news, thinks four steps ahead, and turns narratives
              into tradeable theses with probabilities, price levels, and early-warning signals.
            </p>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-zinc-400">
              Stop staring at charts. Prices move because of stories. DEPTH4 analyzes news, builds a thesis, estimates the
              odds, and shows where the market hasn&apos;t caught up yet.
            </p>

            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                href="/signup?next=/theses"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "justify-center rounded-md bg-amber-500 text-zinc-950 hover:bg-amber-400 sm:w-auto",
                )}
              >
                Start free
              </Link>
            </div>
          </div>

          {/* Product screenshot */}
          <div className="lg:col-span-6">
            <div className="bg-zinc-950/35 p-2 ring-1 ring-white/[0.08]">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <span className="text-zinc-400">Workspace</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-zinc-600">Preview</span>
                </div>
                <span className="text-[10px] text-zinc-600">Screenshot</span>
              </div>
              <div className="relative aspect-[16/10] overflow-hidden bg-[#0c0c0e]">
                <Image
                  src="/landing/depth4-theses.png"
                  alt="DEPTH4 product screenshot showing the macro workspace and detail drawer"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* MACRO INTELLIGENCE ENGINE */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Your macro intelligence engine</h2>
            </div>
            <div className="lg:col-span-7 space-y-4">
              <p className="text-[14px] leading-relaxed text-zinc-300">
                DEPTH4 analyzes macro news, policy shifts, and data releases, then builds a structured trading thesis that
                thinks four steps ahead:
              </p>
              <ul className="list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-zinc-300">
                <li>identifies the catalyst and follow-on events,</li>
                <li>estimates a probability for the thesis to play out,</li>
                <li>highlights where the market looks mispriced,</li>
                <li>and sketches a live trade plan with entry, stop, and targets.</li>
              </ul>
              <p className="text-[13px] leading-relaxed text-zinc-400">
                The news is the fuel. The thesis — and the trade tied to it — is the product.
              </p>
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
                A macro thesis is not one headline. It is a multi‑event narrative that unfolds across policy shifts,
                speeches, data, positioning, and flows. DEPTH4 tracks that story across the full news cycle, updates
                probability in real time, and shows what the market still has not priced in.
              </p>
              <p className="mt-4 text-[14px] leading-relaxed text-zinc-300">
                DEPTH4 ties that narrative to a probability view and a concrete trade plan so you can see both the story
                and the pricing gap — not just the last headline.
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
                In chess, strong players think four moves ahead. DEPTH4 brings that same edge to macro trading by
                structuring every idea into four levels:
              </p>
            </div>
            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ["LEVEL 1 — HEADLINE", "The raw news event: bill, speech, data, or shock."],
                  ["LEVEL 2 — THESIS", "The multi‑event narrative that unfolds across policy, positioning, and flows."],
                  [
                    "LEVEL 3 — MISPRICING",
                    "Where DEPTH4’s probability view diverges from what the market appears to have priced in.",
                  ],
                  ["LEVEL 4 — TRADE", "A live plan: entry zone, stop, targets, and scenario tree over time."],
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
                  [
                    "1. Type a thesis or pick one",
                    "Start from your own idea (“Bitcoin spikes if the Clarity Act passes”) or from DEPTH4’s live macro board of in‑flight theses.",
                  ],
                  [
                    "2. DEPTH4 thinks through the narrative",
                    "The engine maps catalysts, first‑ and second‑order consequences, winners and losers, and what would make the thesis messy or broken.",
                  ],
                  [
                    "3. Get probabilities and see the mispricing",
                    "DEPTH4 assigns a probability path to your thesis and compares it to what the market appears to have priced in.",
                  ],
                  [
                    "4. See the trade and monitor it",
                    "Get a live trade plan with entry zone, stop, targets, and scenario‑based alerts — including early signals of 'premature insider' behavior in related assets.",
                  ],
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
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Built for macro traders and serious retail</h2>
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
                    Make the &quot;score&quot; concrete by comparing thesis probability to market‑implied probability and the gap.
                  </p>
                </div>
                <div className="bg-zinc-900/25 px-4 py-3 ring-1 ring-white/[0.06]">
                  <p className="text-[12px] font-semibold text-zinc-100">Position linking & review</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
                    Link trades to theses so monitoring, alerts, and post‑trade review stay connected to the narrative.
                  </p>
                </div>
              </div>
              <div className="mt-6 border-t border-white/[0.06] pt-6">
                <h3 className="text-[13px] font-semibold text-zinc-200">For serious retail traders</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                  Stop doom‑scrolling charts. News drives prices. DEPTH4 helps you learn what&apos;s happening in the world,
                  why it matters for the assets you care about, and how to express that view with a structured plan — instead
                  of chasing every candle.
                </p>
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
                  ["Free", "For exploring the macro engine", "—"],
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
                Start seeing trades before the market catches up
              </h2>
            </div>
            <div className="lg:col-span-4 lg:flex lg:justify-end">
              <Link
                href="/signup?next=/theses"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full justify-center rounded-md bg-amber-500 text-zinc-950 hover:bg-amber-400 lg:w-auto",
                )}
              >
                Start free
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
