"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { DirectionBadge } from "./DirectionBadge";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { THESIS_DETAIL_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { ThesisHeadingStack } from "@/components/thesis-engine-v2/ThesisHeadingStack";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { primaryTradeSymbolFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";
import { advisoryHeadlineFromResolutionPaths } from "@/lib/thesis-engine-v2/advisory-from-resolution-paths";
import { displayScenarioTripleCleanMessyBroken } from "@/lib/thesis-engine-v2/thesis-display-scenarios";

function QualificationBadge({ q, qualityScore }: { q: Thesis["qualification"]; qualityScore?: number }) {
  const label = q === "tradeable" ? "Tradeable" : q === "emerging" ? "Emerging" : "Theme";
  const qDisplay = qualityScore != null && Number.isFinite(qualityScore) ? `Q${Math.round(qualityScore)}` : label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        q === "tradeable" && "text-[#E8473F]/90",
        q === "emerging" && "text-zinc-400",
        q === "theme" && "text-zinc-500",
      )}
    >
      {qDisplay}
      <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.qualityBadge} maxWidth={220} />
    </span>
  );
}

function statusTooltip(status: Thesis["status"], advisory: string): string {
  const base =
    status === "ready"
      ? "Ready — entry conditions met."
      : status === "active"
        ? "Active — position open or thesis live in book."
        : status === "watching"
          ? "Watching — wait for trigger or better edge."
          : status === "forming"
            ? "Forming — thesis still building."
            : status === "resolved"
              ? "Resolved — outcome recorded."
              : "Invalidated — stand down.";
  return `${base} ${advisory ? `Now: ${advisory}` : ""}`.trim();
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
        <span className="inline-flex items-center gap-1 rounded bg-zinc-900/50 px-2 py-1 text-[11px] tabular-nums text-amber-200/90">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Conviction</span>
          {pathConviction}%
          <InfoTooltip
            text={`${THESIS_DETAIL_TOOLTIPS.conviction}${thesis.probabilityRationale ? ` ${thesis.probabilityRationale.slice(0, 160)}` : ""}`}
            maxWidth={240}
          />
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-zinc-900/50 px-2 py-1 text-[11px] tabular-nums text-zinc-200">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Edge</span>
          {edge}
          <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.edge} maxWidth={220} />
        </span>
        <QualificationBadge q={thesis.qualification} qualityScore={thesis.qualityScore} />
        <span className="inline-flex items-center gap-1">
          <StatusBadge status={thesis.status} />
          <InfoTooltip text={statusTooltip(thesis.status, advisoryCopy)} maxWidth={240} />
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-300">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Horizon</span>
          {thesis.horizon}
          <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.horizon} maxWidth={200} />
        </span>
      </div>
    </header>
  );
}
