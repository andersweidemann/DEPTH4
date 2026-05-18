"use client";

import Link from "next/link";
import { useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton, TableRowSkeleton } from "@/components/shared/Skeleton";
import type { ThesisArchiveListResponse } from "@/types/thesis";
import { ThesisRow, TABLE_GRID } from "@/components/thesis-engine-v2/ThesisListRow";
import { cn } from "@/lib/utils";

export function LiveArchiveThesesListPage() {
  useEffect(() => {
    document.title = "DEPTH4 · Thesis archive";
  }, []);

  const { data, error, isLoading, mutate } = useSWR<ThesisArchiveListResponse>("/api/theses/archive", swrJsonFetcher);

  const toggleStar = async (slug: string, starred: boolean) => {
    try {
      await authFetch(`/api/theses/${slug}/star`, { method: "POST" });
      await mutate();
      toast.success(starred ? "Thesis unstarred" : "Thesis starred");
    } catch {
      toast.error("Could not update star");
    }
  };

  if (isLoading) {
    return (
      <div className="pb-8">
        <PageHeaderSkeleton />
        <section className="mt-8">
          <Skeleton className="h-2.5 w-28" />
          <div className="mt-3 space-y-0">
            <TableRowSkeleton />
            <TableRowSkeleton />
          </div>
        </section>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Thesis archive</h1>
          <p className="mt-1 text-[13px] text-zinc-400">
            Resolved, invalidated, and archived theses you own — with recorded outcomes when present.
          </p>
        </div>
        <Link
          href="/theses"
          className="rounded-full border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-[#E8473F]/35 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
        >
          Live theses
        </Link>
      </div>

      <section className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-950/20 p-4 sm:p-5">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={cn(
                TABLE_GRID,
                "border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600",
              )}
            >
              <span>Thesis</span>
              <span className="text-right">Prob</span>
              <span className="hidden sm:block">Status</span>
              <span className="hidden text-right sm:block">Update</span>
              <span />
            </div>
            {data.items.length === 0 ? (
              <p className="mt-4 text-[12px] text-zinc-600">No archived or terminal theses yet.</p>
            ) : (
              data.items.map((t) => (
                <ThesisRow key={t.slug} item={t} onToggleStar={() => void toggleStar(t.slug, t.starred)} />
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
