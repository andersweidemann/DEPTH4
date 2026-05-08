"use client";

import { useThesisLive } from "@/lib/thesis-engine-v2/thesis-live-context";
import { cn } from "@/lib/utils";

/** In-app preview of out-of-session alert copy. */
export function ThesisLiveToasts() {
  const { outToast, dismissToast } = useThesisLive();
  if (!outToast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex justify-center px-4 pb-6">
      <div
        className={cn(
          "pointer-events-auto max-w-md rounded-none bg-[#151518] px-4 py-3 text-[12px] leading-relaxed text-zinc-200 ring-1 ring-white/[0.04]",
        )}
        role="status"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1">{outToast.message}</p>
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
            onClick={dismissToast}
          >
            Dismiss
          </button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">Email and mobile alerts use your account settings when enabled.</p>
      </div>
    </div>
  );
}
