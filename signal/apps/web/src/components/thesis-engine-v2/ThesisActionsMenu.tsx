"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThesisActionsMenu({
  onHide,
  onUnhide,
  hideLabel = "Hide from view",
  unhideLabel = "Unhide",
  className,
}: {
  onHide?: () => void;
  onUnhide?: () => void;
  hideLabel?: string;
  unhideLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const action = onUnhide ? unhideLabel : onHide ? hideLabel : null;
  if (!action) return null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
        aria-label="Thesis actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-[80] mt-1 min-w-[10rem] rounded-none bg-[#141416] py-1 ring-1 ring-white/[0.08]">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-900/60 hover:text-zinc-100"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              if (onUnhide) onUnhide();
              else onHide?.();
            }}
          >
            {action}
          </button>
        </div>
      ) : null}
    </div>
  );
}
