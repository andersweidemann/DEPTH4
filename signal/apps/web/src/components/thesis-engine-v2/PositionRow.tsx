import Link from "next/link";
import type { Position } from "@/lib/thesis-engine-v2/types";
import { thesisSlugById, thesisTitleById } from "@/lib/thesis-engine-v2/mock-data";
import { StatusBadge } from "./StatusBadge";

function fmtMaybe(n?: number) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return n.toString();
}

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
          <span className="rounded border border-white/[0.06] bg-zinc-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            {position.tradeStatus}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Linked thesis:{" "}
          <Link href={thesisLink} className="text-amber-500/85 hover:text-amber-400">
            {title}
          </Link>
        </p>
        <div className="mt-2 grid gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-3 py-2 text-[11px] text-zinc-500 sm:grid-cols-2">
          <div>
            <span className="text-zinc-600">Entry · </span>
            <span className="font-mono text-zinc-300">{fmtMaybe(position.entryPrice)}</span>
          </div>
          <div>
            <span className="text-zinc-600">Size · </span>
            <span className="font-mono text-zinc-300">{fmtMaybe(position.size)}</span>
          </div>
          <div>
            <span className="text-zinc-600">Stop · </span>
            <span className="font-mono text-zinc-300">{fmtMaybe(position.stopLoss)}</span>
          </div>
          <div>
            <span className="text-zinc-600">TP · </span>
            <span className="font-mono text-zinc-300">{fmtMaybe(position.takeProfit)}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-zinc-600">PnL · </span>
            <span className="font-mono text-zinc-300">{position.tradeStatus === "open" ? position.currentPnl ?? "—" : position.realizedPnl ?? "—"}</span>
          </div>
        </div>
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
