"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThesisStarButton({
  filled,
  disabled,
  title,
  onClick,
  size = "md",
}: {
  filled: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-transform duration-150 active:scale-90",
        sz,
        disabled ? "cursor-not-allowed opacity-50" : "text-amber-200/90 hover:bg-zinc-900/50",
        filled ? "text-amber-200" : "text-zinc-500 hover:text-amber-200/80",
      )}
    >
      <Star
        className={cn(icon, "transition-[fill,stroke] duration-200")}
        fill={filled ? "currentColor" : "none"}
        strokeWidth={filled ? 0 : 1.8}
      />
    </button>
  );
}
