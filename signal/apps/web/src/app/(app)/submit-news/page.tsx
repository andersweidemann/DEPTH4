import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitNewsPage } from "@/components/news/SubmitNewsPage";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";

export const metadata: Metadata = {
  title: "DEPTH4 · Submit news",
  description: "Submit a headline or URL for DEPTH4 evidence analysis.",
};

function SubmitNewsLoading() {
  return (
    <div className="pb-16">
      <PageHeaderSkeleton />
      <Skeleton className="mt-8 h-48 max-w-lg rounded-lg" />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<SubmitNewsLoading />}>
      <SubmitNewsPage />
    </Suspense>
  );
}
