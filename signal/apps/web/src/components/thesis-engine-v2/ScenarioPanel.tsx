import type { ThesisScenario } from "@/lib/thesis-engine-v2/types";

export function ScenarioPanel({ scenarios }: { scenarios: ThesisScenario[] }) {
  const ordered = [...scenarios].sort((a, b) => {
    const rank = (l: ThesisScenario["label"]) =>
      l === "Base case" ? 0 : l === "Bull case" ? 1 : 2;
    return rank(a.label) - rank(b.label);
  });

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Scenario view</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {ordered.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold text-zinc-200">{s.label}</h3>
              <span className="text-sm font-semibold tabular-nums text-amber-500/90">{s.probability}%</span>
            </div>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Confirms</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{s.confirmation}</p>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">Consequence</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{s.marketConsequence}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
