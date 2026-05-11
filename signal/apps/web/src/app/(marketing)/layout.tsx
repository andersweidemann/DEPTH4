import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/layout/MarketingHeader";
import { MarketingFooter } from "@/components/layout/MarketingFooter";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0c0c0e] text-zinc-100 antialiased">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
