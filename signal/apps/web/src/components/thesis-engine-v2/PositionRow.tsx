import Link from "next/link";
import type { Position } from "@/lib/thesis-engine-v2/types";
import { thesisSlugById, thesisTitleById } from "@/lib/thesis-engine-v2/mock-data";
import { StatusBadge } from "./StatusBadge";

export function PositionRow({ position }: { position: Position }) {
  const title = thesisTitleById(position.linkedThesisId);
  const slug = thesisSlugById(position.linkedThesisId);
  const thesisLink = slug ? `/theses/${slug}` : "/theses";

  return (
    <div className="grid gap-3 border-b border-white/[0.05] py-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-zinc-200">{position.symbol}</span>
          <span
            className={
              position.side === "long"
                ? "text-[10px] font-semibold uppercase text-emerald-400"
                : "text-[10px] font-semibold uppercase text-red-400"
            }
          >
            {position.side}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Linked thesis:{" "}
          <Link href={thesisLink} className="text-amber-500/85 hover:text-amber-400">
            {title}
          </Link>
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">{position.latestUpdate}</p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <StatusBadge status={position.thesisStatus} />
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Rec · {position.recommendation}</span>
        <span className="text-sm font-semibold tabular-nums text-zinc-300">{position.probability}%</span>
      </div>
    </div>
  );
}
