import type { EventCategory } from "@/types/causal-graph";

const LABELS: Record<EventCategory, string> = {
  geopolitics: "Geopolitics",
  monetary_policy: "Monetary policy",
  fiscal_policy: "Fiscal policy",
  commodity_supply: "Commodity supply",
  demand_shock: "Demand shock",
  technology: "Technology",
  climate: "Climate",
  trade_policy: "Trade policy",
};

export function eventCategoryLabel(category: EventCategory): string {
  return LABELS[category] ?? category;
}
