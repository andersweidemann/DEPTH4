"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { V2Plan } from "@/lib/thesis-engine-v2/plan";
import { V2_PLAN_LABEL } from "@/lib/thesis-engine-v2/plan";
import { useV2Plan } from "@/lib/thesis-engine-v2/use-plan";

export function UpgradeModal({
  open,
  onOpenChange,
  requiredPlan,
  featureLabel,
  onUpgraded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requiredPlan: V2Plan;
  featureLabel: string;
  onUpgraded?: () => void;
}) {
  const { setPlan } = useV2Plan();

  const primary =
    requiredPlan === "analyst"
      ? "Start 14-day trial"
      : requiredPlan === "pro"
        ? "Upgrade to Pro"
        : "Upgrade to Creator";

  const secondary =
    requiredPlan === "analyst"
      ? "See all plans"
      : requiredPlan === "pro"
        ? "Learn more"
        : "Contact sales";

  const subcopy =
    requiredPlan === "analyst"
      ? "Track your own macro ideas. Get alerts when news moves your theses."
      : requiredPlan === "pro"
        ? "Share your theses publicly and build a following based on your track record."
        : "Turn your published theses into subscription revenue with a 70% revenue share (dummy).";

  const compare =
    requiredPlan === "analyst"
      ? [
          { left: "Free", right: "Analyst", items: ["View system theses (limited)", "Create private theses", "Live tracking + advisory log", "Exports"] },
        ]
      : requiredPlan === "pro"
        ? [
            { left: "Analyst", right: "Pro", items: ["Everything in Analyst", "Publish theses publicly", "Leaderboard + followers", "Community presence"] },
          ]
        : [
            { left: "Pro", right: "Creator", items: ["Everything in Pro", "Monetization tools", "Creator analytics", "API access"] },
          ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/55" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[221] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-white/[0.08] bg-[#0c0c0e] shadow-2xl",
            "focus:outline-none",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
            <div>
              <Dialog.Title className="text-sm font-semibold text-zinc-100">Upgrade required</Dialog.Title>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                <span className="text-zinc-400">{featureLabel}</span> is a{" "}
                <span className="text-amber-200/85">{V2_PLAN_LABEL[requiredPlan]}</span> feature.
              </p>
            </div>
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="px-5 py-4">
            <p className="text-[12px] leading-relaxed text-zinc-400">{subcopy}</p>

            <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">At a glance</p>
              <div className="mt-3 grid gap-2 text-[12px] text-zinc-300">
                {compare[0]!.items.map((t) => (
                  <div key={t} className="flex items-start gap-2">
                    <span className="mt-[2px] h-1.5 w-1.5 rounded-full bg-amber-400/70" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md bg-amber-500 px-3 py-2 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400"
                onClick={() => {
                  setPlan(requiredPlan);
                  onOpenChange(false);
                  onUpgraded?.();
                }}
              >
                {primary}
              </button>

              {requiredPlan === "creator" ? (
                <a
                  href="mailto:sales@depth4.example?subject=DEPTH4%20Creator%20plan"
                  className="rounded-md bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                >
                  {secondary}
                </a>
              ) : (
                <Link
                  href="/pricing"
                  className="rounded-md bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
                >
                  {secondary}
                </Link>
              )}

              <Dialog.Close className="rounded-md px-3 py-2 text-[11px] font-medium text-zinc-500 hover:bg-zinc-900/60">
                Not now
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

