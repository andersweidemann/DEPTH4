import { DEPTH_LABELS, type DepthLabelKey } from "@/lib/depth-labels";
import { TooltipTerm } from "@/components/thesis-engine-v2/TooltipTerm";

export function DepthDepthLabel({
  depth,
  kicker,
}: {
  depth: DepthLabelKey;
  kicker: string;
}) {
  return (
    <TooltipTerm label={DEPTH_LABELS[depth].tooltip} className="font-semibold text-inherit">
      {kicker}
    </TooltipTerm>
  );
}
