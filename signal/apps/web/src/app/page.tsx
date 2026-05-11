import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { DEPTH_THEME, DEPTH_THEME_ORDER } from "@/lib/thesis-engine-v2/thesis-depth-theme";

export const metadata: Metadata = {
  title: "DEPTH4 — Macro intelligence & trade planning",
  description:
    "DEPTH4 is a macro intelligence engine that reads the news, thinks four steps ahead, and turns narratives into tradeable theses with probabilities, mispricing, price levels, and early-warning signals.",
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
              into tradeable theses with probabilities, mispricing, price levels, and early-warning signals.
            </p>
              <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-zinc-400">
                Stop staring at charts. Prices move because of stories. DEPTH4 ingests the news, builds the thesis, estimates
                the odds, and tracks where the market may still be behind — sometimes at the second or third move, not the
                headline.
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

            <div className="mt-10 max-w-xl rounded-lg border border-white/[0.08] bg-zinc-900/30 px-4 py-5 ring-1 ring-white/[0.05] sm:px-5">
              <h2 className="text-lg font-semibold tracking-tight text-zinc-50">What DEPTH4 does</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">
                DEPTH4 is a macro intelligence + thesis engine that:
              </p>
              <ul className="mt-3 list-none space-y-2 text-[14px] leading-relaxed text-zinc-300">
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>ingests live news and macro events</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>structures them into tradeable narratives</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>assigns probabilities to each thesis</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>maps how stories unfold across four future states and where mispricing may live at each depth</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>sketches trade plans with entry, stop, and targets</span>
                </li>
              </ul>
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
                DEPTH4 ingests macro news, policy shifts, and data releases, then turns them into a structured trading thesis
                mapped across four future states — from what is confirmed now to third-order spillovers weeks out.
              </p>
              <ul className="list-none space-y-2 text-[14px] leading-relaxed text-zinc-300">
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>Anchor on verified facts (now), then the first market reaction (this week)</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>Trace second-order spillovers (this month) and systemic shifts (this quarter)</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>Estimate thesis conviction (chance the idea is broadly right) and how it may resolve</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>Compare DEPTH4&apos;s view vs what appears priced at each depth — mispricing is not always on move one</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                  <span>Sketches a trade plan; the expression should target the depth with the best risk-adjusted edge when structured depth is present</span>
                </li>
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
                A macro thesis is not one headline — it is a multi‑event arc across policy, data, positioning, and flows.
                DEPTH4 follows that arc so you see the story and the gap versus what is priced in, not just the last
                headline.
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
                In chess, strong players don&apos;t only see the next move — they see the sequence that follows. DEPTH4 does
                the same for macro and geopolitical shocks by mapping how each story unfolds across four future states of the
                world.
              </p>
            </div>
            <div className="lg:col-span-7">
              <div className="-mx-2 overflow-x-auto px-2 pb-2">
                <div className="flex min-w-[880px] items-stretch gap-3">
                  {DEPTH_THEME_ORDER.map((k) => {
                    const t = DEPTH_THEME[k];
                    const event =
                      k === "depth_1"
                        ? "Fed pauses; statement verifies higher-for-longer bias."
                        : k === "depth_2"
                          ? "Rates reprice first; duration whipsaws as cuts drift."
                          : k === "depth_3"
                            ? "Spillovers hit funding + margins; credit and cyclicals diverge."
                            : "Systemic shift: leadership rotates toward cashflows/defensives as policy stays tight.";
                    const trade =
                      k === "depth_1"
                        ? "Example action: wait for verification, then size into the chain."
                        : k === "depth_2"
                          ? "Example expression: duration reacts (e.g. TLT / curve proxies)."
                          : k === "depth_3"
                            ? "Example expression: credit vs quality (HYG vs cashflows) if funding stays tight."
                            : "Example expression: delayed cuts + USD strength pressure duration and EM importers.";

                    return (
                      <div key={k} className={cn("flex-1 rounded-lg border p-4 ring-1", t.cardClassName)}>
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className={cn(
                              "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              t.badgeClassName,
                            )}
                          >
                            {t.longLabel}
                          </span>
                          <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", t.dotClassName)} aria-hidden />
                        </div>
                        <p className="mt-3 text-[13px] font-semibold leading-snug text-zinc-100">{event}</p>
                        <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{trade}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
                Most traders stop at the headline. DEPTH4 tracks the chain — from the confirmed event through second- and
                third-order effects — then surfaces where the market still looks behind. The trade should target the most
                mispriced, expressible depth — not always the first move.
              </p>
              <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
                The moat is depth selection: the same story can be fully priced at Level 2 while the real edge survives at Level
                3–4.
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
                    "2. DEPTH4 maps four future states",
                    "Each thesis can be read as a chain: confirmed now → first market move → spillovers → systemic backdrop. That is the same schema the product is converging on end-to-end.",
                  ],
                  [
                    "3. Compare views at each depth",
                    "Thesis conviction and scenarios describe whether the idea is broadly right and how it resolves. Per-depth mispricing (where rolled out) compares DEPTH4&apos;s view to what the tape already prices at each step.",
                  ],
                  [
                    "4. Trade the depth with the edge",
                    "The trade plan expresses the setup — ideally anchored to the depth with the best risk-adjusted, tradable gap, not only the hero headline. Monitor with scenario-based alerts and related-asset signals where enabled.",
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
                    See setup attractiveness versus thesis conviction, and — as structured depth rolls out — compare
                    DEPTH4&apos;s view to what appears priced at each time layer, not only in one summary bar.
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
                  Stop staring at charts all day. News drives prices. DEPTH4 helps you understand what&apos;s happening in
                  the world, why it matters for the assets you care about, and how to turn that view into a structured trade
                  — instead of chasing every candle.
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

        {/* TRUST / LEGAL (footer-style) */}
        <footer className="border-t border-white/[0.06]">
          <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Trust & disclosure</h2>
            </div>
            <div className="lg:col-span-7">
              <div className="rounded-lg border border-white/[0.08] bg-zinc-900/25 px-4 py-4 ring-1 ring-white/[0.05]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Not investment advice</p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">
                  DEPTH4 is a macro analysis and information tool. Not a broker. Not personalized investment advice.
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                  Data sourcing: news ingested from Reuters, Bloomberg, and primary sources.
                </p>
              </div>
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
        </footer>

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
