import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-zinc-800", className)} />;
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-3 py-6">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_80px_80px_80px_40px] gap-3 border-b border-white/[0.06] py-4">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-2.5 w-32" />
      </div>
      <Skeleton className="h-3 w-12 justify-self-end" />
      <Skeleton className="h-2.5 w-10" />
      <Skeleton className="h-2.5 w-10 justify-self-end" />
      <Skeleton className="h-4 w-4 justify-self-end" />
    </div>
  );
}

export function ThesisDetailPageSkeleton() {
  return (
    <div className="space-y-6 py-6">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-3/4 max-w-xl" />
        <Skeleton className="h-4 w-1/2 max-w-md" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    </div>
  );
}
