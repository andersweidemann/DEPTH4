import Link from "next/link";
import type { PromotedCardModel } from "@/lib/feed/promoted-macro-events";
import { ConfidenceMeter } from "@/components/macro-reasoning/ConfidenceMeter";

function relationLabel(r: PromotedCardModel["reasoning"]["thesis_relation"]) {
  switch (r) {
    case "confirm":
      return { text: "Confirming", tone: "text-emerald-200/90 bg-emerald-500/[0.08] ring-emerald-500/20" };
    case "contradict":
      return { text: "Challenging", tone: "text-red-200/90 bg-red-500/[0.08] ring-red-500/20" };
    case "adjacent":
      return { text: "Adjacent", tone: "text-amber-200/90 bg-amber-500/[0.08] ring-amber-500/20" };
    case "create_new":
      return { text: "New thesis", tone: "text-zinc-200/80 bg-zinc-500/[0.08] ring-white/[0.08]" };
    case "irrelevant":
    default:
      return { text: "Unlinked", tone: "text-zinc-200/70 bg-zinc-500/[0.06] ring-white/[0.08]" };
  }
}

function implicationLine(args: {
  thesisTitle: string | null;
  thesisRelation: PromotedCardModel["reasoning"]["thesis_relation"];
  impactedAssets: string[];
  directionOfChange: string;
}) {
  const { thesisTitle, thesisRelation, impactedAssets, directionOfChange } = args;
  const watch = impactedAssets.slice(0, 2).filter(Boolean).join(", ");
  const watchSuffix = watch ? ` Watch ${watch}.` : "";
  const dir = (directionOfChange || "").trim();

  if (thesisRelation === "confirm") {
    return `Thesis looks stronger.${watchSuffix}`.trim();
  }
  if (thesisRelation === "contradict") {
    return `Thesis under pressure. Tighten risk.${watchSuffix}`.trim();
  }
  if (thesisRelation === "adjacent") {
    return `Connected signal. Could shift the setup.${watchSuffix}`.trim();
  }
  if (thesisRelation === "create_new") {
    return `May be a new thesis.${dir ? ` Direction: ${dir}.` : ""}${watchSuffix}`.trim();
  }
  if (thesisRelation === "irrelevant") {
    return `Probably not tradeable.${watchSuffix}`.trim();
  }
  return thesisTitle ? `Keep it on the radar.${watchSuffix}`.trim() : `No clear trade link yet.${watchSuffix}`.trim();
}

export function PromotedMacroEventCard({
  card,
  thesisMetaById,
}: {
  card: PromotedCardModel;
  thesisMetaById: Map<string, { slug: string; title: string }>;
}) {
  const { row, reasoning, headline, source, publishedLabel } = card;
  const anchorDiffers =
    headline.trim().length > 0 && headline.trim().toLowerCase() !== reasoning.event_summary.trim().toLowerCase();
  const primaryThesisId = reasoning.affected_theses[0] ?? null;
  const primaryMeta = primaryThesisId ? thesisMetaById.get(primaryThesisId) ?? null : null;
  const rel = relationLabel(reasoning.thesis_relation);
  const hasImpactedAssets = Array.isArray(reasoning.impacted_assets) && reasoning.impacted_assets.length > 0;
  const implication = implicationLine({
    thesisTitle: primaryMeta?.title ?? null,
    thesisRelation: reasoning.thesis_relation,
    impactedAssets: Array.isArray(reasoning.impacted_assets) ? reasoning.impacted_assets : [],
    directionOfChange: reasoning.direction_of_change,
  });

  return (
    <article className="border-b border-white/[0.05] py-5 last:border-0 transition-colors hover:bg-white/[0.02] sm:-mx-1 sm:rounded-lg sm:px-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        {source ? <span className="font-medium text-zinc-400">{source}</span> : null}
        {publishedLabel ? <span className="tabular-nums">{publishedLabel}</span> : null}
        <span className="rounded bg-[#E8473F]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#E8473F]">
          Promoted narrative
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Thesis</p>
          {primaryMeta ? (
            <Link
              href={`/theses/${primaryMeta.slug}`}
              className="mt-1 block min-w-0 truncate text-[14px] font-semibold leading-snug text-zinc-100 underline-offset-2 hover:text-white hover:underline"
              title={primaryMeta.title}
            >
              {primaryMeta.title}
            </Link>
          ) : (
            <p className="mt-1 text-[13px] font-medium leading-snug text-zinc-400">No linked thesis yet</p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${rel.tone}`}>
          {rel.text}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">
        <span className="font-semibold text-zinc-200">Implication:</span> {implication}
      </p>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">What happened</p>
      <h2 className="mt-1 text-[14px] font-semibold leading-snug text-zinc-100">{reasoning.event_summary}</h2>
      {anchorDiffers ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-600" title={headline}>
          Anchor headline · {headline}
        </p>
      ) : null}
      <div className="mt-3">
        <ConfidenceMeter reasoning={reasoning} />
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Why it matters</p>
      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-zinc-300">{reasoning.reasoning_summary}</p>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Market may be missing</p>
      <p className="mt-1 line-clamp-3 text-[12px] italic leading-relaxed text-zinc-500">{reasoning.mispricing_hypothesis}</p>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Affected stocks</p>
      {hasImpactedAssets ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {reasoning.impacted_assets.slice(0, 10).map((a) => (
            <span
              key={a}
              className="rounded-md border border-white/[0.08] bg-zinc-900/40 px-2 py-1 text-[11px] font-medium text-zinc-200"
            >
              {a}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-zinc-500">No clear tickers yet.</p>
      )}
      <div className="mt-4">
        <Link
          href={`/feed-2/events/${row.news_event_id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#E8473F] px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#d63d36] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8473F] sm:min-h-0"
        >
          View reasoning
        </Link>
      </div>
    </article>
  );
}
