import { InfoTooltip } from "@/components/ui/InfoTooltip";
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
    <span className="inline-flex items-center gap-1">
      <span>{kicker}</span>
      <InfoTooltip text={DEPTH_KEYS[depth]} maxWidth={200} />
    </span>
  );
}
