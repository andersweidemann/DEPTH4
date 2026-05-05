"use client";

export function ProbabilityBar({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800/80">
      <div
        className="h-full rounded-full bg-amber-600/90 transition-[width] duration-500"
        style={{ width: `${v}%` }}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
