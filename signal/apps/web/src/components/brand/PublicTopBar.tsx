"use client";

import type { ReactNode } from "react";
import { Depth4Wordmark } from "@/components/brand/Depth4Wordmark";
import { BackButton } from "@/components/brand/BackButton";
import { cn } from "@/lib/utils";

export function PublicTopBar({
  backHref = "/",
  backLabel = "Back",
  right,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-white/[0.06]", className)}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-2">
          <BackButton fallbackHref={backHref} label={backLabel} />
          <Depth4Wordmark size="sm" />
        </div>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </div>
    </header>
  );
}

