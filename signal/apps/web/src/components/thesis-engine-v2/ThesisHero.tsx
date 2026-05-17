import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { DirectionBadge } from "./DirectionBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { ThesisHeadingStack } from "@/components/thesis-engine-v2/ThesisHeadingStack";
import { MispricingTooltipContent } from "./MispricingTooltipContent";
import { displayScenarioTripleCleanMessyBroken } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import {
  THESIS_CONVICTION_EXPLAINER_PREFERRED,
  THESIS_CONVICTION_EXPLAINER_SHORT,
  THESIS_CONVICTION_LABEL,
  THESIS_CONVICTION_TEMPLATE_NOTE_SHORT,
  THESIS_CONVICTION_TOOLTIP,
  thesisConvictionActionGuidance,
} from "@/lib/thesis-engine-v2/thesis-conviction-microcopy";
import { advisoryHeadlineFromResolutionPaths } from "@/lib/thesis-engine-v2/advisory-from-resolution-paths";
import { ThesisDisplaySourceDebug } from "@/components/thesis-engine-v2/ThesisDisplaySourceDebug";
import { primaryTradeSymbolFromThesis } from "@/lib/thesis-engine-v2/thesis-structured-anatomy";

function QualificationBadge({ q }: { q: Thesis["qualification"] }) {
  const label = q === "tradeable" ? "Tradeable" : q === "emerging" ? "Emerging" : "Theme";
  const tip =
    q === "tradeable"
      ? "Thesis meets the action bar: clear trigger, trade line, and odds."
      : q === "emerging"
        ? "Thesis is forming, not yet actionable"
        : "High-level theme; trigger and trade line may still be forming";
  return (
    <Tooltip label={tip}>
      <span
        className={cn(
          "inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          q === "tradeable" && "text-amber-200/80",
          q === "emerging" && "text-zinc-400",
          q === "theme" && "text-zinc-500",
        )}
      >
        {label}
      </span>
    </Tooltip>
  );
}

export function ThesisHero({
  thesis,
  displaySourceOpts,
}: {
  thesis: Thesis;
  /** When live merged thesis differs from bundle base, marks debug source as live-evidence. */
  displaySourceOpts?: { liveEvidenceApplied?: boolean };
}) {
  const dm = getThesisDisplayModel(thesis, displaySourceOpts);
  const pathConviction = dm.convictionPct;
  const entrySetupValid = thesis.status === "ready" && pathConviction >= 50;
  const mispricing = getThesisMispricing(thesis);
  const [cleanPct, messyPct, brokenPct] = displayScenarioTripleCleanMessyBroken(dm.scenarios);
  const actionGuidance = thesisConvictionActionGuidance(cleanPct, messyPct, brokenPct);
  const advisoryCopy = advisoryHeadlineFromResolutionPaths(cleanPct, messyPct, brokenPct, thesis.advisoryAction);
  const showMispricingHeadline =
    Number.isFinite(mispricing.score) && Math.abs(Math.round(mispricing.score) - Math.round(pathConviction)) >= 2;
  const primarySym = primaryTradeSymbolFromThesis(thesis);
  const anatomy = thesis.structuredAnatomy;
  const showAnatomyMispricing =
    anatomy &&
    anatomy.market_is_pricing.trim() &&
    anatomy.depth4_edge.trim() &&
    anatomy.depth4_edge.toLowerCase() !== anatomy.market_is_pricing.toLowerCase();

  return (
    <div className="border-b border-white/[0.06] pb-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <ThesisHeadingStack thesis={thesis} titleAs="h1" />
        </div>
        {entrySetupValid ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300/80">
            <span aria-hidden className="text-emerald-300/80">
              ●
            </span>
            Entry valid
          </span>
        ) : null}
      </div>
      {thesis.oneLineSummary ? (
        <p className="mt-3 max-w-2xl text-[15px] font-medium leading-snug tracking-tight text-zinc-100">
          {thesis.oneLineSummary}
        </p>
      ) : null}
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-zinc-400">{thesis.thesisStatement}</p>
      {showAnatomyMispricing ? (
        <>
          <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-zinc-400">
            <span className="text-zinc-500">Market is pricing · </span>
            {anatomy!.market_is_pricing}
          </p>
          <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-amber-200/85">
            <span className="text-zinc-500">DEPTH4 edge · </span>
            {anatomy!.depth4_edge}
          </p>
        </>
      ) : thesis.marketMisread.trim() ? (
        <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-amber-200/85">
          <span className="text-zinc-500">Market misread · </span>
          {thesis.marketMisread}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-300">
          Trade · {primarySym}
          {thesis.direction === "long" || thesis.direction === "short" ? (
            <span className="text-zinc-500"> · {thesis.direction}</span>
          ) : null}
        </span>
        {primarySym !== thesis.asset.trim().toUpperCase() && thesis.asset.trim() && thesis.asset !== "—" ? (
          <span className="text-[10px] text-zinc-600">(headline asset {thesis.asset})</span>
        ) : null}
        <DirectionBadge direction={thesis.direction} />
        <StatusBadge status={thesis.status} showHint />
        <QualificationBadge q={thesis.qualification} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <Tooltip label={THESIS_CONVICTION_TOOLTIP}>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{THESIS_CONVICTION_LABEL}</p>
            </Tooltip>
            {showMispricingHeadline ? (
              <Tooltip label={<MispricingTooltipContent m={mispricing} />}>
                <span className="text-[10px] tabular-nums text-zinc-500">
                  Mispricing score <span className="font-medium text-zinc-400">{mispricing.score}</span>/100
                </span>
              </Tooltip>
            ) : (
              <Tooltip label={<MispricingTooltipContent m={mispricing} />}>
                <span className="text-[10px] text-zinc-600">Mispricing matches conviction — see breakdown</span>
              </Tooltip>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Tooltip label={THESIS_CONVICTION_TOOLTIP}>
              <span className="text-base font-semibold tabular-nums text-amber-200/90">{pathConviction}%</span>
            </Tooltip>
            <div className="min-w-0 flex-1">
              <ProbabilityBar value={pathConviction} />
            </div>
          </div>
          <ThesisDisplaySourceDebug convictionPct={dm.convictionPct} scenarioSource={dm.scenarioSource} />
          {dm.convictionIsTemplateEstimate ? (
            <p
              className="mt-2 text-[10px] leading-relaxed text-zinc-600"
              data-testid="thesis-conviction-template-note"
            >
              {THESIS_CONVICTION_TEMPLATE_NOTE_SHORT}
            </p>
          ) : null}
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 sm:hidden">{THESIS_CONVICTION_EXPLAINER_SHORT}</p>
          <p className="mt-2 hidden text-[11px] leading-relaxed text-zinc-500 sm:block">{THESIS_CONVICTION_EXPLAINER_PREFERRED}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-200/75">{actionGuidance}</p>
        </div>
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <Tooltip label="Expected timeframe for thesis to play out">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Horizon</p>
          </Tooltip>
          <p className="mt-1 text-sm text-zinc-200">{thesis.horizon}</p>
        </div>
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Advisory</p>
          <p className="mt-1 text-sm text-amber-200/90">{advisoryCopy}</p>
        </div>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-red-400/85">
        <span className="font-medium text-zinc-500">Invalidation · </span>
        {thesis.invalidation}
      </p>
    </div>
  );
}
