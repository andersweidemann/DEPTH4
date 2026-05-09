import { SYSTEM_THESIS_IDS } from "@/lib/thesis-engine-v2/system-thesis-ids";

/**
 * Slugs for seeded `public.theses` rows (must match Supabase seed migrations).
 * Used to reserve routes and collision-check user-authored theses without importing the full catalog baseline list.
 */
export const CATALOG_SLUG_BY_SYSTEM_ID: Record<(typeof SYSTEM_THESIS_IDS)[keyof typeof SYSTEM_THESIS_IDS], string> = {
  [SYSTEM_THESIS_IDS.gold]: "war-peace-gold-short",
  [SYSTEM_THESIS_IDS.hormuz]: "strait-hormuz-oil-long",
  [SYSTEM_THESIS_IDS.opec]: "opec-unity-fracturing",
  [SYSTEM_THESIS_IDS.tlt]: "fed-pivot-delayed-tlt-weakness",
  [SYSTEM_THESIS_IDS.defense]: "us-defense-repricing-rtx-lmt",
  [SYSTEM_THESIS_IDS.qqq]: "ai-capex-squeeze-qqq-rotation",
  [SYSTEM_THESIS_IDS.copper]: "china-stimulus-copper-long",
  [SYSTEM_THESIS_IDS.euTech]: "eu-tech-crackdown-megacap",
};

export const RESERVED_CATALOG_SLUGS = new Set<string>(Object.values(CATALOG_SLUG_BY_SYSTEM_ID));

export function catalogSlugForSystemThesisId(thesisId: string): string | undefined {
  return (CATALOG_SLUG_BY_SYSTEM_ID as Record<string, string>)[thesisId];
}
