"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { ThesisAlertsBell } from "@/components/thesis-engine-v2/ThesisAlertsBell";
import { ThesisStarButton } from "@/components/thesis-engine-v2/ThesisStarButton";
import { AdvisoryLog } from "@/components/thesis-engine-v2/AdvisoryLog";
import { AnswerBlock } from "@/components/thesis-engine-v2/AnswerBlock";
import { EvidenceTimeline } from "@/components/thesis-engine-v2/EvidenceTimeline";
import { ScenarioPanel } from "@/components/thesis-engine-v2/ScenarioPanel";
import { ThesisHero } from "@/components/thesis-engine-v2/ThesisHero";
import { ThesisAssistantPanel } from "@/components/thesis-engine-v2/ThesisAssistantPanel";
import { ThesisOutcomePanel } from "@/components/thesis-engine-v2/ThesisOutcomePanel";
import { TradePlanCard } from "@/components/thesis-engine-v2/TradePlanCard";
import { UpgradeModal } from "@/components/thesis-engine-v2/UpgradeModal";
import { OpenPositionModal } from "@/components/thesis-engine-v2/OpenPositionModal";
import { getThesisDetail, MOCK_THESES } from "@/lib/thesis-engine-v2/mock-data";
import { bundleForUserThesis, getUserThesisBySlug } from "@/lib/thesis-engine-v2/user-theses";
import { closeReasonLabel } from "@/lib/thesis-engine-v2/close-reason";
import {
  DEPTH4_POSITIONS_CHANGED,
  latestClosedForThesis,
  openPositionForThesis,
  upsertPosition,
} from "@/lib/thesis-engine-v2/positions-store";
import { cn } from "@/lib/utils";
import type { ThesisDetailBundle } from "@/lib/thesis-engine-v2/types";
import { canUse } from "@/lib/thesis-engine-v2/plan";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";

