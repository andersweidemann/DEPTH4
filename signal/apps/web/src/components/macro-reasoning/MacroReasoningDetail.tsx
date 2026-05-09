import Link from "next/link";
import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { ConfidenceMeter } from "@/components/macro-reasoning/ConfidenceMeter";
import { tickerQuoteUrl } from "@/components/macro-reasoning/ticker-link";

function EffectList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-300 marker:text-zinc-600">
        {items.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export function MacroReasoningDetail({
  reasoning,
  thesisSlugById,
  meta,
}: {
  reasoning: MacroEventReasoning;
  thesisSlugById: Map<string, string>;
  meta: { model: string; prompt_version: string; created_at: string };
}) {
  const fmtMeta = new Date(meta.created_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const probLine =
    reasoning.probability_before_pct != null && reasoning.probability_after_pct != null
      ? `${reasoning.probability_before_pct}% → ${reasoning.probability_after_pct}%`
      : null;

  return (
    <div className="space-y-8">
      <header className="space-y-4 border-b border-white/[0.06] pb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Event narrative</p>
        <h1 className="max-w-prose text-xl font-semibold leading-snug tracking-tight text-white md:text-2xl">
          {reasoning.event_summary}
        </h1>

        {reasoning.thesis_trade_line ? (
          <div className="rounded-lg border border-white/[0.06] bg-[#111110] px-4 py-4 md:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Thesis</p>
            <p className="mt-2 text-[14px] leading-relaxed text-zinc-100">{reasoning.thesis_trade_line}</p>
          </div>
        ) : null}

        {reasoning.probability_update || probLine ? (
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/25 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Probability update</p>
              {probLine ? <span className="tabular-nums text-[12px] font-semibold text-zinc-200">{probLine}</span> : null}
            </div>
            {reasoning.probability_update ? (
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">{reasoning.probability_update}</p>
            ) : null}
          </div>
        ) : null}

        {reasoning.trade_implication ? (
          <div className="rounded-lg border border-[#E8473F]/25 bg-[#E8473F]/[0.06] px-4 py-4 md:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]">Trade implication</p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-100">{reasoning.trade_implication}</p>
          </div>
        ) : null}

        <ConfidenceMeter reasoning={reasoning} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span>
            Domain · <span className="text-zinc-300">{reasoning.domain}</span>
          </span>
          <span>
            Direction · <span className="text-zinc-300">{reasoning.direction_of_change}</span>
          </span>
          <span>
            Thesis relation · <span className="text-zinc-300">{reasoning.thesis_relation.replace(/_/g, " ")}</span>
          </span>
        </div>
        {(reasoning.actors.length > 0 || reasoning.geography.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {reasoning.geography.map((g) => (
              <span key={g} className="rounded-md border border-white/[0.08] bg-zinc-900/40 px-2 py-0.5 text-[11px] text-zinc-400">
                {g}
              </span>
            ))}
            {reasoning.actors.slice(0, 12).map((a) => (
              <span key={a} className="rounded-md border border-white/[0.06] bg-[#111110] px-2 py-0.5 text-[11px] text-zinc-500">
                {a}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-zinc-600">Updated {fmtMeta}</p>
      </header>

      <aside
        className="rounded-lg border border-[#E8473F]/35 bg-[#E8473F]/[0.08] px-4 py-4 md:px-5"
        aria-label="Mispricing hypothesis"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E8473F]">Mispricing hypothesis</p>
        <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-zinc-100">{reasoning.mispricing_hypothesis}</p>
      </aside>

      <section aria-labelledby="reasoning-chain-heading">
        <h2 id="reasoning-chain-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Causal chain
        </h2>
        <div className="mt-4 max-w-prose rounded-lg border border-white/[0.06] bg-[#111110] px-4 py-5 md:px-6 md:py-6">
          <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-zinc-200">{reasoning.reasoning_chain}</p>
        </div>
      </section>

      {reasoning.impacted_assets.length > 0 ? (
        <section aria-labelledby="assets-heading">
          <h2 id="assets-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Impacted assets
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {reasoning.impacted_assets.map((sym) => {
              const href = tickerQuoteUrl(sym);
              return (
                <li key={sym}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-md border border-white/[0.1] bg-zinc-900/50 px-3 py-2 text-[12px] font-medium text-[#E8473F] underline-offset-2 hover:border-[#E8473F]/40 hover:underline sm:min-h-0 sm:py-1.5"
                  >
                    {sym}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {reasoning.impacted_sectors.length > 0 ? (
        <section>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Sectors</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {reasoning.impacted_sectors.map((s) => (
              <span key={s} className="rounded-md bg-zinc-800/80 px-2.5 py-1 text-[12px] text-zinc-300">
                {s}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {reasoning.affected_theses.length > 0 ? (
        <section aria-labelledby="theses-heading">
          <h2 id="theses-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Linked theses
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {reasoning.affected_theses.map((id) => {
              const slug = thesisSlugById.get(id);
              if (slug) {
                return (
                  <li key={id}>
                    <Link
                      href={`/theses/${slug}`}
                      className="inline-flex min-h-11 items-center rounded-md border border-white/[0.1] bg-zinc-900/40 px-3 py-2 text-[12px] text-zinc-200 underline-offset-2 hover:border-[#E8473F]/35 hover:text-white hover:underline sm:min-h-0 sm:py-1.5"
                    >
                      {slug}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={id}>
                  <span
                    title={id}
                    className="inline-flex rounded-md border border-dashed border-zinc-700 px-2.5 py-1 font-mono text-[11px] text-zinc-500"
                  >
                    {id.slice(0, 8)}…
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <EffectList title="First-order effects" items={reasoning.first_order_effects} />
      <EffectList title="Second-order effects" items={reasoning.second_order_effects} />
      <EffectList title="Third-order effects" items={reasoning.third_order_effects} />

      <section className="border-t border-white/[0.06] pt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Summary</h2>
        <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-zinc-400">{reasoning.reasoning_summary}</p>
      </section>
    </div>
  );
}
