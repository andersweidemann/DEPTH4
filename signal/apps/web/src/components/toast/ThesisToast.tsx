"use client";

import Link from "next/link";
import type { CausalThesis } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

export type ThesisToastType = "new" | "updated" | "resolved";

export function ThesisToast({
  thesis,
  type,
  onDismiss,
}: {
  thesis: Pick<CausalThesis, "slug" | "title">;
  type: ThesisToastType;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border p-3 shadow-xl",
        type === "new" && "border-amber-500/30 bg-amber-500/10",
        type === "updated" && "border-blue-500/30 bg-blue-500/10",
        type === "resolved" && "border-emerald-500/30 bg-emerald-500/10",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 text-[14px]",
            type === "new" && "text-amber-400",
            type === "updated" && "text-blue-400",
            type === "resolved" && "text-emerald-400",
          )}
          aria-hidden
        >
          {type === "new" ? "★" : type === "updated" ? "↻" : "✓"}
        </span>
        <div>
          <p className="text-[11px] font-medium text-zinc-200">
            {type === "new" && "New thesis formed"}
            {type === "updated" && "Thesis updated"}
            {type === "resolved" && "Thesis resolved"}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">{thesis.title}</p>
          <div className="mt-1.5 flex gap-2">
            <Link href={`/theses/${thesis.slug}`} className="text-[10px] text-[#E8473F] hover:text-[#E8473F]/80">
              View →
            </Link>
            <button
              type="button"
              onClick={onDismiss}
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
