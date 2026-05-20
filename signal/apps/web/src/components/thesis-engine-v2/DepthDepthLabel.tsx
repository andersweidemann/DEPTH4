import { DEPTH_LABELS, type DepthLabelKey } from "@/lib/depth-labels";
import { HoverHelp } from "@/components/ui/HoverHelp";

export function DepthDepthLabel({
  depth,
  kicker,
}: {
  depth: DepthLabelKey;
  kicker: string;
}) {
  return (
    <HoverHelp
      className="font-semibold text-inherit"
      label={kicker}
      tooltip={DEPTH_LABELS[depth].tooltip}
    />
  );
}
