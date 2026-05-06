"use client";

import type { ReactNode } from "react";
import { ThesisLiveProvider } from "@/lib/thesis-engine-v2/thesis-live-context";
import { ThesisLiveToasts } from "@/components/thesis-engine-v2/ThesisLiveToasts";

export function Depth4V2Shell({ children }: { children: ReactNode }) {
  return (
    <ThesisLiveProvider>
      {children}
      <ThesisLiveToasts />
    </ThesisLiveProvider>
  );
}
