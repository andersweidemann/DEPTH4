"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { DirectionBadge } from "./DirectionBadge";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { ThesisHeadingStack } from "@/components/thesis-engine-v2/ThesisHeadingStack";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { primaryTradeSymbolFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import { advisoryHeadlineFromResolutionPaths } from "@/lib/thesis-engine-v2/advisory-from-resolution-paths";
import { displayScenarioTripleCleanMessyBroken } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { formatQualityScore } from "@/lib/depth-labels";

function MetricPill({
  value,
  label,
  valueClassName,
}: {
  value: string;
  label: string;
  valueClassName?: string;
}) {
  return (
    <span className="inline-flex flex-col items-center rounded bg-zinc-900/50 px-2 py-1">
      <span className={cn("text-[11px] font-medium tabular-nums", valueClassName ?? "text-zinc-200")}>{value}</span>
      <span className="text-[9px] text-zinc-600">{label}</span>
    </span>
  );
}

function QualificationBadge({ q, qualityScore }: { q: Thesis["qualification"]; qualityScore?: number }) {
  const label = q === "tradeable" ? "Tradeable" : q === "emerging" ? "Emerging" : "Theme";
  const scoreLabel =
    qualityScore != null && Number.isFinite(qualityScore) ? formatQualityScore(qualityScore) : label;
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center rounded px-2 py-0.5 font-mono",
        q === "tradeable" && "text-[#E8473F]/90",
        q === "emerging" && "text-zinc-400",
        q === "theme" && "text-zinc-500",
      )}
    >
      <span className="text-[11px] font-semibold tabular-nums">{scoreLabel}</span>
      <span className="text-[9px] normal-case tracking-normal text-zinc-600">quality</span>
    </span>
  );
}

export function ThesisActionHeader({
  thesis,
  displaySourceOpts,
}: {
  thesis: Thesis;
  displaySourceOpts?: { liveEvidenceApplied?: boolean };
}) {
  const dm = getThesisDisplayModel(thesis, displaySourceOpts);
  const pathConviction = dm.convictionPct;
  const mispricing = getThesisMispricing(thesis);
  const edge = Math.round(mispricing.score);
  const primarySym = primaryTradeSymbolFromThesis(thesis);
  const [cleanPct, messyPct, brokenPct] = displayScenarioTripleCleanMessyBroken(dm.scenarios);
  const advisoryCopy = advisoryHeadlineFromResolutionPaths(cleanPct, messyPct, brokenPct, thesis.advisoryAction);
  const entrySetupValid = thesis.status === "ready" && pathConviction >= 50;

  return (
    <header className="border-b border-white/[0.06] pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ThesisHeadingStack thesis={thesis} titleAs="h1" />
          {thesis.oneLineSummary ? (
            <p className="mt-2 max-w-2xl text-[13px] leading-snug text-zinc-300">{thesis.oneLineSummary}</p>
          ) : null}
        </div>
        {entrySetupValid ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">
            <span aria-hidden>●</span> Entry valid
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DirectionBadge direction={thesis.direction} />
        <span className="font-mono text-[11px] text-zinc-400">{primarySym}</span>
        <MetricPill value={`${pathConviction}%`} label="conviction" valueClassName="text-amber-200/90" />
        <MetricPill value={`${edge}/100`} label="edge" />
        <QualificationBadge q={thesis.qualification} qualityScore={thesis.qualityScore} />
        <span className="inline-flex flex-col items-center gap-0.5">
          <StatusBadge status={thesis.status} />
          <span className="text-[9px] text-zinc-600">status</span>
          {advisoryCopy ? (
            <span className="max-w-[12rem] text-center text-[9px] leading-snug text-zinc-500">{advisoryCopy}</span>
          ) : null}
        </span>
        <MetricPill value={thesis.horizon} label="horizon" valueClassName="text-zinc-300" />
      </div>
    </header>
  );
}
