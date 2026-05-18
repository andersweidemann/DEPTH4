"use client";

import { WaitlistCapture } from "@/components/marketing/WaitlistCapture";

export function CommunityComingSoon() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Community</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">Coming soon</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-zinc-400">
        Share theses, discuss edge, and see how other analysts are positioning. We&apos;re building a community of
        serious macro thinkers.
      </p>
      <WaitlistCapture list="community" />
      <p className="mt-2 text-[10px] text-zinc-600">Be the first to know when we launch</p>
    </div>
  );
}
