import Link from "next/link";
import type { PromotedCardModel } from "@/lib/feed/promoted-macro-events";
import { ConfidenceMeter } from "@/components/macro-reasoning/ConfidenceMeter";

export function PromotedMacroEventCard({
  card,
  thesisSlugById,
}: {
  card: PromotedCardModel;
  thesisSlugById: Map<string, string>;
}) {
  const { row, reasoning, headline, source, publishedLabel } = card;

  return (
    <article className="border-b border-white/[0.05] py-5 last:border-0 transition-colors hover:bg-white/[0.02] sm:-mx-1 sm:rounded-lg sm:px-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        {source ? <span className="font-medium text-zinc-400">{source}</span> : null}
        {publishedLabel ? <span className="tabular-nums">{publishedLabel}</span> : null}
        <span className="rounded bg-[#E8473F]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#E8473F]">
          Promoted narrative
        </span>
      </div>
      <h2 className="mt-2 text-[14px] font-semibold leading-snug text-zinc-100">{headline}</h2>
      <div className="mt-3">
        <ConfidenceMeter reasoning={reasoning} />
      </div>
      <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-400">{reasoning.reasoning_summary}</p>
      <p className="mt-2 line-clamp-2 text-[12px] italic leading-relaxed text-zinc-600">{reasoning.mispricing_hypothesis}</p>
      {reasoning.affected_theses.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {reasoning.affected_theses.map((tid) => {
            const slug = thesisSlugById.get(tid);
            if (!slug) {
              return (
                <span
                  key={tid}
                  className="rounded-md border border-dashed border-zinc-700 px-2 py-0.5 font-mono text-[10px] text-zinc-600"
                  title={tid}
                >
                  thesis:{tid.slice(0, 8)}…
                </span>
              );
            }
            return (
              <Link
                key={tid}
                href={`/theses/${slug}`}
                className="rounded-md border border-white/[0.08] bg-zinc-900/50 px-2 py-1 text-[11px] text-zinc-300 underline-offset-2 hover:border-[#E8473F]/35 hover:text-white hover:underline"
              >
                {slug}
              </Link>
            );
          })}
        </div>
      ) : null}
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
