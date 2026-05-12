"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { CatalogThesisPass, MacroEventReasoning } from "@/lib/macro-reasoning/schema";
import { ConfidenceMeter } from "@/components/macro-reasoning/ConfidenceMeter";
import { tickerQuoteUrl } from "@/components/macro-reasoning/ticker-link";
import { parseReasoningChainLevels } from "@/lib/macro-reasoning/reasoning-chain-levels";
import { thesisRelationDisplay } from "@/lib/macro-reasoning/thesis-relation-copy";
import type { ThesisMeta } from "@/lib/feed/thesis-slugs";
import { getThesisMetaDisplayTitle, getThesisMetaMicroLabel } from "@/lib/thesis-engine-v2/thesis-display-title";
import { cn } from "@/lib/utils";

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

const PER_CATALOG_EFFECT_CLAMP = 320;

function relevanceDisplayLabel(r: CatalogThesisPass["relevance"]): string {
  switch (r) {
    case "none":
      return "Not linked";
    case "weak":
      return "Tentative link";
    case "moderate":
      return "Moderate link";
    case "strong":
      return "Strong link";
    default:
      return r;
  }
}

function PerCatalogSecondOrderText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const t = text.trim();
  if (!t || t.length < 10) {
    return (
      <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
        No second-order path identified for this thesis.
      </p>
    );
  }
  const long = t.length > PER_CATALOG_EFFECT_CLAMP;
  const body = long && !expanded ? `${t.slice(0, PER_CATALOG_EFFECT_CLAMP)}…` : t;
  return (
    <div className="mt-3">
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">{body}</p>
      {long ? (
        <button
          type="button"
          className="mt-2 text-[11px] font-semibold text-amber-200/85 hover:text-amber-100"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function SectionCard({
  kicker,
  title,
  children,
  accent,
}: {
  kicker: string;
  title?: string;
  children: ReactNode;
  accent?: "brand";
}) {
  const border =
    accent === "brand" ? "border-[#E8473F]/25 bg-[#E8473F]/[0.06]" : "border-white/[0.06] bg-[#111110]";
  const kickerCls = accent === "brand" ? "text-[#E8473F]" : "text-zinc-500";
  return (
    <section className={`rounded-lg border px-4 py-4 md:px-5 ${border}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${kickerCls}`}>{kicker}</p>
      {title ? <h2 className="mt-1 text-[15px] font-semibold leading-snug text-white">{title}</h2> : null}
      <div className={title ? "mt-3" : "mt-2"}>{children}</div>
    </section>
  );
}

export function MacroReasoningDetail({
  reasoning,
  thesisMetaById,
  meta,
}: {
  reasoning: MacroEventReasoning;
  thesisMetaById: Map<string, ThesisMeta>;
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

  const levelBlocks = parseReasoningChainLevels(reasoning.reasoning_chain);

  return (
    <div className="space-y-8">
      <header className="space-y-4 border-b border-white/[0.06] pb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Event narrative</p>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">What happened</p>
          <h1 className="mt-2 max-w-prose text-xl font-semibold leading-snug tracking-tight text-white md:text-2xl">
            {reasoning.event_summary}
          </h1>
        </div>

        {(() => {
          const primaryId = reasoning.affected_theses[0];
          const primaryMeta = primaryId ? thesisMetaById.get(primaryId) : null;
          if (!primaryMeta) return null;
          const primaryMicro = getThesisMetaMicroLabel(primaryMeta);
          return (
            <div className="rounded-lg border border-white/[0.06] bg-[#111110] px-4 py-4 md:px-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Thesis</p>
              <Link
                href={`/theses/${primaryMeta.slug}`}
                className="mt-2 block underline-offset-2 hover:text-white hover:underline"
              >
                {primaryMicro ? (
                  <span className="block text-[11px] font-medium leading-snug text-zinc-500">{primaryMicro}</span>
                ) : null}
                <span className={cn("block text-[14px] font-semibold leading-snug text-zinc-100", primaryMicro ? "mt-0.5" : "")}>
                  {getThesisMetaDisplayTitle(primaryMeta)}
                </span>
              </Link>
            </div>
          );
        })()}

        {reasoning.probability_update || probLine ? (
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/25 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Model headline odds (event)
                </p>
                <p className="mt-1 text-[10px] leading-snug text-zinc-600">
                  Event model estimate — open thesis for live path conviction (Clean + Messy).
                </p>
              </div>
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
            Thesis relation · <span className="text-zinc-300">{thesisRelationDisplay(reasoning.thesis_relation)}</span>
          </span>
        </div>
        {(reasoning.actors.length > 0 || reasoning.geography.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {reasoning.geography.map((g) => (
              <span
                key={g}
                className="rounded-md border border-white/[0.08] bg-zinc-900/40 px-2 py-0.5 text-[11px] text-zinc-400"
              >
                {g}
              </span>
            ))}
            {reasoning.actors.slice(0, 12).map((a) => (
              <span
                key={a}
                className="rounded-md border border-white/[0.06] bg-[#111110] px-2 py-0.5 text-[11px] text-zinc-500"
              >
                {a}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-zinc-600">Updated {fmtMeta}</p>
      </header>

      <SectionCard kicker="Why it matters">
        <p className="max-w-prose text-[14px] leading-relaxed text-zinc-200">{reasoning.reasoning_summary}</p>
      </SectionCard>

      <aside
        className="rounded-lg border border-[#E8473F]/35 bg-[#E8473F]/[0.08] px-4 py-4 md:px-5"
        aria-label="Market may be missing"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E8473F]">Market may be missing</p>
        <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-zinc-100">{reasoning.mispricing_hypothesis}</p>
      </aside>

      <section aria-labelledby="reasoning-chain-heading">
        <h2 id="reasoning-chain-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Four-level causal chain
        </h2>
        {levelBlocks ? (
          <ol className="mt-4 space-y-4">
            {levelBlocks.map((b) => (
              <li
                key={`${b.num}-${b.label}`}
                className="max-w-prose rounded-lg border border-white/[0.06] bg-[#111110] px-4 py-4 md:px-5 md:py-5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Level {b.num} · {b.label}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.7] text-zinc-200">{b.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4 max-w-prose rounded-lg border border-white/[0.06] bg-[#111110] px-4 py-5 md:px-6 md:py-6">
            <p className="whitespace-pre-wrap text-[15px] leading-[1.7] text-zinc-200">{reasoning.reasoning_chain}</p>
          </div>
        )}
      </section>

      {reasoning.impacted_assets.length > 0 ? (
        <section aria-labelledby="watch-heading">
          <h2 id="watch-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Watch
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
            Tickers and indicators to track against the levels above (L2 ≈ days to ~4 weeks, L3 = this quarter, L4 = backdrop bias this year).
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {reasoning.impacted_assets.map((sym) => {
              const raw = sym.trim();
              const tickerToken = raw.replace(/^L\d\s*[—\-–:]\s*/i, "").split(/[\s,]/)[0] ?? raw;
              const href = tickerQuoteUrl(tickerToken);
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

      {reasoning.per_catalog_thesis?.length ? (
        <section aria-labelledby="per-thesis-heading">
          <h2 id="per-thesis-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Second-order read by catalog thesis
          </h2>
          <p className="mt-1 max-w-prose text-[12px] leading-relaxed text-zinc-500">
            Each line is how this cluster reaches that thesis through intermediaries (not keyword overlap).
          </p>
          <ul className="mt-4 space-y-4">
            {reasoning.per_catalog_thesis.map((row) => {
              const tm = thesisMetaById.get(row.thesis_id);
              const title = tm ? getThesisMetaDisplayTitle(tm) : row.thesis_id;
              const micro = tm ? getThesisMetaMicroLabel(tm) : null;
              return (
                <li
                  key={row.thesis_id}
                  className="max-w-prose rounded-lg border border-white/[0.06] bg-[#111110] px-4 py-4 md:px-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      {tm ? (
                        <Link
                          href={`/theses/${tm.slug}`}
                          className="text-[13px] font-semibold text-zinc-100 underline-offset-2 hover:text-white hover:underline"
                        >
                          {micro ? <span className="block text-[10px] font-medium text-zinc-500">{micro}</span> : null}
                          <span className={micro ? "mt-0.5 block" : ""}>{title}</span>
                        </Link>
                      ) : (
                        <span className="font-mono text-[12px] text-zinc-400">{row.thesis_id}</span>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500"
                      title={`Relevance: ${row.relevance} · Relation: ${row.relation_to_thesis}`}
                    >
                      {relevanceDisplayLabel(row.relevance)} · {row.relation_to_thesis.replace(/_/g, " ")}
                    </span>
                  </div>
                  <PerCatalogSecondOrderText text={row.second_order_effect} />
                  {row.third_order_backdrop?.trim() ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
                      <span className="font-semibold text-zinc-400">Backdrop: </span>
                      {row.third_order_backdrop}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {reasoning.affected_theses.length > 0 ? (
        <section aria-labelledby="theses-heading">
          <h2 id="theses-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Linked theses
          </h2>
          <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {reasoning.affected_theses.map((id) => {
              const tm = thesisMetaById.get(id);
              if (tm) {
                const linkMicro = getThesisMetaMicroLabel(tm);
                return (
                  <li key={id}>
                    <Link
                      href={`/theses/${tm.slug}`}
                      className="inline-flex min-h-11 max-w-full flex-col rounded-md border border-white/[0.1] bg-zinc-900/40 px-3 py-2 text-left text-[12px] text-zinc-200 underline-offset-2 hover:border-[#E8473F]/35 hover:text-white hover:underline sm:min-h-0 sm:py-1.5"
                    >
                      {linkMicro ? (
                        <span className="text-[10px] font-medium leading-snug text-zinc-500">{linkMicro}</span>
                      ) : null}
                      <span className={cn("font-medium text-zinc-100", linkMicro ? "mt-0.5" : "")}>
                        {getThesisMetaDisplayTitle(tm)}
                      </span>
                      <span className="mt-0.5 font-mono text-[10px] text-zinc-500">{tm.slug}</span>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={id}>
                  <span
                    title={id}
                    className="inline-flex min-h-11 items-center rounded-md border border-dashed border-zinc-700 px-2.5 py-2 font-mono text-[11px] text-zinc-500 sm:min-h-0 sm:py-1.5"
                  >
                    {id.slice(0, 8)}…
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <EffectList title="First-order effects (near-term)" items={reasoning.first_order_effects} />
      <EffectList title="Second-order effects (medium-term)" items={reasoning.second_order_effects} />
      <EffectList title="Third-order effects (backdrop)" items={reasoning.third_order_effects} />
    </div>
  );
}
