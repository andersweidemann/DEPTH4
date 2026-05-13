/**
 * Canonical DEPTH4 catalog thesis display lines — quality bar for AI registry heroes (`thesis_trade_line` → `theses.title`).
 * Keep in sync with seeded `public.theses` titles in `catalog-data.ts`.
 */
export const DEPTH4_REGISTRY_HERO_CATALOG_EXEMPLARS: readonly string[] = [
  "Gold will fall as a peace deal removes the war-risk premium the market has been paying within weeks",
  "USO will rerate higher as Hormuz chokepoint risk spikes within weeks",
  "USO will find a floor as OPEC holds barrels tight while US shale slows this quarter",
  "TLT will stay under pressure as the Fed delays rate cuts longer than the market expects this year",
  "RTX will rerate higher as named Pentagon contracts lock in its order book this quarter",
  "QQQ will underperform as AI spending squeezes margins before revenue catches up this earnings season",
  "Copper will stay bid as China's infrastructure buildout keeps demand above available supply",
  "META will underperform as EU platform rules tighten within months",
];

export function depth4RegistryHeroExemplarsForPrompt(): string {
  return DEPTH4_REGISTRY_HERO_CATALOG_EXEMPLARS.map((t, i) => `${i + 1}. ${t}`).join("\n");
}
