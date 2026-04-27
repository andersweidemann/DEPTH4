"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function Sheet({
  open,
  onOpenChange,
  children,
  title,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40 data-[state=open]:animate-in" />
        <Dialog.Content
          className={cn(
            "fixed z-[101] w-full max-h-[92vh] overflow-y-auto",
            "bottom-0 left-0 right-0 rounded-t-2xl border-t border-slate-200 bg-white p-0 shadow-2xl",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border",
            "focus:outline-none",
            className
          )}
          aria-describedby={undefined}
        >
          {title && (
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <Dialog.Title className="text-sm font-semibold text-slate-900 pr-4">{title}</Dialog.Title>
              <Dialog.Close
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          )}
          {!title && (
            <div className="absolute right-2 top-2 z-10">
              <Dialog.Close
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          )}
          <div className={title ? "p-4 pt-0 max-[479px]:px-4" : "p-4 max-[479px]:px-4"}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
