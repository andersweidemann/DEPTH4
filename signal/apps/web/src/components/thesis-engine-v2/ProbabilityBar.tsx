"use client";

export function ProbabilityBar({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="h-px w-full bg-white/[0.08]">
      <div
        className="h-px bg-amber-500/90 transition-[width] duration-700 ease-out"
        style={{ width: `${v}%` }}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
