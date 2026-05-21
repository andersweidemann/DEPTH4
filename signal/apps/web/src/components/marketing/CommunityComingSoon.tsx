"use client";

import { WaitlistCapture } from "@/components/marketing/WaitlistCapture";

const FEATURE_CARDS = [
  {
    title: "Thesis discussions",
    body: "Comment on active theses, share your read, and debate edge cases with other macro thinkers.",
  },
  {
    title: "Macro digest",
    body: "Weekly curated summary of the most significant thesis moves and scenario shifts.",
  },
] as const;

export function CommunityComingSoon() {
  return (
    <div className="mx-auto max-w-3xl pb-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Community</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">Coming soon</h1>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-zinc-400">
        Share insights, discuss theses, and learn from other macro thinkers — without turning DEPTH4 into a
        social feed.
      </p>

      <div className="mt-8 grid gap-4 text-left md:grid-cols-2">
        {FEATURE_CARDS.map((card) => (
          <div key={card.title} className="rounded-lg border border-white/[0.08] bg-zinc-900/30 p-6">
            <h3 className="text-[13px] font-medium text-zinc-100">{card.title}</h3>
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{card.body}</p>
          </div>
        ))}
      </div>

      <WaitlistCapture list="community" />
      <p className="mt-2 text-[10px] text-zinc-600">Be the first to know when we launch</p>
    </div>
  );
}
