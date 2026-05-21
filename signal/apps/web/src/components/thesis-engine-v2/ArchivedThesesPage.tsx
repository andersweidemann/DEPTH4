"use client";

import Link from "next/link";
import { useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";

type ArchivedThesisRow = {
  id: string;
  slug: string;
  title: string;
  symbol: string;
  archiveReason: string;
  archivedAt: string | null;
};

type ArchivedResponse = {
  ok?: boolean;
  theses?: ArchivedThesisRow[];
  canRestore?: boolean;
  error?: string;
};

function formatArchivedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ArchivedRow({
  row,
  onRestore,
  restoring,
  showRestore,
}: {
  row: ArchivedThesisRow;
  onRestore: () => void;
  restoring: boolean;
  showRestore: boolean;
}) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-zinc-900/30 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[12px]">
          {row.symbol ? <span className="font-semibold text-zinc-400">{row.symbol}</span> : null}
          <Link href={`/theses/${row.slug}`} className="truncate font-medium text-zinc-200 hover:text-[#E8473F]">
            {row.title}
          </Link>
        </p>
        <p className="mt-1 text-[10px] text-zinc-600">
          {row.archiveReason.replace(/_/g, " ")} · Archived {formatArchivedAt(row.archivedAt)}
        </p>
      </div>
      {showRestore ? (
        <button
          type="button"
          disabled={restoring}
          className="shrink-0 rounded-md border border-[#E8473F]/30 bg-[#E8473F]/10 px-3 py-1.5 text-[11px] font-medium text-[#E8473F] hover:bg-[#E8473F]/20 disabled:opacity-50"
          onClick={onRestore}
        >
          Restore
        </button>
      ) : null}
    </article>
  );
}

export function ArchivedThesesPage() {
  const { data, error, isLoading, mutate } = useSWR<ArchivedResponse>("/api/theses/archived", swrJsonFetcher);

  const restore = useCallback(
    async (slug: string) => {
      try {
        const res = await authFetch("/api/theses/archived", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        toast.success("Thesis restored to watching");
        await mutate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [mutate],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl pb-16">
        <PageHeaderSkeleton />
        <div className="mt-6 space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data?.ok) {
    const forbidden = data?.error === "forbidden";
    if (forbidden) {
      return (
        <div className="mx-auto max-w-6xl pb-16">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Archived theses</h1>
          <p className="mt-2 text-[13px] text-zinc-500">
            Archived catalog theses are visible to operators only. Use the{" "}
            <Link href="/theses?hidden=1" className="text-zinc-400 hover:text-zinc-200">
              hidden
            </Link>{" "}
            view for theses you hid from your map.
          </p>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-6xl pb-16">
        <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />
      </div>
    );
  }

  const rows = data.theses ?? [];
  const canRestore = data.canRestore === true;

  return (
    <div data-archived-theses className="mx-auto max-w-6xl pb-16">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Archived theses</h1>
        <p className="mt-1 text-[13px] text-zinc-400">
          System-archived catalog theses removed from surfacing
          {canRestore ? " — restore to return them to the watching lane." : "."}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <Link href="/theses" className="text-zinc-500 hover:text-zinc-300">
            ← Card view
          </Link>
          <Link href="/theses?hidden=1" className="text-zinc-500 hover:text-zinc-300">
            User hidden
          </Link>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">No archived theses in the catalog.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <ArchivedRow
              key={row.id}
              row={row}
              restoring={false}
              showRestore={canRestore}
              onRestore={() => void restore(row.slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
