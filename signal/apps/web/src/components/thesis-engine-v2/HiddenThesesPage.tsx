"use client";

import Link from "next/link";
import { useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { unhideThesisBySlug } from "@/lib/thesis-engine-v2/user-hidden-theses-client";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton } from "@/components/shared/Skeleton";
import type { CausalGraphClustersResponse, CausalThesis } from "@/types/causal-graph";
import { HoverHelp } from "@/components/ui/HoverHelp";
import {
  CAUSAL_DIRECTION_TOOLTIPS,
  EDGE_SCORE_TOOLTIP,
  HORIZON_TOOLTIP,
} from "@/lib/depth-labels";
import { cn } from "@/lib/utils";

function HiddenThesisRow({
  thesis,
  onUnhide,
}: {
  thesis: CausalThesis;
  onUnhide: () => void;
}) {
  const arrow = thesis.direction === "up" ? "↑" : "↓";
  const arrowColor = thesis.direction === "up" ? "text-emerald-400" : "text-red-400";

  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-zinc-900/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[12px]">
          <HoverHelp
            className={cn("font-bold", arrowColor)}
            label={arrow}
            tooltip={CAUSAL_DIRECTION_TOOLTIPS[thesis.direction]}
          />
          <span className="font-semibold text-zinc-200">{thesis.targetAssetSymbol}</span>
          <Link href={`/theses/${thesis.slug}`} className="truncate text-zinc-300 hover:text-amber-200/90">
            {thesis.title}
          </Link>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
          <HoverHelp label={`Edge ${thesis.mispricingScore}/100`} tooltip={EDGE_SCORE_TOOLTIP} />
          <span className="text-zinc-700">·</span>
          <HoverHelp label={thesis.timeHorizon} tooltip={HORIZON_TOOLTIP} />
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100"
        onClick={onUnhide}
      >
        Unhide
      </button>
    </article>
  );
}

export function HiddenThesesPage() {
  const { data, error, isLoading, mutate } = useSWR<CausalGraphClustersResponse>(
    "/api/causal-graph/clusters?view=hidden",
    swrJsonFetcher,
  );

  const unhide = useCallback(
    async (slug: string, thesisId: string) => {
      const ok = await unhideThesisBySlug(slug);
      if (!ok) {
        toast.error("Could not unhide thesis");
        return;
      }
      await mutate(
        (prev) => {
          if (!prev) return prev;
          const clusters = prev.clusters
            .map((c) => ({ ...c, theses: c.theses.filter((t) => t.id !== thesisId) }))
            .filter((c) => c.theses.length > 0);
          const isolated = prev.isolated.filter((t) => t.id !== thesisId);
          return {
            ...prev,
            clusters,
            isolated,
            totalTheses: clusters.reduce((n, c) => n + c.theses.length, 0) + isolated.length,
          };
        },
        { revalidate: false },
      );
      toast.success("Thesis restored to your map");
    },
    [mutate],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeaderSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />
      </div>
    );
  }

  const rows = [
    ...data.clusters.flatMap((c) => c.theses),
    ...data.isolated,
  ];

  return (
    <div data-hidden-theses className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Hidden theses</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          Hidden from your map and lists — still updated by DEPTH4. Unhide anytime.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <Link href="/theses" className="text-zinc-500 hover:text-zinc-300">
            ← Card view
          </Link>
          <Link href="/theses?list=1" className="text-zinc-500 hover:text-zinc-300">
            List view
          </Link>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">No hidden theses. Use ⋮ on a thesis card → Hide from view.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((thesis) => (
            <HiddenThesisRow
              key={thesis.id}
              thesis={thesis}
              onUnhide={() => void unhide(thesis.slug, thesis.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
