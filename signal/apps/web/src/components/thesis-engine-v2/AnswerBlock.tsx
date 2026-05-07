import type { ReactNode } from "react";

export function AnswerBlock({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div className="rounded-none bg-zinc-900/30 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-600/90">{kicker}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{children}</p>
    </div>
  );
}
