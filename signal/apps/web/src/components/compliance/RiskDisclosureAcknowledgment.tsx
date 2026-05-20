"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "depth4.risk-disclosure.acknowledged.v1";

export function RiskDisclosureAcknowledgment() {
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setChecked(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setChecked(false);
    }
    setReady(true);
  }, []);

  const onChange = useCallback((next: boolean) => {
    setChecked(next);
    setSaved(false);
    if (next) {
      try {
        localStorage.setItem(STORAGE_KEY, "1");
        setSaved(true);
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  if (!ready) return null;

  return (
    <section
      className="mt-10 rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"
      aria-labelledby="risk-ack-heading"
    >
      <h2 id="risk-ack-heading" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Acknowledgment (optional)
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
        This acknowledgment is stored on your device only. It does not replace reading the disclosure or your own due
        diligence.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-zinc-900 accent-[#E8473F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8473F]/50"
        />
        <span className="text-[14px] leading-snug text-zinc-200">
          I understand that DEPTH4 provides macro research and analysis, not financial advice, and that I am solely
          responsible for any investment decisions I make.
        </span>
      </label>
      {saved ? (
        <p className={cn("mt-3 text-[12px] text-emerald-400/90")} role="status">
          Saved on this device.
        </p>
      ) : null}
    </section>
  );
}
