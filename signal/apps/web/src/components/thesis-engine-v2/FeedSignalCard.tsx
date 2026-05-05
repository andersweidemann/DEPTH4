import Link from "next/link";
import type { FeedSignal } from "@/lib/thesis-engine-v2/types";

export function FeedSignalCard({ item }: { item: FeedSignal }) {
  const linked = item.linkedThesisSlug && item.linkedThesisTitle;

  return (
    <article className="border-b border-white/[0.05] py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        <span className="font-medium text-zinc-400">{item.source}</span>
        <span className="tabular-nums">{item.timestamp}</span>
      </div>
      <h2 className="mt-2 text-[13px] font-medium leading-snug text-zinc-100">{item.headline}</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{item.summary}</p>
      <div className="mt-3">
        {linked ? (
          <Link
            href={`/theses/${item.linkedThesisSlug}`}
            className="inline-flex rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[10px] font-medium text-amber-500/90 transition-colors hover:border-amber-500/35"
          >
            Linked · {item.linkedThesisTitle}
          </Link>
        ) : (
          <span className="inline-flex rounded-md border border-zinc-700/60 bg-zinc-900/50 px-2.5 py-1 text-[10px] font-medium text-zinc-500">
            Propose thesis
          </span>
        )}
      </div>
    </article>
  );
}
