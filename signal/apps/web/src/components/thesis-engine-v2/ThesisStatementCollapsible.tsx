"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { CollapsibleThesisSection } from "@/components/thesis-engine-v2/CollapsibleThesisSection";
import { retailDetailSnippet, thesisProseEquals } from "@/lib/thesis-engine-v2/thesis-text-utils";

export function ThesisStatementCollapsible({ thesis }: { thesis: Thesis }) {
  const misread =
    thesis.marketMisread?.trim() &&
    !thesisProseEquals(thesis.marketMisread, thesis.thesisStatement)
      ? retailDetailSnippet(thesis.marketMisread, { maxSentences: 2, maxWords: 40 })
      : null;

  return (
    <CollapsibleThesisSection
      title="Statement"
      subtitle="Full thesis — cause, path, timing, and trade expression."
      defaultOpen={false}
    >
      <div className="flex items-center gap-1 pb-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Thesis</span>
      </div>
      <p className="text-[13px] leading-relaxed text-zinc-200">{thesis.thesisStatement}</p>

      {thesis.whyThesisExists?.trim() ? (
        <div className="mt-5 max-w-prose space-y-3">
          {thesis.whyThesisExists
            .split(/\n\n+/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="text-[12px] leading-relaxed text-zinc-400">
                {para}
              </p>
            ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {thesis.hiddenDriver ? (
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Driver</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.hiddenDriver}</p>
            </div>
          ) : null}
          {thesis.likelyPath ? (
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Likely path</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.likelyPath}</p>
            </div>
          ) : null}
          {thesis.tradeExpression ? (
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 p-3 sm:col-span-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Trade expression</p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{thesis.tradeExpression}</p>
            </div>
          ) : null}
        </div>
      )}

      {misread ? (
        <p className="mt-4 text-[12px] leading-relaxed text-amber-200/85">
          <span className="text-zinc-500">Market misread · </span>
          {misread}
        </p>
      ) : null}
    </CollapsibleThesisSection>
  );
}
