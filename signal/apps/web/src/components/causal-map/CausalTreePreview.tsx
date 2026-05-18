import type { ThesisCluster } from "@/types/causal-graph";
import { cn } from "@/lib/utils";
import { AssetAffectChip } from "@/components/causal-map/AssetAffectChip";
import { filterAffect } from "@/lib/causal-map/causal-map-filters";

/**
 * Compact nested-tree preview (visual reference for event → thesis → affects).
 */
export function CausalTreePreview({
  cluster,
  hidePricedIn,
}: {
  cluster: ThesisCluster;
  hidePricedIn: boolean;
}) {
  const hub = cluster.theses[0];
  if (!hub) return null;
  const affects = hub.affects.filter((a) => filterAffect(a, hidePricedIn));

  return (
    <section
      className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[#111110] p-6"
      aria-label="Causal tree preview"
    >
      <div className="mx-auto flex min-w-[min(100%,42rem)] flex-col items-center">
        <RootEventCard cluster={cluster} />
        <div className="my-2 h-8 w-px bg-amber-500/40" aria-hidden />
        <HubThesisCard hub={hub} />
        {affects.length > 0 ? (
          <>
            <div className="relative my-2 h-6 w-full max-w-md" aria-hidden>
              <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-amber-500/30" />
              <AffectConnectors count={affects.length} />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {affects.map((a) => (
                <AssetAffectChip
                  key={a.assetSymbol}
                  affect={a}
                  emphasis={
                    a.mispricingScore >= 70 && a.pricedInPercent <= 40
                      ? "edge"
                      : a.pricedInPercent > 80
                        ? "muted"
                        : "default"
                  }
                />
              ))}
            </div>
          </>
        ) : null}
        {cluster.theses.length > 1 ? (
          <SiblingThesesList theses={cluster.theses.slice(1)} />
        ) : null}
      </div>
    </section>
  );
}

function RootEventCard({ cluster }: { cluster: ThesisCluster }) {
  return (
    <div className="w-full max-w-md rounded-lg border-2 border-amber-500/50 bg-zinc-900/40 px-4 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/90">
        {cluster.event.title}
      </p>
      <p className="mt-1 text-[11px] text-zinc-400">{cluster.event.description}</p>
      <p className="mt-2 text-[10px] tabular-nums text-zinc-500">Confidence {cluster.event.confidence}%</p>
      <p className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">Root event</p>
    </div>
  );
}

function HubThesisCard({ hub }: { hub: ThesisCluster["theses"][0] }) {
  return (
    <div className="rounded-lg border-2 border-[#E8473F]/60 bg-[#E8473F]/[0.06] px-5 py-3 text-center shadow-[0_0_24px_rgba(232,71,63,0.12)]">
      <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-100">{hub.title}</p>
      <p className="mt-1 text-[11px] tabular-nums text-zinc-400">
        Conviction {hub.conviction}% · Mispricing {hub.mispricingScore}/100
      </p>
      <p className="mt-1 text-[10px] text-zinc-500">Primary thesis edge · {hub.targetAssetSymbol}</p>
    </div>
  );
}

function AffectConnectors({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <div className="absolute left-[10%] right-[10%] top-3 flex justify-between">
      {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
        <AffectConnectorLine key={i} />
      ))}
    </div>
  );
}

function AffectConnectorLine() {
  return <div className="h-px w-8 bg-amber-500/25" />;
}

function SiblingThesesList({ theses }: { theses: ThesisCluster["theses"] }) {
  return (
    <div className="mt-6 w-full max-w-md border-t border-white/[0.06] pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Related theses</p>
      <ul className="mt-2 space-y-2">
        {theses.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-zinc-900/30 px-3 py-2 text-[11px]"
          >
            <span className={cn("font-bold", t.direction === "up" ? "text-emerald-400" : "text-red-400")}>
              {t.direction === "up" ? "↑" : "↓"}
            </span>
            <span className="font-medium text-zinc-200">{t.title}</span>
            <span className="ml-auto tabular-nums text-zinc-500">{t.mispricingScore}/100</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
