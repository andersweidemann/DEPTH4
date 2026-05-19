/**
 * Four-depth geopolitical chain — prefers Phase 3B `structuredAnatomy.four_level` when present.
 */
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

const SEMANTIC_LEVELS = [
  {
    key: "level1_narrative" as const,
    kicker: "D1 — Confirmed (0–24h)",
    sub: "What Tier 1–2 sources verify now — officials, prints, hard data; no speculation.",
  },
  {
    key: "level2_mechanism" as const,
    kicker: "D2 — This week (1–7 days)",
    sub: "Transmission path — how the catalyst moves positioning, flows, and the first tape reaction.",
  },
  {
    key: "level3_mispricing" as const,
    kicker: "D3 — This month (7–30 days)",
    sub: "What consensus is still pricing wrong or too cleanly — the wedge DEPTH4 is trading.",
  },
  {
    key: "level4_resolution" as const,
    kicker: "D4 — This quarter (30–90+ days)",
    sub: "How the thesis resolves if right — trade consequence and stand-down path.",
  },
];

const LEGACY_LEVELS: { key: keyof NonNullable<Thesis["thesisCascade"]>; kicker: string; sub: string }[] = [
  { key: "l1Confirmed", kicker: "D1 — Confirmed (today)", sub: "What Tier 1–2 sources verify now — officials, prints, hard data; no speculation." },
  { key: "l2ThisQuarter", kicker: "D2 — This week (1–7 days)", sub: "Near-term tape: first moves, positioning, spillover, immediate catalysts." },
  { key: "l3ThisYear", kicker: "D3 — This month (7–30 days)", sub: "Second-order story: policy, supply chains, FX, commodities, sector rotation." },
  { key: "l4Backdrop2026", kicker: "D4 — This quarter (30–90 days)", sub: "Regime-level bias: how this thesis fits the broader DEPTH4 macro backdrop." },
];

function readDeepReasoning(thesis: Thesis): { d3?: string; d4?: string } {
  const dr = thesis.deepReasoning;
  if (!dr) return {};
  const d3 = (dr.D3 ?? "").trim();
  const d4 = (dr.D4 ?? "").trim();
  return { ...(d3 ? { d3 } : {}), ...(d4 ? { d4 } : {}) };
}

export function ThesisFourLevelCascade({
  thesis,
  variant = "default",
}: {
  thesis: Thesis;
  variant?: "default" | "reader";
}) {
  const reader = variant === "reader";
  const deep = readDeepReasoning(thesis);
  const fl = thesis.structuredAnatomy?.four_level;
  const hasSemantic =
    fl &&
    (fl.level1_narrative.trim() ||
      fl.level2_mechanism.trim() ||
      fl.level3_mispricing.trim() ||
      fl.level4_resolution.trim());

  if (hasSemantic && fl) {
    return (
      <section
        className={cn(
          reader ? "border-t border-white/[0.06] pt-2" : "rounded-lg border border-white/[0.06] bg-[#111110] p-5",
        )}
        aria-labelledby="thesis-cascade-heading"
      >
        <h2
          id="thesis-cascade-heading"
          className={cn(
            "font-semibold uppercase tracking-[0.14em] text-zinc-500",
            reader ? "text-[10px]" : "text-[11px]",
          )}
        >
          Four-depth chain
        </h2>
        {!reader ? (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
            Confirmed facts → mechanism → mispricing → resolution. Asset-level expression lives in the trade line and edge
            map below.
          </p>
        ) : null}
        <ol className={cn("space-y-4", reader ? "mt-6" : "mt-4")}>
          {SEMANTIC_LEVELS.map(({ key, kicker, sub }) => {
            const body =
              key === "level3_mispricing" && deep.d3
                ? deep.d3
                : key === "level4_resolution" && deep.d4
                  ? deep.d4
                  : fl[key].trim();
            if (!body) return null;
            return (
              <li
                key={key}
                className={cn(
                  reader ? "border-b border-white/[0.05] pb-6 last:border-0 last:pb-0" : "rounded-md border border-white/[0.05] bg-zinc-900/30 px-4 py-3",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{kicker}</p>
                {!reader ? <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p> : null}
                <p className={cn("mt-2 text-zinc-200", reader ? "text-[15px] leading-[1.65]" : "text-[13px] leading-relaxed")}>
                  {body}
                </p>
              </li>
            );
          })}
        </ol>
        {thesis.structuredAnatomy?.trade_implication?.trim() ? (
          <p className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-zinc-400">
            <span className="font-medium text-zinc-500">Trade expression · </span>
            {thesis.structuredAnatomy.trade_implication}
          </p>
        ) : null}
      </section>
    );
  }

  const c = thesis.thesisCascade;
  if (!c) return null;

  return (
    <section
      className="rounded-lg border border-white/[0.06] bg-[#111110] p-5"
      aria-labelledby="thesis-cascade-heading"
    >
      <h2 id="thesis-cascade-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Four-depth chain
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        How the causal chain unfolds from verified facts to quarter-scale regime risk — one depth at a time. (Asset-level
        mispricing lives in the edge map below.)
      </p>
      <ol className="mt-4 space-y-4">
        {LEGACY_LEVELS.map(({ key, kicker, sub }) => {
          const text =
            key === "l3ThisYear" && deep.d3
              ? deep.d3
              : key === "l4Backdrop2026" && deep.d4
                ? deep.d4
                : c[key];
          return (
            <li key={key} className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{kicker}</p>
              <p className="mt-0.5 text-[10px] text-zinc-600">{sub}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">{text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
