import type { Metadata } from "next";
import Link from "next/link";
import { PublicTopBar } from "@/components/brand/PublicTopBar";

export const metadata: Metadata = {
  title: "DEPTH4 · Help",
  description: "Task-oriented help center for using DEPTH4.",
};

type Section = {
  id: string;
  nav: string;
  title: string;
};

const SECTIONS: Section[] = [
  { id: "what-depth4-does", nav: "What DEPTH4 does", title: "What DEPTH4 does" },
  { id: "how-to-use-depth4", nav: "How to use DEPTH4", title: "How to use DEPTH4" },
  { id: "read-a-thesis", nav: "How to read a thesis", title: "How to read a thesis" },
  {
    id: "thesis-conviction-scenarios",
    nav: "Thesis conviction",
    title: "Thesis conviction and scenario probabilities",
  },
  { id: "insider-flow-detector", nav: "Insider Flow Detector", title: "Insider Flow Detector" },
  { id: "use-profitably", nav: "Use DEPTH4 profitably", title: "How to use DEPTH4 profitably" },
  { id: "example-gold", nav: "Example: Gold & peace", title: "Example: the gold and peace thesis" },
  { id: "feed-vs-theses", nav: "Feed + Theses", title: "How the Feed and Theses work together" },
  { id: "create-your-thesis", nav: "Create a thesis", title: "How to create your own thesis" },
  { id: "advisory-feed", nav: "Advisory feed", title: "How to use the advisory feed" },
  { id: "what-its-not", nav: "What it's not", title: "What DEPTH4 is not" },
  { id: "limits-risk", nav: "Limits and risk", title: "Limits and risk" },
  { id: "important-note", nav: "Important note", title: "Important note (disclaimer)" },
];

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/70" />
      <span className="text-zinc-200/90">{children}</span>
    </li>
  );
}

function ExampleBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/25 px-4 py-4 text-[15px] leading-relaxed text-zinc-200/90">
      {children}
    </div>
  );
}

