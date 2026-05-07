import type { AdvisoryAction, Thesis } from "@/lib/thesis-engine-v2/types";
import { DirectionBadge } from "./DirectionBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

const ADVISORY_LABEL: Record<AdvisoryAction, string> = {
  watch: "Watch — wait for trigger clarity.",
  enter: "Enter — setup meets advisory threshold.",
  hold: "Hold — thesis intact; manage risk.",
  reduce: "Reduce — lock partial; elevated uncertainty.",
  exit: "Exit — invalidation or thesis closed.",
};

function QualificationBadge({ q }: { q: Thesis["qualification"] }) {
  const label = q === "tradeable" ? "Tradeable" : q === "emerging" ? "Emerging" : "Theme";
  return (
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
  );
}

export function ThesisHero({ thesis }: { thesis: Thesis }) {
  const entrySetupValid = thesis.status === "ready" && thesis.probability >= 55;
  return (
    <div className="border-b border-white/[0.06] pb-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{thesis.title}</h1>
        {entrySetupValid ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300/80">
            <span aria-hidden className="text-emerald-300/80">
              ●
            </span>
            Entry valid
          </span>
        ) : null}
      </div>
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
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Live probability</p>
            <span className="text-[10px] tabular-nums text-zinc-500">score {thesis.scores.total}/100</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-base font-semibold tabular-nums text-amber-200/90">{thesis.probability}%</span>
            <div className="min-w-0 flex-1">
              <ProbabilityBar value={thesis.probability} />
            </div>
          </div>
        </div>
        <div className="bg-zinc-900/40 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Horizon</p>
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
