"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function Depth4Wordmark({
  href = "/",
  size = "md",
  className,
  subline,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  subline?: string;
}) {
  const textCls =
    size === "sm"
      ? "text-[12px]"
      : size === "lg"
        ? "text-[17px] sm:text-[18px]"
        : "text-[14px] sm:text-[15px]";

  return (
    <Link href={href} className={cn("inline-flex items-baseline gap-2", className)} aria-label="DEPTH4 home">
      <span className={cn("font-semibold tracking-tight text-zinc-100", textCls)}>DEPTH4</span>
      {subline ? <span className="text-[11px] text-zinc-500">{subline}</span> : null}
    </Link>
  );
}

