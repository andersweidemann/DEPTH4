import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { AdvisoryLog } from "@/components/thesis-engine-v2/AdvisoryLog";
import { AnswerBlock } from "@/components/thesis-engine-v2/AnswerBlock";
import { EvidenceTimeline } from "@/components/thesis-engine-v2/EvidenceTimeline";
import { ScenarioPanel } from "@/components/thesis-engine-v2/ScenarioPanel";
import { ThesisHero } from "@/components/thesis-engine-v2/ThesisHero";
import { TradePlanCard } from "@/components/thesis-engine-v2/TradePlanCard";
import { getThesisDetail, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";
import { cn } from "@/lib/utils";

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return MOCK_THESES.map((t) => ({ slug: t.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const bundle = getThesisDetail(params.slug);
  if (!bundle) return { title: "Thesis · DEPTH4" };
  return {
    title: `${bundle.thesis.title} · DEPTH4`,
    description: bundle.thesis.thesisStatement.slice(0, 160),
  };
}

export default function ThesisDetailPage({ params }: Props) {
  const { slug } = params;
  const bundle = getThesisDetail(slug);
  if (!bundle) notFound();

  const { thesis, evidence, scenarios, advisoryLog, relatedAssets } = bundle;
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} live theses · ${actionable} actionable · updated 2m ago`;

  const scoreRow = (label: string, value: number, max: number) => {
    const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
    return (
      <div className="grid gap-2 sm:grid-cols-[160px_1fr_42px] sm:items-center">
        <div className="text-[11px] font-medium text-zinc-500">{label}</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
          <div
            className={cn("h-full rounded-full", pct >= 70 ? "bg-amber-500/90" : "bg-zinc-600")}
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
        <div className="text-right text-[11px] tabular-nums text-zinc-400">
          {value}/{max}
        </div>
      </div>
    );
  };

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <Link
          href="/theses"
          className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-amber-500/90"
        >
          ← All theses
        </Link>
        <div className="mt-6">
          <ThesisHero thesis={thesis} />
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <AnswerBlock kicker="Why now">{thesis.whyNow}</AnswerBlock>
          <AnswerBlock kicker="What’s unpriced">{thesis.whatsUnpriced}</AnswerBlock>
          <AnswerBlock kicker="Trigger">{thesis.trigger}</AnswerBlock>
          <AnswerBlock kicker="Trade">{thesis.trade}</AnswerBlock>
        </div>
        <div className="mt-12 space-y-12">
          <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Causal framework</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Hidden driver</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.hiddenDriver}</p>
              </div>
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Likely path</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.likelyPath}</p>
              </div>
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Market misread</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.marketMisread}</p>
              </div>
              <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Cleanest expression</p>
                <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.tradeExpression}</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
              <span className="text-zinc-600">Probability rationale · </span>
              {thesis.probabilityRationale}
            </p>
          </section>

          <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Qualification breakdown
              </h2>
              <span className="text-[11px] tabular-nums text-zinc-400">
                Total score {thesis.scores.total}/100 · {thesis.qualification}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              {scoreRow("Driver strength", thesis.scores.driverStrength, 20)}
              {scoreRow("Time compression", thesis.scores.timeCompression, 25)}
              {scoreRow("Market mispricing", thesis.scores.marketMispricingScore, 25)}
              {scoreRow("Trade clarity", thesis.scores.tradeClarityScore, 15)}
              {scoreRow("Trigger clarity", thesis.scores.triggerClarityScore, 15)}
            </div>
          </section>

          <TradePlanCard thesis={thesis} />
          <EvidenceTimeline items={evidence} />
          <ScenarioPanel scenarios={scenarios} />
          <AdvisoryLog updates={advisoryLog} />
          <section>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Related assets</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {relatedAssets.map((a) => (
                <div
                  key={a.symbol}
                  className="min-w-[140px] flex-1 rounded-lg border border-white/[0.06] bg-zinc-900/30 px-3 py-2"
                >
                  <p className="font-mono text-xs font-medium text-zinc-200">{a.symbol}</p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">{a.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
