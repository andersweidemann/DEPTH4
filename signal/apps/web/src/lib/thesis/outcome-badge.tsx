import type { ThesisOutcomeKind } from "@/types/thesis-outcome";

export function ThesisOutcomeInlineBadge({ outcome }: { outcome: ThesisOutcomeKind }) {
  switch (outcome) {
    case "won_clean":
      return <span className="text-[10px] text-emerald-400">✓ Won</span>;
    case "won_messy":
      return <span className="text-[10px] text-emerald-300">~ Won</span>;
    case "failed":
      return <span className="text-[10px] text-red-400">✗ Failed</span>;
    case "expired":
      return <span className="text-[10px] text-zinc-500">○ Expired</span>;
    case "withdrawn":
      return <span className="text-[10px] text-zinc-500">Withdrawn</span>;
    case "superseded":
      return <span className="text-[10px] text-zinc-500">Superseded</span>;
    default:
      return null;
  }
}
