import Link from "next/link";
import type { PromotedCardModel } from "@/lib/feed/promoted-macro-events";
import type { ThesisMeta } from "@/lib/feed/thesis-slugs";
import { thesisRelationToScanImpactLine } from "@/lib/feed/feed-thesis-impact-scan";
import { CompactScanConfidenceProb } from "@/components/macro-reasoning/ConfidenceMeter";
import { getThesisMetaDisplayTitle, getThesisMetaMicroLabel } from "@/lib/thesis-engine-v2/thesis-display-title";
import { cn } from "@/lib/utils";

export function PromotedMacroEventCard({
  card,
  thesisMetaById,
}: {
  card: PromotedCardModel;
  thesisMetaById: Map<string, ThesisMeta>;
}) {
  const { row, reasoning, headline, source, publishedLabel } = card;
  const primaryThesisId = reasoning.affected_theses[0] ?? null;
  const primaryMeta = primaryThesisId ? thesisMetaById.get(primaryThesisId) ?? null : null;
  const primaryMicro = primaryMeta ? getThesisMetaMicroLabel(primaryMeta) : null;
  const scanHeadline = (headline || "").trim() || reasoning.event_summary.trim();
  const anchorEcho =
    scanHeadline.toLowerCase() !== reasoning.event_summary.trim().toLowerCase() && reasoning.event_summary.trim()
      ? reasoning.event_summary.trim()
      : null;
  const impactLine = thesisRelationToScanImpactLine(reasoning.thesis_relation);

  return (
    <article className="border-b border-white/[0.05] py-5 last:border-0 transition-colors hover:bg-white/[0.02] sm:-mx-1 sm:rounded-lg sm:px-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        {source ? <span className="font-medium text-zinc-400">{source}</span> : null}
        {publishedLabel ? <span className="tabular-nums">{publishedLabel}</span> : null}
        <span className="rounded bg-[#E8473F]/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#E8473F]/95">
          Promoted
        </span>
      </div>

      <h2 className="mt-3 text-[15px] font-semibold leading-snug tracking-tight text-zinc-50">{scanHeadline}</h2>
      {anchorEcho ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-600" title={anchorEcho}>
          AI map · {anchorEcho}
        </p>
      ) : null}

      <div className="mt-3 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Linked thesis</p>
        {primaryMeta ? (
          <Link
            href={`/theses/${primaryMeta.slug}`}
            className="mt-1 block min-w-0 underline-offset-2 hover:text-white hover:underline"
            title={getThesisMetaDisplayTitle(primaryMeta)}
          >
            {primaryMicro ? (
              <span className="block truncate text-[11px] font-medium leading-snug text-zinc-500">{primaryMicro}</span>
            ) : null}
            <span
              className={cn(
                "block truncate text-[13px] font-semibold leading-snug text-zinc-100",
                primaryMicro ? "mt-0.5" : "",
              )}
            >
              {getThesisMetaDisplayTitle(primaryMeta)}
            </span>
          </Link>
        ) : (
          <p className="mt-1 text-[13px] font-medium leading-snug text-zinc-500">No linked thesis yet</p>
        )}
      </div>

      <p className="mt-2 text-[12px] font-medium leading-snug text-zinc-300">{impactLine}</p>

      <CompactScanConfidenceProb reasoning={reasoning} />

      <div className="mt-4">
        <Link
          href={`/feed/events/${row.news_event_id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/[0.08] bg-zinc-900/40 px-4 py-2.5 text-[12px] font-semibold text-zinc-100 transition-colors hover:border-[#E8473F]/35 hover:bg-zinc-900/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8473F] sm:min-h-0"
        >
          Open reasoning
        </Link>
      </div>
    </article>
  );
}
