"use client";

import { THESIS_UPDATE_REASON_MAX_LEN } from "@/lib/thesis-mutation/normalize-update-reason";

export function UserThesisUpdateReasonField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Why are you updating this thesis?
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={THESIS_UPDATE_REASON_MAX_LEN}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-white/[0.08] bg-zinc-900/50 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600 transition-colors hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
      />
      <span className="mt-1 block text-[10px] leading-relaxed text-zinc-600">
        Optional. Example: New CPI data weakens the original timing.
      </span>
    </label>
  );
}
