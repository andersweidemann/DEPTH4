"use client";

import Link from "next/link";

export function ProOnlyBadge({ feature = "Pro feature" }: { feature?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8473F]/30 bg-[#E8473F]/10 px-2 py-0.5 text-[10px] font-medium text-[#E8473F]">
      {feature}
      <Link href="/pricing" className="underline underline-offset-2 hover:text-[#ff6b5f]">
        Upgrade
      </Link>
    </span>
  );
}