export function ThesisDetailClient({
  slug,
  layout = "page",
  onClose,
}: {
  slug: string;
  layout?: "page" | "drawer";
  onClose?: () => void;
}) {
  const { plan } = useV2Plan();
  const liveOpt = useThesisLiveOptional();
  const [bundle, setBundle] = useState<ThesisDetailBundle | null>(() => getThesisDetail(slug) ?? null);
  const [needPro, setNeedPro] = useState(false);
  const [needCreator, setNeedCreator] = useState(false);
  const [openPos, setOpenPos] = useState(false);
  const [bookPulse, setBookPulse] = useState(0);

  useEffect(() => {
    const sys = getThesisDetail(slug);
    if (sys) {
      setBundle(sys);
      return;
    }
    const ut = getUserThesisBySlug(slug);
    if (ut) setBundle(bundleForUserThesis(ut));
    else setBundle(null);
  }, [slug]);

  useEffect(() => {
    if (!bundle) return;
    const t = window.setInterval(() => setBookPulse((n) => n + 1), 2000);
    return () => window.clearInterval(t);
  }, [bundle]);

  useEffect(() => {
    const on = () => setBookPulse((n) => n + 1);
    window.addEventListener(DEPTH4_POSITIONS_CHANGED, on);
    return () => window.removeEventListener(DEPTH4_POSITIONS_CHANGED, on);
  }, []);

  const bookSnap = useMemo(() => {
    void bookPulse;
    if (!bundle) return { open: null as ReturnType<typeof openPositionForThesis>, latest: null as ReturnType<typeof latestClosedForThesis> };
    return {
      open: openPositionForThesis(bundle.thesis.id),
      latest: latestClosedForThesis(bundle.thesis.id),
    };
  }, [bundle, bookPulse]);

  const hasOpen = !!bookSnap.open;

  const thesisLive = useMemo(() => {
    if (!bundle) return null;
    return liveOpt ? liveOpt.mergeThesis(bundle.thesis) : bundle.thesis;
  }, [bundle, liveOpt]);

  const assistBundle = useMemo(() => {
    if (!bundle || !thesisLive) return null;
    return { ...bundle, thesis: thesisLive };
  }, [bundle, thesisLive]);

  const readyCount = useMemo(() => MOCK_THESES.filter((t) => t.status === "ready").length, []);
  const liveLine = `${MOCK_THESES.length} theses tracked · ${readyCount} ready to trade · last update 2 minutes ago`;

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

  if (!bundle) {
    if (layout === "drawer") {
      return (
        <div className="px-4 py-10 sm:px-6">
          <p className="text-sm font-semibold text-zinc-100">Thesis not found</p>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
            This slug doesn&apos;t match a system thesis or a stored user thesis in this browser session.
          </p>
          {onClose ? (
            <button
              type="button"
              className="mt-6 rounded-md border border-white/[0.08] bg-zinc-900/50 px-4 py-2.5 text-[12px] font-semibold text-zinc-200 hover:bg-zinc-900/70"
              onClick={onClose}
            >
              Close
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <>
        <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
        <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
          <Link
            href="/theses"
            className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-amber-500/90"
          >
            ← All theses
          </Link>
          <div className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
            <p className="text-sm font-semibold text-zinc-100">Thesis not found</p>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
              This slug doesn&apos;t match a system thesis or a stored user thesis in this browser session.
            </p>
          </div>
        </main>
      </>
    );
  }

  const { evidence, scenarios, advisoryLog, relatedAssets } = bundle;
  const thesis = thesisLive!;
  const entrySetupValid = thesis.status === "ready" && thesis.probability >= 55;
  const liveStarred = liveOpt?.isEffectivelyStarred(thesis.id) ?? false;
  const starDisabled = liveOpt ? !!liveOpt.starDisabledReason(thesis.id) : false;

  const inner = (
    <>
      <div className={cn(layout === "drawer" ? "px-4 pb-10 pt-1 sm:px-5" : "mt-6")}>
        <ThesisHero thesis={thesis} />
      </div>

      {(entrySetupValid || hasOpen || bookSnap.latest) && (
        <div
          className={cn(
            "mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/25 px-4 py-3 text-[12px] text-zinc-300",
            layout === "drawer" && "mx-4 sm:mx-5",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {entrySetupValid && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/20">
                  Entry setup valid
                </span>
              )}
              {hasOpen && (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-500/20">
                  In your book · Active position
                </span>
              )}
              {!hasOpen && bookSnap.latest ? (
                <span className="rounded bg-zinc-800/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 ring-1 ring-white/[0.08]">
                  Closed in Book
                </span>
              ) : null}
            </div>
            {!hasOpen && entrySetupValid && !bookSnap.latest ? (
              <span className="text-[11px] text-zinc-500">
                Probability crossed threshold{thesis.entryZone ? ` · entry zone ${thesis.entryZone}` : ""}.
              </span>
            ) : null}
          </div>
          {!hasOpen && bookSnap.latest ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-200">Realized {bookSnap.latest.realizedPnl ?? "—"}</span>
              {bookSnap.latest.closeReason ? (
                <span className="text-zinc-500">· {closeReasonLabel(bookSnap.latest.closeReason)}</span>
              ) : null}
              {bookSnap.latest.closedAt ? (
                <span className="text-zinc-600">
                  ·{" "}
                  {new Date(bookSnap.latest.closedAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              <Link href="/book-2" className="ml-auto text-[11px] font-semibold text-amber-200/90 hover:text-amber-100">
                View in Book →
              </Link>
            </div>
          ) : null}
        </div>
      )}

      <div
        className={cn(
          "mt-4 flex flex-wrap items-center justify-between gap-3",
          layout === "drawer" && "px-4 sm:px-5",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
          {liveOpt ? (
            <ThesisStarButton
              filled={liveStarred}
              disabled={starDisabled}
              title={
                starDisabled
                  ? (liveOpt.starDisabledReason(thesis.id) ?? undefined)
                  : liveStarred
                    ? "Starred — alerts on"
                    : "Star — bookmark and subscribe"
              }
              onClick={() => liveOpt.toggleStar(thesis.id)}
            />
          ) : null}
          <button
            type="button"
            className="rounded border border-white/[0.06] bg-zinc-900/30 px-2 py-0.5 font-semibold uppercase tracking-wide text-zinc-400 hover:bg-zinc-900/50"
            onClick={() => setNeedPro(true)}
            title="See Pro upgrade prompt"
          >
            Pro feature
          </button>
          <button
            type="button"
            className="rounded border border-white/[0.06] bg-zinc-900/30 px-2 py-0.5 font-semibold uppercase tracking-wide text-zinc-400 hover:bg-zinc-900/50"
            onClick={() => setNeedCreator(true)}
            title="See Creator upgrade prompt"
          >
            Creator feature
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-200/90 hover:bg-emerald-500/15"
            onClick={() => setOpenPos(true)}
            title="Open a linked position in your Book (dummy)"
          >
            Open position
          </button>
          <button
            type="button"
            className="rounded-md border border-white/[0.08] bg-zinc-900/40 px-3 py-2 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-900/60"
            onClick={() => {
              if (!canUse(plan, "publishPublicly")) {
                setNeedPro(true);
                return;
              }
              alert("Dummy: published. (In the real product this creates a public thesis + leaderboard entry.)");
            }}
            title="Publish this thesis publicly (dummy)"
          >
            Publish
          </button>
          <button
            type="button"
            className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200/90 hover:bg-amber-500/15"
            onClick={() => {
              if (!canUse(plan, "monetization")) {
                setNeedCreator(true);
                return;
              }
              alert("Dummy: monetization enabled. (In the real product this opens monetization tools.)");
            }}
            title="Enable monetization tools (dummy)"
          >
            Monetize
          </button>
          <Link
            href="/risk"
            className="rounded-md border border-white/[0.08] bg-zinc-900/20 px-3 py-2 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
            title="Risk Disclosure"
          >
            Risk
          </Link>
        </div>
      </div>

      {layout === "drawer" && assistBundle ? (
        <div className={cn("mt-4", "px-4 sm:px-5")}>
          <ThesisAssistantPanel variant="drawer" bundle={assistBundle} openBookPosition={bookSnap.open} />
        </div>
      ) : null}

      <div className={cn("mt-8 grid gap-3 sm:grid-cols-2", layout === "drawer" && "px-4 sm:px-5")}>
        <AnswerBlock kicker="Why now">{thesis.whyNow}</AnswerBlock>
        <AnswerBlock kicker="What the market hasn't priced in yet">{thesis.whatsUnpriced}</AnswerBlock>
        <AnswerBlock kicker="Trigger">{thesis.trigger}</AnswerBlock>
        <AnswerBlock kicker="Trade">{thesis.trade}</AnswerBlock>
      </div>

      <div className={cn("mt-3", layout === "drawer" && "px-4 sm:px-5")}>
        <Link href="/help#read-a-thesis" className="text-[11px] font-medium text-zinc-600 hover:text-amber-200/90">
          How to read a thesis →
        </Link>
      </div>

      <div className={cn("mt-12 space-y-12", layout === "drawer" && "px-4 sm:px-5")}>
        {layout !== "drawer" && assistBundle ? (
          <ThesisAssistantPanel bundle={assistBundle} openBookPosition={bookSnap.open} />
        ) : null}

        <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Why this thesis exists</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">What&apos;s really driving this</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.hiddenDriver}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">What happens next</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.likelyPath}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Market misread</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.marketMisread}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Best way to trade it</p>
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
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Qualification breakdown</h2>
            <span className="text-[11px] tabular-nums text-zinc-400">
              Total score {thesis.scores.total}/100 · {thesis.qualification}
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {scoreRow("Driver strength", thesis.scores.driverStrength, 20)}
            {scoreRow("Time compression", thesis.scores.timeCompression, 25)}
            {scoreRow("Market hasn't caught up yet", thesis.scores.marketMispricingScore, 25)}
            {scoreRow("Trade clarity", thesis.scores.tradeClarityScore, 15)}
            {scoreRow("Trigger clarity", thesis.scores.triggerClarityScore, 15)}
          </div>
        </section>

        <TradePlanCard thesis={thesis} />
        <EvidenceTimeline items={evidence} />
        <ScenarioPanel scenarios={scenarios} />
        <AdvisoryLog updates={advisoryLog} />
        <ThesisOutcomePanel thesis={thesis} layout={layout} />
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
    </>
  );

  const modals = (
    <>
      <UpgradeModal
        open={needPro}
        onOpenChange={setNeedPro}
        requiredPlan="pro"
        featureLabel="Publish theses publicly"
      />
      <UpgradeModal
        open={needCreator}
        onOpenChange={setNeedCreator}
        requiredPlan="creator"
        featureLabel="Monetization tools"
      />
      <OpenPositionModal
        open={openPos}
        onOpenChange={setOpenPos}
        thesis={thesis}
        onCreate={(p) => {
          upsertPosition(p);
          liveOpt?.syncOpenIdsFromBook();
          setBookPulse((n) => n + 1);
        }}
      />
    </>
  );

  if (layout === "drawer") {
    return (
      <>
        {inner}
        {modals}
      </>
    );
  }

  return (
    <>
      <AppHeader active="theses" liveLine={liveLine} alertsSlot={<ThesisAlertsBell />} />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8">
        <Link href="/theses" className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-amber-500/90">
          ← All theses
        </Link>
        {inner}
      </main>
      {modals}
    </>
  );
}
