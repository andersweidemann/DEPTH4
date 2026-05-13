/**
 * Canonical DEPTH4 thesis hero lines — quality bar for `thesis_trade_line` / registry titles in prompts.
 * Align with product voice; not every line has a 1:1 seed row in `catalog-data.ts`.
 */
export const DEPTH4_REGISTRY_HERO_CATALOG_EXEMPLARS: readonly string[] = [
  "Gold will fall as a peace deal removes the war-risk premium the market has been paying within weeks.",
  "TLT will stay under pressure as the Fed delays rate cuts longer than the market expects this year.",
  "USO will rerate higher as Hormuz chokepoint risk spikes within weeks.",
  "RTX will rerate higher as named Pentagon contracts lock in its order book this quarter.",
  "META rerates as AI monetization hits P&L while the tape still prices it as optional.",
  "Copper grinds higher as China's floor-setting stimulus stabilizes demand before consensus believes it.",
];

export function depth4RegistryHeroExemplarsForPrompt(): string {
  return DEPTH4_REGISTRY_HERO_CATALOG_EXEMPLARS.map((t, i) => `${i + 1}. ${t}`).join("\n");
}
