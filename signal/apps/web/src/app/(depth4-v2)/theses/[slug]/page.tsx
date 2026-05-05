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
