"use client";

import { cn } from "@/lib/utils";

export type InsiderFlowFieldKey = "bullInstruments" | "bearInstruments" | "confirmTags" | "contradictTags";

type Props = {
  bullInstruments: string;
  bearInstruments: string;
  confirmTags: string;
  contradictTags: string;
  onChange: (key: InsiderFlowFieldKey, value: string) => void;
  disabled?: boolean;
  /** Larger touch targets on narrow screens (matches Create Thesis modal). */
  largeTouch?: boolean;
  className?: string;
};

export function InsiderFlowSetupFields({
  bullInstruments,
  bearInstruments,
  confirmTags,
  contradictTags,
  onChange,
  disabled,
  largeTouch,
  className,
}: Props) {
  const inputCls = cn(
    "mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]",
    largeTouch && "font-mono text-[16px] sm:font-sans",
  );
  const textInputCls = cn(
    "mt-2 w-full rounded-lg border border-white/[0.08] bg-zinc-900/40 px-3 py-3 text-[16px] text-zinc-200 placeholder:text-zinc-600 sm:py-2 sm:text-[12px]",
  );

  return (
    <div className={cn("grid gap-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Insider Flow setup (optional)</p>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Configure instruments + confirm tags to monitor suspicious pre-headline flow for this thesis.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Bull-case instruments</label>
          <input
            disabled={disabled}
            value={bullInstruments}
            onChange={(e) => onChange("bullInstruments", e.target.value)}
            placeholder="BTC, TLT, XLE"
            className={inputCls}
          />
          <p className="mt-1 text-[10px] text-zinc-600">Comma-separated symbols.</p>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Bear-case instruments</label>
          <input
            disabled={disabled}
            value={bearInstruments}
            onChange={(e) => onChange("bearInstruments", e.target.value)}
            placeholder="WTI, ITA, XAUUSD"
            className={inputCls}
          />
          <p className="mt-1 text-[10px] text-zinc-600">Comma-separated symbols.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Headline confirm tags</label>
          <input
            disabled={disabled}
            value={confirmTags}
            onChange={(e) => onChange("confirmTags", e.target.value)}
            placeholder="ceasefire, Fed pivot, OPEC cuts"
            className={textInputCls}
          />
          <p className="mt-1 text-[10px] text-zinc-600">Used to classify moves as confirmed vs unconfirmed.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Contradicting headline tags (optional)
          </label>
          <input
            disabled={disabled}
            value={contradictTags}
            onChange={(e) => onChange("contradictTags", e.target.value)}
            placeholder="strikes, escalation, talks collapse"
            className={textInputCls}
          />
          <p className="mt-1 text-[10px] text-zinc-600">
            Optional tags that would invalidate or contradict this leak interpretation.
          </p>
        </div>
      </div>
    </div>
  );
}
