"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ThesisSectionEmptyCta({
  message,
  actionLabel,
  onAction,
  className,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void | Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className={cn("rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4", className)}>
      <p className="text-[12px] leading-relaxed text-zinc-500">{message}</p>
      <button
        type="button"
        disabled={busy}
        className="mt-3 rounded-md border border-[#E8473F]/30 bg-[#E8473F]/10 px-3 py-2 text-[11px] font-semibold text-[#E8473F] hover:bg-[#E8473F]/15 disabled:opacity-50"
        onClick={() => {
          setBusy(true);
          void Promise.resolve(onAction()).finally(() => setBusy(false));
        }}
      >
        {busy ? "Working…" : actionLabel}
      </button>
    </div>
  );
}
