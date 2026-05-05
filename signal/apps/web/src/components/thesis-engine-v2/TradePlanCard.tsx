import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { StatusBadge } from "./StatusBadge";

export function TradePlanCard({ thesis }: { thesis: Thesis }) {
  return (
    <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Trade plan</h2>
        <StatusBadge status={thesis.status} />
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Entry zone</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{thesis.entryZone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Stop</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{thesis.stop ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Target 1</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{thesis.target1 ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Target 2</dt>
          <dd className="mt-1 font-mono text-sm text-zinc-200">{thesis.target2 ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Time horizon</dt>
          <dd className="mt-1 text-sm text-zinc-300">{thesis.horizon}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-600">Recommendation</dt>
          <dd className="mt-1 text-sm capitalize text-zinc-200">{thesis.advisoryAction}</dd>
        </div>
      </dl>
      <p className="mt-4 border-t border-white/[0.04] pt-4 font-mono text-[11px] leading-relaxed text-zinc-400">
        {thesis.trade}
      </p>
    </section>
  );
}
