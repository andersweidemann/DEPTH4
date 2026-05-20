"use client";

import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { TrackRecordSummaryCard } from "@/components/track-record/TrackRecordSummaryCard";
import { TrackRecordMonthlyChart } from "@/components/track-record/TrackRecordMonthlyChart";
import { TrackRecordThesesTable } from "@/components/track-record/TrackRecordThesesTable";
import type { TrackRecord } from "@/types/thesis-outcome";

function isTrackRecord(x: unknown): x is TrackRecord {
  return (
    !!x &&
    typeof x === "object" &&
    "total" in x &&
    "resolvedTheses" in x &&
    Array.isArray((x as TrackRecord).resolvedTheses)
  );
}

export function TrackRecordPageClient() {
  const key = useMemo(() => "/api/track-record", []);
  const { data, error, isLoading, mutate } = useSWR<unknown>(key, swrJsonFetcher);

  useEffect(() => {
    document.title = "DEPTH4 · Track Record";
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 pb-16">
        <PageHeaderSkeleton />
        <Skeleton className="h-40 w-full rounded border border-white/[0.08]" />
        <Skeleton className="h-32 w-full rounded border border-white/[0.08]" />
        <Skeleton className="h-48 w-full rounded border border-white/[0.08]" />
      </div>
    );
  }

  if (error || data === undefined) {
    return <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />;
  }

  if (!isTrackRecord(data)) {
    return (
      <ErrorBanner message="Track record response was not in the expected format." onRetry={() => void mutate()} />
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Track record</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500">
          Resolved thesis outcomes from trade-plan levels — target, stop, and time. Click a row for
          post-mortem.
        </p>
      </header>

      <TrackRecordSummaryCard trackRecord={data} />

      {data.monthlyHistory.length > 0 ? (
        <TrackRecordMonthlyChart months={data.monthlyHistory} />
      ) : null}

      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Resolved theses
        </h2>
        <TrackRecordThesesTable rows={data.resolvedTheses} />
      </section>
    </div>
  );
}
