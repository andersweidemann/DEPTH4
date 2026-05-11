/**
 * Legacy prose cascade. Canonical structured four-depth UI should read `thesis.thesisDepthBook` when present
 * (`thesis-depth-canonical.ts`); keep this component until all rows migrate.
 */
import type { Thesis } from "@/lib/thesis-engine-v2/types";

const LEVELS: { key: keyof NonNullable<Thesis["thesisCascade"]>; kicker: string; sub: string }[] = [
  { key: "l1Confirmed", kicker: "L1 · Confirmed (today)", sub: "What is already true" },
  { key: "l2ThisQuarter", kicker: "L2 · This week / quarter", sub: "Headlines, earnings window, first tape move" },
  { key: "l3ThisYear", kicker: "L3 · This year", sub: "How the trade pays out across the calendar" },
  { key: "l4Backdrop2026", kicker: "L4 · 2026 backdrop", sub: "Bias for every DEPTH4 thesis this year" },
];

export function ThesisFourLevelCascade({ thesis }: { thesis: Thesis }) {
  const c = thesis.thesisCascade;
  if (!c) return null;

  return (
    <section
      className="rounded-lg border border-white/[0.06] bg-[#111110] p-5"
      aria-labelledby="thesis-cascade-heading"
    >
      <h2 id="thesis-cascade-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Four-level cascade
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        How DEPTH4 stacks the story from today&apos;s facts to the year&apos;s tape — so you see the edge and when to act.
      </p>
      <ol className="mt-4 space-y-4">
        {LEVELS.map(({ key, kicker, sub }) => (
          <li key={key} className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{kicker}</p>
            <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">{c[key]}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
