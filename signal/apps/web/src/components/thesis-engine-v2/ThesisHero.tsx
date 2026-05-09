import type { AdvisoryAction, Thesis } from "@/lib/thesis-engine-v2/types";
import { DirectionBadge } from "./DirectionBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { MispricingTooltipContent } from "./MispricingTooltipContent";

const ADVISORY_LABEL: Record<AdvisoryAction, string> = {
  watch: "Watch — wait for the trigger you wrote.",
  enter: "Enter — odds and trigger meet the advisory bar.",
  hold: "Hold — thesis intact; manage risk.",
  reduce: "Reduce — lock partial; elevated uncertainty.",
  exit: "Exit — invalidation or thesis closed.",
};

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

export function ThesisHero({ thesis }: { thesis: Thesis }) {
  const entrySetupValid = thesis.status === "ready" && thesis.probability >= 55;
  const mispricing = getThesisMispricing(thesis);
  return (
    <div className="border-b border-white/[0.06] pb-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{getThesisDisplayTitle(thesis)}</h1>
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
      <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-amber-200/85">
        <span className="text-zinc-500">Market misread · </span>
        {thesis.marketMisread}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">{thesis.asset}</span>
        <DirectionBadge direction={thesis.direction} />
        <StatusBadge status={thesis.status} showHint />
        <QualificationBadge q={thesis.qualification} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <Tooltip label="Likelihood estimate based on current evidence">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Live probability</p>
            </Tooltip>
            <Tooltip label={<MispricingTooltipContent m={mispricing} />}>
              <span className="text-[10px] tabular-nums text-zinc-500">score {mispricing.score}/100</span>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Tooltip label="Likelihood estimate based on current evidence">
              <span className="text-base font-semibold tabular-nums text-amber-200/90">{thesis.probability}%</span>
            </Tooltip>
            <div className="min-w-0 flex-1">
              <ProbabilityBar value={thesis.probability} />
            </div>
          </div>
        </div>
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <Tooltip label="Expected timeframe for thesis to play out">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Horizon</p>
          </Tooltip>
          <p className="mt-1 text-sm text-zinc-200">{thesis.horizon}</p>
        </div>
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Advisory</p>
          <p className="mt-1 text-sm text-amber-200/90">{ADVISORY_LABEL[thesis.advisoryAction]}</p>
        </div>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-red-400/85">
        <span className="font-medium text-zinc-500">Invalidation · </span>
        {thesis.invalidation}
      </p>
    </div>
  );
}
