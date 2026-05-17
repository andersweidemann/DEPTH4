import type { ReactNode } from "react";
import { Suspense } from "react";
import "@/styles/thesis-engine-v2.css";
import { Depth4V2Shell } from "@/components/thesis-engine-v2/Depth4V2Shell";
import { PageHeaderSkeleton } from "@/components/shared/Skeleton";

/** Phase 4A/4C — minimal shell for thesis reader / share links (no app chrome). Auth is per-route. */
export default function ThesisReaderShellLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] px-5 py-10">
          <PageHeaderSkeleton />
        </div>
      }
    >
      <div className="te2 min-h-screen bg-[#111110] text-zinc-100 antialiased selection:bg-[#E8473F]/20 selection:text-zinc-100">
        <Depth4V2Shell>
          <main className="mx-auto max-w-4xl px-5 py-10 sm:px-6">{children}</main>
        </Depth4V2Shell>
      </div>
    </Suspense>
  );
}
