"use client";

import type { ReactNode } from "react";
import type { RelatedAsset, Thesis } from "@/lib/thesis-engine-v2/types";
import { ThesisHero } from "@/components/thesis-engine-v2/ThesisHero";
import { ThesisFourLevelCascade } from "@/components/thesis-engine-v2/ThesisFourLevelCascade";
import { ThesisAssetEdgeMap } from "@/components/thesis-engine-v2/ThesisAssetEdgeMap";
import { TradePlanCard } from "@/components/thesis-engine-v2/TradePlanCard";
import { ThesisReaderChrome } from "@/components/thesis-engine-v2/ThesisReaderChrome";
import { cn } from "@/lib/utils";

function ReaderSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-white/[0.06] pt-8", className)}>
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ReaderProse({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-[1.65] text-zinc-300">{children}</p>;
}

/**
 * Phase 4A — editorial reading layer for thesis detail (no operator chrome).
 */
export function ThesisReaderView({
  slug,
  thesis,
  relatedAssets,
  liveEvidenceApplied,
}: {
  slug: string;
  thesis: Thesis;
  relatedAssets: RelatedAsset[];
  liveEvidenceApplied?: boolean;
}) {
  return (
    <article className="mx-auto max-w-[42rem] pb-20">
      <ThesisReaderChrome slug={slug} />

      <ThesisHero thesis={thesis} variant="reader" displaySourceOpts={{ liveEvidenceApplied }} />

      {thesis.structuredAnatomy?.four_level || thesis.thesisCascade ? (
        <div className="mt-12">
          <ThesisFourLevelCascade thesis={thesis} variant="reader" />
        </div>
      ) : null}

      <ReaderSection title="Setup" className="mt-12">
        <div className="space-y-6">
          {thesis.whyNow?.trim() ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Why now</p>
              <ReaderProse>{thesis.whyNow}</ReaderProse>
            </div>
          ) : null}
          {thesis.trigger?.trim() ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Trigger</p>
              <ReaderProse>{thesis.trigger}</ReaderProse>
            </div>
          ) : null}
          {thesis.trade?.trim() ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Trade</p>
              <ReaderProse>{thesis.trade}</ReaderProse>
            </div>
          ) : null}
          {thesis.invalidation?.trim() ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Invalidation</p>
              <p className="text-[15px] leading-[1.65] text-red-300/90">{thesis.invalidation}</p>
            </div>
          ) : null}
          {thesis.timeStop?.trim() ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Time stop</p>
              <ReaderProse>{thesis.timeStop}</ReaderProse>
            </div>
          ) : null}
        </div>
      </ReaderSection>

      {thesis.whyThesisExists?.trim() ? (
        <ReaderSection title="Why this thesis exists" className="mt-12">
          <div className="space-y-4">
            {thesis.whyThesisExists
              .split(/\n\n+/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((para, i) => (
                <ReaderProse key={i}>{para}</ReaderProse>
              ))}
          </div>
        </ReaderSection>
      ) : null}

      <div className="mt-12">
        <TradePlanCard thesis={thesis} variant="reader" />
      </div>

      <div className="mt-12">
        <ThesisAssetEdgeMap thesis={thesis} relatedAssets={relatedAssets} variant="reader" />
      </div>

      <footer className="mt-16 border-t border-white/[0.06] pt-8 text-[11px] leading-relaxed text-zinc-600">
        <p>
          DEPTH4 macro thesis — informational only, not investment advice. Probabilities and levels can change as new
          evidence arrives.
        </p>
      </footer>
    </article>
  );
}
