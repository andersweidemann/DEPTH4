import type { Metadata } from "next";
import { Suspense } from "react";
import { SourcesPage } from "@/components/news/SourcesPage";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";

export const metadata: Metadata = {
  title: "DEPTH4 · Sources",
  description: "RSS and wire sources DEPTH4 ingests for macro thesis reasoning.",
};

function SourcesLoading() {
  return (
    <div className="pb-16">
      <PageHeaderSkeleton />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<SourcesLoading />}>
      <SourcesPage />
    </Suspense>
  );
}
