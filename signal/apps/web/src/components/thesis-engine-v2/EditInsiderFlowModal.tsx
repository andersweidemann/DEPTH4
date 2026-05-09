"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { getThesisDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { commaFieldsFromInsiderFlow, insiderFlowFromCommaFields } from "@/lib/thesis-engine-v2/insider-flow-config";
import { putUserThesisToSupabase } from "@/lib/thesis-engine-v2/sync-user-thesis-client";
import { upsertUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import { InsiderFlowSetupFields, type InsiderFlowFieldKey } from "@/components/thesis-engine-v2/InsiderFlowSetupFields";

export function EditInsiderFlowModal({
  thesis,
  open,
  onOpenChange,
  onSaved,
  returnToPath,
}: {
  thesis: Thesis | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: Thesis) => void;
  /** e.g. `/theses/my-slug` for post-login redirect */
  returnToPath: string;
}) {
  const [bullInstruments, setBullInstruments] = useState("");
  const [bearInstruments, setBearInstruments] = useState("");
  const [confirmTags, setConfirmTags] = useState("");
  const [contradictTags, setContradictTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !thesis) return;
    const c = commaFieldsFromInsiderFlow(thesis.insiderFlow);
    setBullInstruments(c.bullInstruments);
    setBearInstruments(c.bearInstruments);
    setConfirmTags(c.confirmTags);
    setContradictTags(c.contradictTags);
    setError(null);
  }, [open, thesis]);

  function setField(key: InsiderFlowFieldKey, value: string) {
    switch (key) {
      case "bullInstruments":
        setBullInstruments(value);
        break;
      case "bearInstruments":
        setBearInstruments(value);
        break;
      case "confirmTags":
        setConfirmTags(value);
        break;
      case "contradictTags":
        setContradictTags(value);
        break;
      default:
        break;
    }
  }

  if (!thesis) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[131] max-h-[min(90vh,720px)] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-none bg-[#141416] shadow-xl ring-1 ring-white/[0.08]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <Dialog.Title className="text-[13px] font-semibold text-zinc-100">Edit Insider Flow</Dialog.Title>
              <Dialog.Description className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Update monitoring for <span className="text-zinc-300">{getThesisDisplayTitle(thesis)}</span>. Star this thesis so scheduled scans can run against your
                setup.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded-md p-2 text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="px-5 py-4">
            <InsiderFlowSetupFields
              bullInstruments={bullInstruments}
              bearInstruments={bearInstruments}
              confirmTags={confirmTags}
              contradictTags={contradictTags}
              onChange={setField}
              disabled={saving}
              largeTouch
            />

            {error ? (
              <p className="mt-3 text-[11px] text-red-300/90">
                {error === "sign_in_required" ? (
                  <>
                    Sign in to save Insider Flow to your account.{" "}
                    <Link href={`/login?next=${encodeURIComponent(returnToPath)}`} className="font-semibold text-amber-200/90 hover:text-amber-100">
                      Sign in
                    </Link>
                  </>
                ) : (
                  error
                )}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
            <Dialog.Close className="rounded-md px-3 py-2 text-[11px] font-medium text-zinc-400 hover:bg-zinc-900/60 sm:text-zinc-500">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={saving}
              className={cn(
                "rounded-md px-3 py-2 text-[11px] font-semibold ring-1",
                saving
                  ? "cursor-not-allowed bg-zinc-900/40 text-zinc-600 ring-white/[0.06]"
                  : "bg-amber-500/15 text-amber-200 ring-amber-500/25 hover:bg-amber-500/20",
              )}
              onClick={async () => {
                setSaving(true);
                setError(null);
                const insiderFlow = insiderFlowFromCommaFields({
                  bullInstruments,
                  bearInstruments,
                  confirmTags,
                  contradictTags,
                });
                const nextThesis: Thesis = { ...thesis, insiderFlow };
                const res = await putUserThesisToSupabase(nextThesis);
                if (!res.ok) {
                  setSaving(false);
                  setError(
                    res.error === "sign_in_required"
                      ? "sign_in_required"
                      : res.error === "forbidden"
                        ? "You can’t edit this thesis."
                        : res.error,
                  );
                  return;
                }
                upsertUserThesis(nextThesis);
                onSaved(nextThesis);
                setSaving(false);
                onOpenChange(false);
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
