import type { ReactNode } from "react";
import { Suspense } from "react";
import "@/styles/thesis-engine-v2.css";
import { Depth4V2Shell } from "@/components/thesis-engine-v2/Depth4V2Shell";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { AppSubNav } from "@/components/layout/AppSubNav";
import { AppFooter } from "@/components/layout/AppFooter";
import { RouteGuard } from "@/components/RouteGuard";
import { PageHeaderSkeleton } from "@/components/shared/Skeleton";
import { ThesisUpdateToasts } from "@/components/thesis-engine-v2/ThesisUpdateToasts";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0c0c0e] px-5 py-8">
          <PageHeaderSkeleton />
        </div>
      }
    >
      <RouteGuard requireAuth>
        <ThesisUpdateToasts />
        <div className="te2 min-h-screen bg-[#0c0c0e] text-zinc-100 antialiased selection:bg-amber-500/20 selection:text-amber-100">
          <Depth4V2Shell>
            <AppTopBar />
            <AppSubNav />
            <main className="mx-auto max-w-4xl px-5 py-8 has-[[data-causal-map]]:max-w-6xl">{children}</main>
            <AppFooter />
          </Depth4V2Shell>
        </div>
      </RouteGuard>
    </Suspense>
  );
}
