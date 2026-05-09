import Link from "next/link";
import type { FeedSignal } from "@/lib/thesis-engine-v2/types";
import { normalizeThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

export function FeedSignalCard({ item }: { item: FeedSignal }) {
  const rawLinked = (item.linkedThesisTitle ?? "").trim();
  const linkedTitle = rawLinked ? normalizeThesisDisplayTitle(rawLinked) : "";
  const linked = Boolean(item.linkedThesisSlug && rawLinked);

  return (
    <article
      className={[
        "border-b border-white/[0.05] py-4 last:border-0",
        "transition-colors hover:bg-white/[0.03]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        <span className="font-medium text-zinc-400">{item.source}</span>
        <span className="tabular-nums">{item.timestamp}</span>
      </div>
      <h2 className="mt-2 text-[13px] font-medium leading-snug text-zinc-100">{item.headline}</h2>
      {!linked ? <p className="mt-1 text-[11px] text-zinc-600">No thesis match</p> : null}
      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{item.summary}</p>
      {linked ? (
        <div className="mt-3">
          <Link
            href={`/theses/${item.linkedThesisSlug}`}
            className="inline-flex rounded-md px-2.5 py-1 text-[10px] font-medium text-zinc-300 hover:text-zinc-100"
          >
            Linked · {linkedTitle}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
