"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { V2Plan } from "@/lib/thesis-engine-v2/plan";
import { V2_PLAN_LABEL } from "@/lib/thesis-engine-v2/plan";

export function UpgradeModal({
  open,
  onOpenChange,
  requiredPlan,
  featureLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requiredPlan: V2Plan;
  featureLabel: string;
}) {
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
            <p className="text-[12px] leading-relaxed text-zinc-500">
              DEPTH4 plan tiers map directly to product capabilities. Upgrade to unlock this workflow without changing your thesis workspace.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/pricing"
                className="rounded-md bg-amber-500/15 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/20"
              >
                View plans
              </Link>
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

