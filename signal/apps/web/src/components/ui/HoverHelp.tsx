"use client";

import { useState, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function HoverHelp({
  label,
  tooltip,
  className,
  iconClassName,
  side = "top",
}: {
  label: ReactNode;
  tooltip: ReactNode;
  className?: string;
  iconClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("hover-help", className)}>
      <span className="hover-help__label">{label}</span>
      <TooltipPrimitive.Provider delayDuration={150} skipDelayDuration={0}>
        <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
          <TooltipPrimitive.Trigger asChild>
            <button
              type="button"
              className={cn("hover-help__icon", iconClassName)}
              aria-label="More information"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }}
            >
              ?
            </button>
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
              {tooltip}
              <TooltipPrimitive.Arrow className="fill-white/[0.08]" />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    </span>
  );
}
