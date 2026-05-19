import { DEPTH_TOOLTIPS } from "@/lib/thesis-engine-v2/depth-tooltips";

const DEPTH_KEYS = {
  D1: DEPTH_TOOLTIPS.d1,
  D2: DEPTH_TOOLTIPS.d2,
  D3: DEPTH_TOOLTIPS.d3,
  D4: DEPTH_TOOLTIPS.d4,
} as const;

export function DepthDepthLabel({
  depth,
  kicker,
}: {
  depth: keyof typeof DEPTH_KEYS;
  kicker: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{kicker}</span>
      <details className="inline-block">
        <summary className="cursor-pointer list-none text-[9px] text-zinc-600 hover:text-zinc-400 [&::-webkit-details-marker]:hidden">
          help
        </summary>
        <p className="mt-1 max-w-sm text-[10px] leading-relaxed text-zinc-600">{DEPTH_KEYS[depth]}</p>
      </details>
    </span>
  );
}
