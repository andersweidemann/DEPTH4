import type { AdvisoryAction, Thesis } from "@/lib/thesis-engine-v2/types";
import { DirectionBadge } from "./DirectionBadge";
import { ProbabilityBar } from "./ProbabilityBar";
import { StatusBadge } from "./StatusBadge";

const ADVISORY_LABEL: Record<AdvisoryAction, string> = {
  watch: "Watch — wait for trigger clarity.",
  enter: "Enter — setup meets advisory threshold.",
  hold: "Hold — thesis intact; manage risk.",
  reduce: "Reduce — lock partial; elevated uncertainty.",
  exit: "Exit — invalidation or thesis closed.",
};

export function ThesisHero({ thesis }: { thesis: Thesis }) {
  return (
    <div className="border-b border-white/[0.06] pb-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">{thesis.title}</h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-zinc-400">{thesis.thesisStatement}</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">{thesis.asset}</span>
        <DirectionBadge direction={thesis.direction} />
        <StatusBadge status={thesis.status} />
      </div>
      <div className="mt-5 flex max-w-md items-center gap-3">
        <span className="text-xs tabular-nums text-zinc-400">Live probability</span>
        <span className="text-sm font-semibold tabular-nums text-zinc-200">{thesis.probability}%</span>
        <div className="min-w-0 flex-1">
          <ProbabilityBar value={thesis.probability} />
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-white/[0.05] bg-zinc-900/40 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Horizon</p>
          <p className="mt-1 text-sm text-zinc-200">{thesis.horizon}</p>
        </div>
        <div className="rounded-md border border-white/[0.05] bg-zinc-900/40 px-3 py-2.5">
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
