"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CrossThesisUpdate } from "@/types/feed";

export function CrossThesisFeedItem({
  update,
  onCreateThesis,
}: {
  update: CrossThesisUpdate;
  onCreateThesis?: () => void;
}) {
  const viewSlug =
    update.affectedThesisSlug !== update.affectingThesisSlug
      ? update.affectedThesisSlug
      : update.affectingThesisSlug;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        update.severity === "conflict" && "border-red-500/20 bg-red-500/5",
        update.severity === "opportunity" && "border-emerald-500/20 bg-emerald-500/5",
        update.severity === "info" && "border-amber-500/20 bg-amber-500/5",
      )}
    >
      <p
        className={cn(
          "text-[12px] font-medium leading-snug",
          update.severity === "conflict" && "text-red-400",
          update.severity === "opportunity" && "text-emerald-400",
          update.severity === "info" && "text-amber-400",
        )}
      >
        {update.message}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <Link
          href={`/theses/${viewSlug}`}
          className="text-[11px] text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
        >
          View thesis →
        </Link>
        {update.severity === "opportunity" && onCreateThesis ? (
          <button
            type="button"
            onClick={onCreateThesis}
            className="text-[11px] text-[#E8473F] transition-colors hover:text-[#ff5c52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            Create thesis →
          </button>
        ) : null}
      </div>
    </div>
  );
}
