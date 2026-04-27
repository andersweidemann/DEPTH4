import Link from "next/link";
import { Lock } from "lucide-react";

/** Shown for free users where scenarios + book need Pro. */
export function ProPaywallCard({ compact }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-amber-100/90"
          : "rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/50 to-zinc-900/80 p-4 text-zinc-100 shadow-inner"
      }
    >
      <div className="flex items-start gap-2">
        <Lock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-200">Pro — scenarios & your book</p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Consequence trees (what could happen next) and a personalized layer for your positions and
            open orders are included on Pro. Free still gets the full story and hook on every event.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/pricing"
              className="inline-flex h-8 items-center justify-center rounded-md bg-amber-500 px-3 text-sm font-medium text-zinc-950 hover:bg-amber-400"
            >
              View plans
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
