import type { ReactNode } from "react";
import { Suspense } from "react";
import "@/styles/thesis-engine-v2.css";
import { Depth4V2Shell } from "@/components/thesis-engine-v2/Depth4V2Shell";
import { RouteGuard } from "@/components/RouteGuard";
import { PageHeaderSkeleton } from "@/components/shared/Skeleton";

/** Phase 4A — minimal shell for thesis reader / share links (no app chrome). */
export default function ThesisReaderShellLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] px-5 py-10">
          <PageHeaderSkeleton />
        </div>
      }
    >
      <RouteGuard requireAuth>
        <div className="te2 min-h-screen bg-[#111110] text-zinc-100 antialiased selection:bg-[#E8473F]/20 selection:text-zinc-100">
          <Depth4V2Shell>
            <main className="mx-auto max-w-4xl px-5 py-10 sm:px-6">{children}</main>
          </Depth4V2Shell>
        </div>
      </RouteGuard>
    </Suspense>
  );
}
