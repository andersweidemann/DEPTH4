"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function BackButton({
  fallbackHref = "/theses",
  label = "Back",
  className,
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={cn(
        "rounded-md border border-white/[0.08] bg-zinc-900/30 px-3 py-2 text-[12px] text-zinc-300 hover:bg-zinc-900/50",
        className,
      )}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      aria-label={label}
    >
      ← {label}
    </button>
  );
}

