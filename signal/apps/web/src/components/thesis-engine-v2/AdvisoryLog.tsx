import type { ThesisUpdate } from "@/lib/thesis-engine-v2/types";

export function AdvisoryLog({ updates }: { updates: ThesisUpdate[] }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Advisory log</h2>
      <ul className="mt-4 divide-y divide-white/[0.05] rounded-lg border border-white/[0.06] bg-zinc-900/20">
        {updates.map((u) => (
          <li key={u.id} className="flex gap-4 px-4 py-3">
            <span className="w-24 flex-shrink-0 text-[10px] tabular-nums text-zinc-600">{u.timestamp}</span>
            <span className="text-[12px] leading-relaxed text-zinc-400">{u.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
