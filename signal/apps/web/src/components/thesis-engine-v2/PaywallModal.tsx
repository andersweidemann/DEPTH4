"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PaywallModal({
  open,
  onOpenChange,
  title,
  body,
  subtext,
  primaryHref,
  primaryLabel,
  secondaryLabel = "Not now",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  subtext?: ReactNode;
  primaryHref?: string;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  const hasPricing = Boolean(primaryHref);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/55" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[221] w-full max-w-none translate-x-0 translate-y-0",
            "rounded-none border-0 bg-[#0c0c0e] ring-1 ring-white/[0.04] focus:outline-none",
            "sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[92vw] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold text-zinc-100">{title}</Dialog.Title>
              <div className="mt-1 text-[12px] leading-relaxed text-zinc-400">{body}</div>
              {subtext ? <div className="mt-2 text-[11px] text-zinc-500">{subtext}</div> : null}
            </div>
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="h-px w-full bg-white/[0.06]" aria-hidden />

          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {hasPricing ? (
                <Link
                  href={primaryHref!}
                  className="min-h-11 rounded-md bg-amber-500 px-4 py-2.5 text-[14px] font-semibold text-zinc-950 hover:bg-amber-400 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]"
                >
                  {primaryLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-amber-500 px-4 py-2.5 text-[14px] font-semibold text-zinc-950 hover:bg-amber-400 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px]"
                  onClick={() => onOpenChange(false)}
                >
                  Pricing page coming next
                </button>
              )}

              <Dialog.Close className="min-h-11 rounded-md px-4 py-2.5 text-[14px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:min-h-0 sm:px-3 sm:py-2 sm:text-[11px] sm:text-zinc-500">
                {secondaryLabel}
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

