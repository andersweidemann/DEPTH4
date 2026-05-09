import Link from "next/link";
import type { FeedSignal } from "@/lib/thesis-engine-v2/types";
import { formatThesisMicroLabel, normalizeThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

export function FeedSignalCard({ item }: { item: FeedSignal }) {
  const rawLinked = (item.linkedThesisTitle ?? "").trim();
  const linkedTitle = rawLinked ? normalizeThesisDisplayTitle(rawLinked) : "";
  const linked = Boolean(item.linkedThesisSlug && rawLinked);
  const micro = formatThesisMicroLabel(item.linkedThesisMicroLabel);
  const impact = (item.thesisImpact ?? "").trim();

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
      <h2 className="mt-2 text-[15px] font-semibold leading-snug tracking-tight text-zinc-50">{item.headline}</h2>

      <div className="mt-3 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Linked thesis</p>
        {linked ? (
          <Link
            href={`/theses/${item.linkedThesisSlug}`}
            className="mt-1 block min-w-0 underline-offset-2 hover:text-white hover:underline"
            title={linkedTitle}
          >
            {micro ? <span className="block truncate text-[11px] font-medium leading-snug text-zinc-500">{micro}</span> : null}
            <span className={`block truncate text-[13px] font-semibold leading-snug text-zinc-100 ${micro ? "mt-0.5" : ""}`}>
              {linkedTitle}
            </span>
          </Link>
        ) : (
          <p className="mt-1 text-[13px] font-medium leading-snug text-zinc-500">No linked thesis yet</p>
        )}
      </div>

      {impact ? <p className="mt-2 text-[12px] font-medium leading-snug text-zinc-300">{impact}</p> : null}
    </article>
  );
}
