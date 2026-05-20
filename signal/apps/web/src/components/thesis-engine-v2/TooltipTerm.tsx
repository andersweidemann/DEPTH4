"use client";

import { useState, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function TooltipTerm({
  label,
  children,
  className,
  side = "top",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={0}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>
          <span
            className={cn("tooltip-term", className)}
            tabIndex={0}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((v) => !v);
              }
            }}
          >
            {children}
          </span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            className={cn(
              "z-[300] max-w-[min(22rem,calc(100vw-2rem))]",
              "rounded-none bg-[#121214] px-2.5 py-2 text-[11px] leading-snug text-zinc-200",
              "ring-1 ring-white/[0.08]",
            )}
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-white/[0.08]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
