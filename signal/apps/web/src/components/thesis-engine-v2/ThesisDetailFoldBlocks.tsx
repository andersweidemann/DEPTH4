"use client";

import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
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
  children,
}: {
  title: string;
  tooltip: string;
  children: string;
}) {
  if (!children.trim()) return null;
  return (
    <section className="rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4">
      <h2 className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {title}
        <InfoTooltip text={tooltip} maxWidth={220} />
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{children}</p>
    </section>
  );
}

export function ThesisWhyNowBlock({ thesis }: { thesis: Thesis }) {
  const text = retailDetailSnippet(pickWhyNow(thesis), { maxSentences: 3, maxWords: 55 });
  return (
    <FoldBlock title="Why now" tooltip={THESIS_DETAIL_TOOLTIPS.whyNow}>
      {text}
    </FoldBlock>
  );
}

export function ThesisTriggerBlock({ thesis }: { thesis: Thesis }) {
  const text = retailDetailSnippet(thesis.trigger, { maxSentences: 3, maxWords: 55 });
  return (
    <FoldBlock title="Trigger" tooltip={THESIS_DETAIL_TOOLTIPS.trigger}>
      {text}
    </FoldBlock>
  );
}
