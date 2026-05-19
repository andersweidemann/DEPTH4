"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { THESIS_DETAIL_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";
import { retailDetailSnippet } from "@/lib/thesis-engine-v2/thesis-text-utils";

function pickWhyNow(thesis: Thesis): string {
  const anatomy = thesis.structuredAnatomy;
  if (anatomy?.trade_implication?.trim()) return anatomy.trade_implication.trim();
  if (thesis.whyNow?.trim()) return thesis.whyNow.trim();
  if (thesis.oneLineSummary?.trim()) return thesis.oneLineSummary.trim();
  return thesis.thesisStatement;
}

function FoldBlock({
  title,
  tooltip,
  body,
}: {
  title: string;
  tooltip: string;
  body: string;
}) {
  if (!body.trim()) return null;
  return (
    <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h2>
        <details>
          <summary className="cursor-pointer list-none text-[9px] text-zinc-600 hover:text-zinc-400 [&::-webkit-details-marker]:hidden">
            What this means
          </summary>
          <p className="mt-1 max-w-prose text-[10px] leading-relaxed text-zinc-600">{tooltip}</p>
        </details>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{body}</p>
    </section>
  );
}

export function ThesisWhyNowBlock({ thesis }: { thesis: Thesis }) {
  const text = retailDetailSnippet(pickWhyNow(thesis), { maxSentences: 3, maxWords: 55 });
  return (
    <FoldBlock title="Why now" tooltip={THESIS_DETAIL_TOOLTIPS.whyNow} body={text} />
  );
}

export function ThesisTriggerBlock({ thesis }: { thesis: Thesis }) {
  const text = retailDetailSnippet(thesis.trigger, { maxSentences: 3, maxWords: 55 });
  return (
    <FoldBlock title="Trigger" tooltip={THESIS_DETAIL_TOOLTIPS.trigger} body={text} />
  );
}
