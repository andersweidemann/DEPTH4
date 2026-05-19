import type { Metadata } from "next";
import { Suspense } from "react";
import { ThesesRoutePage } from "@/components/thesis-engine-v2/ThesesRoutePage";
import { PageHeaderSkeleton } from "@/components/shared/Skeleton";

export const metadata: Metadata = {
  title: "DEPTH4 · Theses",
  description: "Macro theses clustered by event — conviction, edge, and causal chain.",
};

export default function ThesesDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl">
          <PageHeaderSkeleton />
        </div>
      }
    >
      <ThesesRoutePage />
    </Suspense>
  );
}
