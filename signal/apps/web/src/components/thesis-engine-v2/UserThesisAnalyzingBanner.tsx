"use client";

import { cn } from "@/lib/utils";

export function UserThesisAnalyzingBanner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-[13px] font-medium text-amber-200/90">
        <span className="mr-1.5 inline-block animate-pulse" aria-hidden>
          ⚡
        </span>
        DEPTH4 is analyzing this thesis
        <span className="inline-block w-4 animate-pulse text-amber-200/60">...</span>
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
        Trade plan, scenarios, and evidence are filling in — usually under a minute.
      </p>
    </div>
  );
}
