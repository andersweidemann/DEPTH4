/** Values stored in `public.theses.thesis_origin` (must match DB CHECK). */
export const THESIS_ORIGIN_USER = "user" as const;
export const THESIS_ORIGIN_SEEDED = "seeded_system" as const;
export const THESIS_ORIGIN_AI = "ai_generated" as const;

/** Origins loaded from Supabase by slug on detail/list paths (catalog uses shipped `catalog-data`). */
export const THESIS_ORIGINS_READABLE_BY_SLUG = [
  THESIS_ORIGIN_USER,
  THESIS_ORIGIN_AI,
] as const;

export type ThesisDbOriginReadableBySlug = (typeof THESIS_ORIGINS_READABLE_BY_SLUG)[number];
