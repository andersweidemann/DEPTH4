import type { ReactNode } from "react";
import "@/styles/thesis-engine-v2.css";
import { Depth4V2Shell } from "@/components/thesis-engine-v2/Depth4V2Shell";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { AppSubNav } from "@/components/layout/AppSubNav";
import { AppFooter } from "@/components/layout/AppFooter";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="te2 min-h-screen bg-[#0c0c0e] text-zinc-100 antialiased selection:bg-amber-500/20 selection:text-amber-100">
      <Depth4V2Shell>
        <AppTopBar />
        <AppSubNav />
        <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
        <AppFooter />
      </Depth4V2Shell>
    </div>
  );
}
