import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "DEPTH4 — Macro intelligence & trade planning",
  description:
    "DEPTH4 is a macro intelligence engine that reads the news, thinks four steps ahead, and turns narratives into tradeable theses with probabilities, mispricing, price levels, and early-warning signals.",
};

export default function HomePage() {
  return (
    <div>
      {/* Section A — Hero */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 pb-14 pt-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
            See the trade before the market does
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-300">
            DEPTH4 is a macro intelligence engine that reads the news, thinks four steps ahead, and turns narratives into
            tradeable theses with probabilities, mispricing, price levels, and early-warning signals.
          </p>
          <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-zinc-400">
            Stop staring at charts. Prices move because of stories. DEPTH4 ingests the news, builds the thesis, estimates the
            odds, and tracks where the market may still be behind — sometimes at the second or third move, not the headline.
          </p>

          <Link
            href="/signup"
            className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-amber-500 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            Start free
          </Link>

          <div className="mt-10 max-w-xl rounded-lg border border-white/[0.08] bg-zinc-900/30 px-4 py-5 ring-1 ring-white/[0.05] sm:px-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">What DEPTH4 does</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">DEPTH4 is a macro intelligence + thesis engine that:</p>
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
                alt="DEPTH4 product screenshot"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section B */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Your macro intelligence engine</h2>
          </div>
          <div className="space-y-4 lg:col-span-7">
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
                <span>
                  Sketches a trade plan; the expression should target the depth with the best risk-adjusted edge when structured
                  depth is present
                </span>
              </li>
            </ul>
            <p className="mt-4 text-[14px] leading-relaxed text-zinc-400">
              The news is the fuel. The thesis — and the trade tied to it — is the product.
            </p>
          </div>
        </div>
      </section>

      {/* Section C */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Trade the narrative, not just the headline</h2>
          </div>
          <div className="lg:col-span-7">
            <p className="text-[14px] leading-relaxed text-zinc-300">
              A macro thesis is not one headline — it is a multi-event arc across policy, data, positioning, and flows. DEPTH4
              follows that arc so you see the story and the gap versus what is priced in, not just the last headline.
            </p>
          </div>
        </div>
      </section>

      {/* Section D */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Think four moves ahead</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
              In chess, strong players don&apos;t only see the next move — they see the sequence that follows. DEPTH4 does the
              same for macro and geopolitical shocks by mapping how each story unfolds across four future states of the world.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
              <div className="min-w-[240px] shrink-0 rounded-lg border border-amber-500/20 bg-zinc-900/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                  Level 1 · Confirmed (0–24h)
                </p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Fed pauses; statement verifies higher-for-longer bias.</p>
                <p className="mt-2 text-[12px] text-zinc-500">Example action: wait for verification, then size into the chain.</p>
              </div>
              <div className="min-w-[240px] shrink-0 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Level 2 · This week (1–7d)</p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Rates reprice first; duration whipsaws as cuts drift.</p>
                <p className="mt-2 text-[12px] text-zinc-500">Example expression: duration reacts (e.g. TLT / curve proxies).</p>
              </div>
              <div className="min-w-[240px] shrink-0 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Level 3 · This month (7–30d)</p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">Spillovers hit funding + margins; credit and cyclicals diverge.</p>
                <p className="mt-2 text-[12px] text-zinc-500">
                  Example expression: credit vs quality (HYG vs cashflows) if funding stays tight.
                </p>
              </div>
              <div className="min-w-[240px] shrink-0 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Level 4 · This quarter (30–90d+)</p>
                <p className="mt-2 text-[13px] font-medium text-zinc-200">
                  Systemic shift: leadership rotates toward cashflows/defensives as policy stays tight.
                </p>
                <p className="mt-2 text-[12px] text-zinc-500">
                  Example expression: delayed cuts + USD strength pressure duration and EM importers.
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-zinc-400">
              Most traders stop at the headline. DEPTH4 tracks the chain — from the confirmed event through second- and third-order
              effects — then surfaces where the market still looks behind. The trade should target the most mispriced, expressible
              depth — not always the first move.
            </p>
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-zinc-500">
              The moat is depth selection: the same story can be fully priced at Level 2 while the real edge survives at Level 3–4.
            </p>
          </div>
        </div>
      </section>

      {/* Section E */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">How it works</h2>
          </div>
          <div className="lg:col-span-7">
            <div className="space-y-6">
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">1. Type a thesis or pick one</p>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                  Start from your own idea (&quot;Bitcoin spikes if the Clarity Act passes&quot;) or from DEPTH4&apos;s live macro board of
                  in-flight theses.
                </p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">2. DEPTH4 maps four future states</p>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                  Each thesis can be read as a chain: confirmed now → first market move → spillovers → systemic backdrop. That is the
                  same schema the product is converging on end-to-end.
                </p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">3. Compare views at each depth</p>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                  Thesis conviction and scenarios describe whether the idea is broadly right and how it resolves. Per-depth
                  mispricing (where rolled out) compares DEPTH4&apos;s view to what the tape already prices at each step.
                </p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">4. Trade the depth with the edge</p>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                  The trade plan expresses the setup — ideally anchored to the depth with the best risk-adjusted, tradable gap, not
                  only the hero headline. Monitor with scenario-based alerts and related-asset signals where enabled.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section F */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Built for macro traders and serious retail</h2>
          </div>
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
              <p className="text-[13px] font-semibold text-zinc-200">Live thesis tracking</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                Watch theses evolve across evidence updates, alerts, and outcomes in one place.
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
              <p className="text-[13px] font-semibold text-zinc-200">Mispricing analysis</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                See setup attractiveness versus thesis conviction, and — as structured depth rolls out — compare DEPTH4&apos;s view to
                what appears priced at each time layer, not only in one summary bar.
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
              <p className="text-[13px] font-semibold text-zinc-200">Position linking & review</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                Link trades to theses so monitoring, alerts, and post-trade review stay connected to the narrative.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section G */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">For serious retail traders</h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-zinc-400">
            Stop staring at charts all day. News drives prices. DEPTH4 helps you understand what&apos;s happening in the world, why it
            matters for the assets you care about, and how to turn that view into a structured trade — instead of chasing every
            candle.
          </p>
        </div>
      </section>

      {/* Section H */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Simple pricing</h2>
          </div>
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Free</p>
                <p className="mt-2 text-[13px] text-zinc-400">For exploring the macro engine</p>
                <p className="mt-4 text-lg font-semibold text-zinc-200">—</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Analyst</p>
                <p className="mt-2 text-[13px] text-zinc-400">Position linking + full thesis tracking</p>
                <p className="mt-4 text-lg font-semibold text-zinc-200">$29/mo</p>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Pro</p>
                <p className="mt-2 text-[13px] text-zinc-400">Publish + community + leaderboard</p>
                <p className="mt-4 text-lg font-semibold text-zinc-200">$79/mo</p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-amber-400 transition-colors hover:text-amber-300"
            >
              See full pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* Section I */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Trust & disclosure</h2>
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Not investment advice</p>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                DEPTH4 is a macro analysis and information tool. Not a broker. Not personalized investment advice.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                Data sourcing: news ingested from Reuters, Bloomberg, and primary sources.
              </p>
            </div>
            <p className="mt-4 text-[12px] text-zinc-500">
              <Link href="/terms" className="text-zinc-400 hover:text-zinc-200">
                Terms
              </Link>
              {" · "}
              <Link href="/privacy" className="text-zinc-400 hover:text-zinc-200">
                Privacy
              </Link>
              {" · "}
              <Link href="/risk-disclosure" className="text-zinc-400 hover:text-zinc-200">
                Risk Disclosure
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Section J */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-4 rounded-lg border border-white/[0.06] bg-zinc-900/30 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xl font-semibold tracking-tight text-zinc-50">Start seeing trades before the market catches up</h3>
          <Link
            href="/signup"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-amber-500 px-6 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400"
          >
            Start free
          </Link>
        </div>
      </section>
    </div>
  );
}
