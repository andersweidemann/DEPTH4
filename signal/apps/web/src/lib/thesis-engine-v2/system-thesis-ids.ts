/** IDs must match `public.theses` seed and v2 mock data. Do not rename without a DB migration. */
export const SYSTEM_THESIS_IDS = {
  gold: "th-gold",
  hormuz: "th-hormuz",
  opec: "th-opec",
  tlt: "th-tlt",
  defense: "th-defense",
  qqq: "th-qqq",
  copper: "th-copper",
  euTech: "th-eutech",
} as const;

export type SystemThesisId = (typeof SYSTEM_THESIS_IDS)[keyof typeof SYSTEM_THESIS_IDS];

const ID_SET = new Set<string>(Object.values(SYSTEM_THESIS_IDS));

export function isSystemThesisId(id: string): boolean {
  return ID_SET.has(id);
}
