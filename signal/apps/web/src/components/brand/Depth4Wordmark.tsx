"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function Depth4Wordmark({
  href = "/",
  size = "md",
  className,
  showTagline = false,
  align = "left",
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTagline?: boolean;
  align?: "left" | "center";
}) {
  const h =
    size === "sm" ? "h-[24px]" : size === "lg" ? "h-[32px] sm:h-[34px]" : "h-[28px] sm:h-[30px]";

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex select-none items-center",
        align === "center" ? "justify-center" : "justify-start",
        className,
      )}
      aria-label="DEPTH4 home"
    >
      {showTagline ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 320 55"
          className={cn(h, "w-auto")}
          role="img"
          aria-label="DEPTH4 — Your macro thesis engine"
        >
          <rect x="0" y="6" width="22" height="3" fill="#E8473F" opacity="0.45" />
          <rect x="4" y="14" width="26" height="3" fill="#E8473F" opacity="0.62" />
          <rect x="8" y="22" width="30" height="3" fill="#E8473F" opacity="0.8" />
          <rect x="12" y="30" width="34" height="4" fill="#E8473F" opacity="1" />
          <text
            x="56"
            y="30"
            fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
            fontWeight="700"
            fontSize="22"
            letterSpacing="3"
            fill="#ffffff"
          >
            DEPTH4
          </text>
          <text
            x="57"
            y="46"
            fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
            fontWeight="400"
            fontSize="8"
            letterSpacing="2.5"
            fill="#666666"
          >
            YOUR MACRO THESIS ENGINE
          </text>
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 320 60"
          className={cn(h, "w-auto")}
          role="img"
          aria-label="DEPTH4"
        >
          <rect x="0" y="6" width="22" height="3" fill="#E8473F" opacity="0.45" />
          <rect x="4" y="14" width="26" height="3" fill="#E8473F" opacity="0.62" />
          <rect x="8" y="22" width="30" height="3" fill="#E8473F" opacity="0.8" />
          <rect x="12" y="30" width="34" height="4" fill="#E8473F" opacity="1" />
          <text
            x="56"
            y="30"
            fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif"
            fontWeight="700"
            fontSize="22"
            letterSpacing="3"
            fill="#ffffff"
          >
            DEPTH4
          </text>
        </svg>
      )}
    </Link>
  );
}

