"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InfoTooltipProps {
  text: string;
  children?: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  maxWidth?: number;
  /** When false, only the info icon triggers the tooltip (default). */
  wrapChildren?: boolean;
}

export function InfoTooltip({
  text,
  children,
  position = "top",
  maxWidth = 200,
  wrapChildren = false,
}: InfoTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center gap-0.5 align-middle"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {wrapChildren ? children : null}
      <Info
        className="h-3 w-3 shrink-0 cursor-help text-zinc-600 transition-colors hover:text-zinc-400"
        aria-label={text}
        tabIndex={0}
      />
      {show ? (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 rounded-md border border-white/[0.08] bg-zinc-900 px-2.5 py-2 text-[10px] leading-relaxed text-zinc-400 shadow-xl",
            "pointer-events-none",
            position === "top" && "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
            position === "bottom" && "left-1/2 top-full mt-1.5 -translate-x-1/2",
            position === "left" && "right-full top-1/2 mr-1.5 -translate-y-1/2",
            position === "right" && "left-full top-1/2 ml-1.5 -translate-y-1/2",
          )}
          style={{ maxWidth: `${maxWidth}px`, width: "max-content" }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