function SectionBlock({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
      <div className="mt-4 space-y-4 text-[16px] leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-100 antialiased">
      <PublicTopBar backHref="/theses" backLabel="Back" />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">Help Center</h1>
            <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-zinc-400">
              Practical, task-oriented guidance for using DEPTH4 as a thesis-first market workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
            <Link className="rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 py-2 hover:bg-zinc-900/50" href="/theses">
              Open Theses
            </Link>
            <Link
              className="rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-2 hover:bg-zinc-900/40"
              href="/theses/war-peace-gold-short"
            >
              Open example thesis
            </Link>
          </div>
        </div>

        {/* Mobile jump navigation */}
        <nav className="mt-6 -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-2 sm:hidden" aria-label="Help sections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="min-h-11 whitespace-nowrap rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-2 text-[13px] font-medium text-zinc-200 hover:bg-zinc-900/40"
            >
              {s.nav}
            </a>
          ))}
        </nav>

        <div className="mt-8 grid gap-10 sm:grid-cols-[240px_minmax(0,1fr)]">
          {/* Desktop sidebar */}
          <aside className="hidden sm:block">
            <div className="sticky top-6 rounded-xl border border-white/[0.06] bg-zinc-900/15 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-600">On this page</p>
              <div className="mt-3 flex flex-col gap-1">
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="rounded-md px-2.5 py-2 text-[13px] font-medium text-zinc-300 hover:bg-zinc-900/40 hover:text-zinc-100"
                  >
                    {s.nav}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="space-y-12">
            <SectionBlock id="what-depth4-does" title="What DEPTH4 does">
              <p>
                DEPTH4 tracks macro stories that may move markets before the market has fully priced them in. It reads relevant
                news continuously, groups related developments into a live thesis, and updates that thesis as new evidence comes in.
              </p>
              <p>A thesis is not a single headline. It is a live market view such as:</p>
              <ul className="space-y-2">
                <Bullet>Peace deal probability is rising, so gold may fall.</Bullet>
                <Bullet>OPEC unity is weakening, so oil may come under pressure.</Bullet>
                <Bullet>A Fed pivot is being delayed, so bond prices may stay weak.</Bullet>
              </ul>
              <p>DEPTH4 is built to help you answer four questions on one screen:</p>
              <ul className="space-y-2">
                <Bullet>Why now?</Bullet>
                <Bullet>What is the market missing?</Bullet>
                <Bullet>What is the trigger?</Bullet>
                <Bullet>What is the trade?</Bullet>
              </ul>
              <p className="text-zinc-400">The news is the fuel. The thesis is the product.</p>
            </SectionBlock>

            <SectionBlock id="how-to-use-depth4" title="How to use DEPTH4">
              <p>
                Start on the <strong className="text-zinc-100">Theses</strong> page. This is the main view of the product.
              </p>
              <p>Each live thesis shows:</p>
              <ul className="space-y-2">
                <Bullet>The thesis name</Bullet>
                <Bullet>The asset it affects</Bullet>
                <Bullet>Thesis conviction (chance the idea is broadly right) and resolution paths below it</Bullet>
                <Bullet>Whether the setup is Ready (entry conditions valid or close)</Bullet>
                <Bullet>What changed recently</Bullet>
                <Bullet>The current trade idea</Bullet>
              </ul>
              <p>Click a thesis to open the full thesis view.</p>
              <p>Inside a thesis, focus on these sections first:</p>
              <ul className="space-y-2">
                <Bullet>
                  <strong className="text-zinc-100">Why now</strong>: why the opportunity matters now
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">What the market hasn&apos;t priced in yet</strong>: what the market may still be missing
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Trigger</strong>: what needs to happen before conviction rises
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Trade</strong>: the current entry, stop-loss, and target idea
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Invalidation</strong>: what would weaken or break the thesis
                </Bullet>
              </ul>
              <p>If those five areas are clear, you can understand the trade quickly.</p>
            </SectionBlock>

            <SectionBlock id="read-a-thesis" title="How to read a thesis">
              <p>A DEPTH4 thesis is a live object, not a fixed opinion.</p>
              <p>Each thesis includes:</p>
              <ul className="space-y-2">
                <Bullet>A thesis statement</Bullet>
                <Bullet>Thesis conviction and scenario probabilities</Bullet>
                <Bullet>A list of relevant events</Bullet>
                <Bullet>A current status</Bullet>
                <Bullet>A trade plan</Bullet>
                <Bullet>An invalidation condition</Bullet>
              </ul>
              <p>
                Thesis conviction and scenario paths update as new information comes in. That does not mean DEPTH4 is predicting
                the future with certainty. It means the system is tracking whether the evidence is getting stronger or weaker over
                time.
              </p>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">The four depth levels</h3>
              <p>
                DEPTH4 reads a thesis as a <strong className="text-zinc-100">chain of future states</strong>, not a single headline.
                The canonical model uses four time layers (the same schema the product, prompts, and database are converging on):
              </p>
              <ul className="space-y-2">
                <Bullet>
                  <strong className="text-zinc-100">Level 1 — Confirmed (now, 0–24h)</strong> · &quot;What changed in the world
                  today?&quot; Facts only: names, dates, signed documents, verified disruptions.
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Level 2 — This week (1–7 days, direct move)</strong> · &quot;What happens first
                  in markets?&quot; Where prices and headlines move first if Level 1 is real.
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Level 3 — This month (7–30 days, second-order)</strong> · &quot;What happens
                  once people react to Level 2?&quot; Supply chains, margins, funding, positioning — who actually wins or loses.
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Level 4 — This quarter (30–90+ days, third-order / systemic)</strong> ·
                  &quot;What does the new regime look like if Levels 2–3 play out?&quot; Policy path, leadership, and which trades
                  still make sense after the obvious trades tire out.
                </Bullet>
              </ul>
              <p className="text-zinc-400">
                <strong className="text-zinc-200">On the thesis page today:</strong> you may still see the legacy &quot;four-level
                cascade&quot; (confirmed / week–quarter / year / backdrop) on older rows until each thesis is backfilled into the
                structured <code className="rounded bg-zinc-900/60 px-1 font-mono text-[13px] text-zinc-300">thesis_depth_book</code>{" "}
                shape. New copy describes the target engine; migration is gradual.
              </p>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Mispricing at each depth</h3>
              <p>
                Mispricing is <strong className="text-zinc-100">not</strong> meant to be a single vague bar forever. At full rollout,
                DEPTH4 compares its view to what the market appears to price <strong className="text-zinc-100">at each depth</strong>:
              </p>
              <ul className="space-y-2">
                <Bullet>Some stories are fairly priced at Level 2 (the obvious move) but underpriced at Level 3 (spillovers).</Bullet>
                <Bullet>Others have the edge at Level 4 (policy and leadership) even when Level 2 already repriced violently.</Bullet>
                <Bullet>
                  The <strong className="text-zinc-100">Trade</strong> block should tell you which depth the expression is trying to
                  capture once that wiring is live; until then, use Scenario View + conviction + the cascade prose together.
                </Bullet>
              </ul>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Example: Hormuz-style chain (illustrative)</h3>
              <ExampleBox>
                <p className="font-semibold text-zinc-100">Not a live forecast — a pattern DEPTH4 is built to track.</p>
                <ul className="mt-3 list-none space-y-2 text-[15px] text-zinc-300">
                  <li>
                    <span className="text-zinc-500">Level 1 · </span>Strait closure confirmed; traffic disruption verified.
                  </li>
                  <li>
                    <span className="text-zinc-500">Level 2 · </span>Crude, tanker rates, and shipping insurance spike.
                  </li>
                  <li>
                    <span className="text-zinc-500">Level 3 · </span>Fertilizer, food inputs, airlines, and EM importers absorb higher
                    energy costs — margins compress in a cross-section, not only in oil.
                  </li>
                  <li>
                    <span className="text-zinc-500">Level 4 · </span>Inflation stays stickier, cuts drift later, EM stress rises;
                    energy exporters and defense can outperform while duration and importers suffer.
                  </li>
                </ul>
                <p className="mt-3 text-zinc-200">
                  <strong className="text-zinc-100">Key idea:</strong> the best trade may sit in Level 3–4 (e.g. fertilizer vs
                  airlines, exporters vs importers, duration) even when the narrative starts at Level 1–2. DEPTH4 is designed to
                  surface that kind of &quot;primary edge is not the headline&quot; case when structured depth and per-depth
                  mispricing are present.
                </p>
              </ExampleBox>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Thesis states</h3>
              <ul className="space-y-2">
                <Bullet>
                  <strong className="text-zinc-100">Forming</strong>: early idea; still taking shape
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Watching</strong>: important, but not ready yet
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Ready</strong>: entry/setup conditions are valid or close enough to act on (entry setup valid)
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Active</strong>: you have an open position linked to this thesis (position open)
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Resolved</strong>: the thesis played out
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Invalidated</strong>: the thesis no longer holds
                </Bullet>
              </ul>
            </SectionBlock>

            <SectionBlock id="thesis-conviction-scenarios" title="Thesis conviction and scenario probabilities">
              <div className="space-y-6">
                <div>
                  <p className="font-semibold text-zinc-100">What is Thesis conviction?</p>
                  <p className="mt-2">
                    Thesis conviction is DEPTH4&apos;s estimate of the chance that a thesis is broadly right over its horizon. It is
                    calculated as: Clean win + Messy win. In other words, it measures the probability that the thesis still works,
                    even if the path is not smooth.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">What are Scenario probabilities?</p>
                  <p className="mt-2">Scenario probabilities break that conviction into three possible resolution paths:</p>
                  <ul className="mt-2 space-y-2">
                    <Bullet>Clean win: the thesis pays roughly as intended</Bullet>
                    <Bullet>Messy win: the thesis is directionally right, but the payoff is slower, noisier, or less linear</Bullet>
                    <Bullet>Thesis broken: the thesis is invalidated</Bullet>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">How should I use them?</p>
                  <p className="mt-2">
                    Use Thesis conviction to decide whether the idea is strong enough to run at all. Use the Scenario probabilities
                    to decide how to run it: more Clean win means a cleaner path; more Messy win means more patience and tighter risk
                    discipline; more Broken means greater invalidation risk.
                  </p>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock id="insider-flow-detector" title="Insider Flow Detector">
              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">What it is</h3>
              <p>
                The <strong className="text-zinc-100">Insider Flow Detector</strong> watches for unusual price and volume moves in the instruments tied
                to your thesis scenarios. When the market is moving as if your thesis is leaking — but no public headline has confirmed it yet — DEPTH4
                flags it and updates scenario probabilities.
              </p>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">How it works</h3>
              <ul className="space-y-2">
                <Bullet>You configure confirming and contradicting tape instruments when creating a thesis (or let the AI suggest them).</Bullet>
                <Bullet>DEPTH4 monitors those instruments every 5 minutes.</Bullet>
                <Bullet>If returns move beyond normal volatility and volume spikes, a flow anomaly is detected.</Bullet>
                <Bullet>If the move matches a scenario but no matching confirm headline exists yet, it is labeled an <strong className="text-zinc-100">unconfirmed leak</strong>.</Bullet>
                <Bullet>Scenario probabilities adjust based on signal strength.</Bullet>
                <Bullet>If you have <strong className="text-zinc-100">starred</strong> the thesis, you get a bell notification.</Bullet>
              </ul>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">What you’ll see</h3>
              <ul className="space-y-2">
                <Bullet>Radar icon in the top bar (grey / teal / amber).</Bullet>
                <Bullet>Anomaly card in the Insider Flow panel.</Bullet>
                <Bullet>Updated scenario probabilities (suggested or auto-applied, depending on tier).</Bullet>
                <Bullet>
                  Evidence log style entry:
                  <ExampleBox>
                    Insider flow detected: TLT −3.2%, 5× volume → Clean win +15pts
                  </ExampleBox>
                </Bullet>
              </ul>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Example walkthrough</h3>
              <div className="space-y-3">
                <p>
                  You have a thesis: <strong className="text-zinc-100">“Fed pivot delayed — TLT weakness.”</strong>
                </p>
                <p>
                  You map <strong className="text-zinc-100">TLT</strong> and long-duration bonds to the instrument list DEPTH4 watches for tape
                  confirmation, and add confirm tags like <strong className="text-zinc-100">“Fed pivot”</strong> and{" "}
                  <strong className="text-zinc-100">“rates”</strong>.
                </p>
                <p>
                  At 11:42, TLT dumps −3.2% on 5× normal volume, but there is no Fed headline yet. DEPTH4 flags a tape anomaly and raises the linked
                  resolution-path probability (for example Clean win) from 20% to 35%. 47 minutes later, a Bloomberg headline confirms delayed easing —
                  the anomaly flips to “Confirmed.”
                </p>
              </div>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">What tier do I need?</h3>
              <ul className="space-y-2">
                <Bullet><strong className="text-zinc-100">Free</strong>: indicator only (an anomaly occurred in the last 24h).</Bullet>
                <Bullet><strong className="text-zinc-100">Analyst</strong>: full 7-day log, probability suggestions you approve manually.</Bullet>
                <Bullet><strong className="text-zinc-100">Pro</strong>: real-time alerts, automatic probability updates.</Bullet>
              </ul>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Legal disclaimer</h3>
              <p className="text-zinc-400">
                The Insider Flow Detector identifies unusual market activity that may precede news. It does not detect illegal insider trading, provide
                investment advice, or guarantee that detected patterns will be confirmed by headlines. Use it as one input among many in your trading
                decisions.
              </p>
            </SectionBlock>

            <SectionBlock id="use-profitably" title="How to use DEPTH4 profitably">
              <p>The main mistake most traders make is trading the headline instead of the narrative.</p>
              <p>
                DEPTH4 is built to help you follow the full story. A single headline may not matter much on its own. But several
                related headlines over days or weeks can build a much stronger case.
              </p>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">A simple way to use DEPTH4 well</h3>
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-zinc-100">1) Start with a small number of theses.</p>
                  <p className="text-zinc-300">Do not try to track everything. Pick a few macro stories you understand and care about.</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">2) Wait for the thesis, not just the news.</p>
                  <p className="text-zinc-300">
                    A dramatic headline does not always mean the trade is ready. Look for improving thesis conviction, a clear trigger,
                    and a trade setup that makes sense.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">3) Focus on what the market hasn&apos;t caught up to yet.</p>
                  <p className="text-zinc-300">
                    The best opportunities usually come when the market has not fully caught up yet. If the move already happened,
                    the thesis may be right but the trade may be late.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">4) Use invalidation seriously.</p>
                  <p className="text-zinc-300">Every thesis should tell you what would break it. If that happens, do not cling to the idea.</p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">5) Let the thesis update your view.</p>
                  <p className="text-zinc-300">
                    If new events strengthen the thesis, you may hold or add carefully. If they weaken it, tighten risk or exit.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">6) Use DEPTH4 as a decision aid, not blind automation.</p>
                  <p className="text-zinc-300">DEPTH4 helps you think faster and more clearly. You still decide what to trade and how much risk to take.</p>
                </div>
              </div>
            </SectionBlock>

            <SectionBlock id="example-gold" title="Example: the gold and peace thesis">
              <p>
                A good example is a thesis like: <strong className="text-zinc-100">Rising peace odds may push gold lower.</strong>
              </p>
              <p>This thesis is not based on one article. It develops over time through many related events, such as:</p>
              <ul className="space-y-2">
                <Bullet>Ceasefire rumors</Bullet>
                <Bullet>Prisoner exchanges</Bullet>
                <Bullet>Confirmed meetings</Bullet>
                <Bullet>Softer rhetoric</Bullet>
                <Bullet>Signals of flexibility from key parties</Bullet>
              </ul>
              <p>Any one of those may look minor on its own. Together, they can change the odds in a meaningful way.</p>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">How the thesis works in practice</h3>
              <ol className="list-decimal space-y-2 pl-5 text-zinc-300">
                <li>DEPTH4 detects a pattern of improving diplomacy.</li>
                <li>Thesis conviction rises.</li>
                <li>A trigger is crossed, such as a confirmed meeting.</li>
                <li>The system marks the thesis as Ready.</li>
                <li>You wait for the price setup, not just the news.</li>
                <li>Once in the trade, DEPTH4 keeps updating the thesis as new developments appear.</li>
                <li>If the thesis strengthens, you may hold.</li>
                <li>If it weakens, you may reduce risk or exit.</li>
              </ol>

              <ExampleBox>
                <p className="font-semibold text-zinc-100">The full loop</p>
                <p className="mt-2 text-zinc-200/90">thesis → trigger → entry → management → exit</p>
                <p className="mt-2 text-zinc-400">That loop is the core of DEPTH4.</p>
              </ExampleBox>
            </SectionBlock>

            <SectionBlock id="feed-vs-theses" title="How the Feed and Theses work together">
              <p>
                DEPTH4 has two main views: <strong className="text-zinc-100">Feed</strong> and{" "}
                <strong className="text-zinc-100">Theses</strong>.
              </p>
              <ul className="space-y-2">
                <Bullet>
                  <strong className="text-zinc-100">Feed</strong>: the raw sensing layer. It shows what happened.
                </Bullet>
                <Bullet>
                  <strong className="text-zinc-100">Theses</strong>: the decision layer. It shows what the news may mean for a trade.
                </Bullet>
              </ul>
              <p>In simple terms:</p>
              <ExampleBox>
                <p className="text-zinc-200/90">
                  Feed = what happened
                  <br />
                  Thesis = what it means
                </p>
              </ExampleBox>
              <p>Most users should spend most of their time in Theses, not Feed.</p>
            </SectionBlock>

            <SectionBlock id="create-your-thesis" title="How to create your own thesis">
              <p>You can create a thesis manually when you see a macro story the market may be misreading.</p>
              <p>A good user-created thesis should include:</p>
              <ul className="space-y-2">
                <Bullet>One clear sentence about the idea</Bullet>
                <Bullet>The asset it affects</Bullet>
                <Bullet>Why the market may be wrong or early</Bullet>
                <Bullet>What event would strengthen the view</Bullet>
                <Bullet>What would invalidate it</Bullet>
                <Bullet>The time horizon</Bullet>
              </ul>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Good format</h3>
              <ExampleBox>
                <p className="font-semibold text-zinc-100">If / then / because</p>
                <p className="mt-2 text-zinc-200/90">
                  If <span className="text-zinc-100">[event or scenario]</span> happens, then{" "}
                  <span className="text-zinc-100">[asset]</span> may move because{" "}
                  <span className="text-zinc-100">[reason]</span>.
                </p>
                <p className="mt-3 text-zinc-400">Example</p>
                <p className="mt-1 text-zinc-200/90">
                  If the Clarity Act moves forward meaningfully, BTCUSD may rerate higher because the market still
                  underestimates the impact of regulatory clarity.
                </p>
              </ExampleBox>

              <p className="text-zinc-400">
                Keep the thesis simple. If you need three paragraphs to explain it, it is probably too vague.
              </p>
            </SectionBlock>

            <SectionBlock id="advisory-feed" title="How to use the advisory feed">
              <p>The advisory feed is different from the raw news feed.</p>
              <p>
                It is a filtered stream of updates that matter to your live theses or open positions. Instead of showing every
                headline, it tells you what changed, whether it helps or hurts the thesis, how thesis conviction moved, and what the current stance is.
              </p>

              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Examples</h3>
              <ExampleBox>
                <ul className="space-y-2">
                  <li className="text-zinc-200/90">“Thesis strengthened. Hold.”</li>
                  <li className="text-zinc-200/90">“Trigger not confirmed yet. Wait.”</li>
                  <li className="text-zinc-200/90">“Thesis weakened. Tighten risk.”</li>
                  <li className="text-zinc-200/90">“Thesis invalidated. Exit plan should be reviewed.”</li>
                </ul>
              </ExampleBox>
              <p className="text-zinc-400">
                The goal is not more information. The goal is better decisions.
              </p>
            </SectionBlock>

            <SectionBlock id="what-its-not" title="What DEPTH4 is not">
              <p>DEPTH4 is not:</p>
              <ul className="space-y-2">
                <Bullet>A generic news terminal</Bullet>
                <Bullet>A broker</Bullet>
                <Bullet>A guarantee of profit</Bullet>
                <Bullet>A replacement for your own judgment</Bullet>
              </ul>
              <p>
                It is also not built to turn every headline into a trade. In many cases, the right answer will be to wait.
                That is a feature, not a weakness.
              </p>
            </SectionBlock>

            <SectionBlock id="limits-risk" title="Limits and risk">
              <p>
                DEPTH4 can help you organize thinking, monitor narratives, and react faster to important changes. It cannot remove market risk.
              </p>
              <h3 className="pt-2 text-[16px] font-semibold text-zinc-100">Important limits</h3>
              <ul className="space-y-2">
                <Bullet>AI analysis can be wrong.</Bullet>
                <Bullet>News can be incomplete or misleading.</Bullet>
                <Bullet>Market reactions can be delayed, muted, or opposite to what seems logical.</Bullet>
                <Bullet>A good thesis can still lose money if timing is bad.</Bullet>
                <Bullet>A correct narrative does not always produce a good trade.</Bullet>
              </ul>
              <p className="text-zinc-400">
                Use risk management. Use stop-losses. Size positions carefully. Never trade based only on one screen.
              </p>
            </SectionBlock>

            <SectionBlock id="important-note" title="Important note (disclaimer)">
              <p>
                DEPTH4 provides analysis and tools for thinking about markets. It does not provide personalized investment advice.
                You are responsible for your own decisions and risk.
              </p>
              <p className="text-zinc-400">
                For full legal terms, see our{" "}
                <Link href="/terms" className="text-zinc-200 underline underline-offset-2 hover:text-zinc-50">
                  Terms of Use
                </Link>
                ,{" "}
                <Link href="/privacy" className="text-zinc-200 underline underline-offset-2 hover:text-zinc-50">
                  Privacy Policy
                </Link>
                , and{" "}
                <Link href="/risk" className="text-zinc-200 underline underline-offset-2 hover:text-zinc-50">
                  Risk Disclosure
                </Link>
                .
              </p>
            </SectionBlock>
          </div>
        </div>
      </main>
    </div>
  );
}

