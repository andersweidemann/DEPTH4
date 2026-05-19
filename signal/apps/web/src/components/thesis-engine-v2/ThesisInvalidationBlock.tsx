"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { THESIS_DETAIL_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import { retailDetailSnippet } from "@/lib/thesis-engine-v2/thesis-text-utils";

export function ThesisInvalidationBlock({ thesis }: { thesis: Thesis }) {
  const body = retailDetailSnippet(thesis.invalidation, { maxSentences: 4, maxWords: 60 });
  const considerations = (thesis.riskFactors ?? "")
    .split(/\n+/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!body && !considerations.length) return null;

  return (
    <section className="rounded-lg border border-red-500/15 bg-red-500/[0.04] p-4 ring-1 ring-red-500/10">
      <h2 className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300/90">
        Invalidation
        <InfoTooltip text={THESIS_DETAIL_TOOLTIPS.invalidation} maxWidth={240} />
      </h2>
      <p className="mt-3 text-[12px] font-medium uppercase tracking-wide text-zinc-500">If this happens → stand down</p>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">{body}</p>
      {considerations.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3">
          {considerations.map((line) => (
            <li key={line} className="text-[11px] leading-relaxed text-zinc-500">
              · {line}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
