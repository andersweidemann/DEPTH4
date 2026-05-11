import type { ThesisStatus } from "@/types/thesis";

export function inferAssetClassFromTicker(asset: string): "Equity" | "Rates" | "FX" | "Commodities" | "Crypto" {
  const u = asset.trim().toUpperCase();
  if (!u) return "Equity";
  if (/^(BTC|ETH|SOL|XRP|DOGE)/.test(u)) return "Crypto";
  if (/^(XAU|XAG|GLD|SLV|HG|CL|USO|UNG|BOIL|DBA|WEAT|CORN)/.test(u)) return "Commodities";
  if (/^(TLT|IEF|SHY|HYG|LQD|TBT)/.test(u) || u.includes("RATE")) return "Rates";
  if (u.includes("/") || /^(EUR|GBP|JPY|AUD|CAD|CHF|NZD)USD/.test(u) || /^USD(JPY|CHF|CAD)/.test(u)) return "FX";
  return "Equity";
}

export function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function getStatusDotColor(status: ThesisStatus): string {
  switch (status) {
    case "Ready":
      return "bg-amber-400";
    case "Active":
      return "bg-zinc-500";
    case "Watching":
      return "bg-zinc-600";
    case "Draft":
      return "bg-zinc-700";
    default:
      return "bg-zinc-600";
  }
}

export function getStatusTextColor(status: ThesisStatus): string {
  switch (status) {
    case "Ready":
      return "text-amber-400";
    case "Active":
      return "text-zinc-400";
    case "Watching":
      return "text-zinc-500";
    case "Draft":
      return "text-zinc-600";
    default:
      return "text-zinc-500";
  }
}

export function getDirectionBadgeClasses(direction: "short" | "long"): string {
  return direction === "short"
    ? "border-red-500/30 text-red-400"
    : "border-emerald-500/30 text-emerald-400";
}
