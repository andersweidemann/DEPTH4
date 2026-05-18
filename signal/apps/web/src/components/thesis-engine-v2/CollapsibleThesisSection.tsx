"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Progressive disclosure wrapper for long thesis detail blocks.
 */
export function CollapsibleThesisSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
  className,
  contentClassName,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <details
      className={cn("group rounded-lg border border-white/[0.06] bg-zinc-900/25 open:pb-5", className)}
      open={defaultOpen || undefined}
      data-testid="collapsible-thesis-section"
    >
      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h2>
            {subtitle ? <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">{subtitle}</p> : null}
          </div>
          <span
            className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 transition-transform group-open:rotate-180"
            aria-hidden
          >
            ▼
          </span>
        </div>
      </summary>
      <div className={cn("px-5 pt-0", contentClassName)}>{children}</div>
    </details>
  );
}
