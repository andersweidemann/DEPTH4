"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { positionsForThesis } from "@/lib/thesis-engine-v2/positions-store";
import {
  DEPTH4_THESIS_OUTCOMES_CHANGED,
  getThesisOutcome,
  type ManualThesisOutcome,
} from "@/lib/thesis-engine-v2/thesis-outcomes-store";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function ThesisOutcomePanel({ thesis, layout }: { thesis: Thesis; layout: "page" | "drawer" }) {
  const live = useThesisLiveOptional();
  const [sessionOutcome, setSessionOutcome] = useState<ManualThesisOutcome | undefined>(() => getThesisOutcome(thesis.id));

  useEffect(() => {
    const sync = () => setSessionOutcome(getThesisOutcome(thesis.id));
    sync();
    window.addEventListener(DEPTH4_THESIS_OUTCOMES_CHANGED, sync);
    return () => window.removeEventListener(DEPTH4_THESIS_OUTCOMES_CHANGED, sync);
  }, [thesis.id]);

  const book = positionsForThesis(thesis.id);
  const openN = book.filter((p) => p.tradeStatus === "open").length;
  const closedN = book.filter((p) => p.tradeStatus === "closed").length;

  const ended =
    thesis.status === "resolved" || thesis.status === "invalidated" || sessionOutcome != null;

  return (
    <section
      className={cn(
        "rounded-none bg-zinc-900/25",
        layout === "drawer" ? "p-3.5" : "p-4",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Outcome & history</h2>
        <Link href="/book-2" className="text-[10px] font-semibold text-amber-200/90 hover:text-amber-100">
          Book →
        </Link>
      </div>

      <div className="mt-2.5 bg-zinc-950/35 px-3 py-2.5 text-[11px] text-zinc-400">
        <span className="text-zinc-600">Linked trades (session) · </span>
        <span className="tabular-nums text-zinc-300">{openN}</span> open ·{" "}
        <span className="tabular-nums text-zinc-300">{closedN}</span> closed (full exits)
      </div>

      {sessionOutcome ? (
        <div className="mt-2.5 bg-amber-500/[0.06] px-3 py-2.5 text-[12px] text-zinc-200">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">Session outcome</p>
          <p className="mt-1">
            <span className="font-semibold text-zinc-100">{sessionOutcome.status === "resolved" ? "Resolved" : "Invalidated"}</span>
            <span className="text-zinc-500"> · {fmtWhen(sessionOutcome.at)}</span>
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            Cards, desk alerts, and this page reflect this end state until you clear it. Compare with your Book lines
            above.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
          Mark how you are retiring this idea in this browser. This does not change your broker — it ties the thesis
          story to your Book review.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="thesis-mark-resolved"
          disabled={!live || ended}
          onClick={() => live?.setManualThesisOutcome(thesis.id, "resolved", getThesisDisplayTitle(thesis))}
          className={cn(
            "rounded-md px-3 py-2 text-[11px] font-semibold ring-1 transition-colors",
            !live || ended
              ? "cursor-not-allowed bg-zinc-900/30 text-zinc-600 ring-white/[0.06]"
              : "bg-emerald-500/10 text-emerald-200 ring-emerald-500/25 hover:bg-emerald-500/15",
          )}
        >
          Mark resolved
        </button>
        <button
          type="button"
          disabled={!live || ended}
          onClick={() => live?.setManualThesisOutcome(thesis.id, "invalidated", getThesisDisplayTitle(thesis))}
          className={cn(
            "rounded-md px-3 py-2 text-[11px] font-semibold ring-1 transition-colors",
            !live || ended
              ? "cursor-not-allowed bg-zinc-900/30 text-zinc-600 ring-white/[0.06]"
              : "bg-red-500/10 text-red-200/95 ring-red-500/25 hover:bg-red-500/15",
          )}
        >
          Mark invalidated
        </button>
        <button
          type="button"
          disabled={!live || !sessionOutcome}
          onClick={() => live?.setManualThesisOutcome(thesis.id, null, getThesisDisplayTitle(thesis))}
          className={cn(
            "rounded-md px-3 py-2 text-[11px] font-semibold ring-1 transition-colors",
            !live || !sessionOutcome
              ? "cursor-not-allowed bg-zinc-900/30 text-zinc-600 ring-white/[0.06]"
              : "bg-zinc-900/50 text-zinc-300 ring-white/[0.08] hover:bg-zinc-900/70",
          )}
        >
          Clear session outcome
        </button>
      </div>
      {!live ? <p className="mt-2 text-[10px] text-zinc-600">Outcome controls require the live thesis shell.</p> : null}
    </section>
  );
}
