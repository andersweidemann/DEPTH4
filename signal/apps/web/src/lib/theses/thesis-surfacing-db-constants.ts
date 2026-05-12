/** Mirrors `public.theses.lifecycle_state` CHECK (Phase 2 migration). */
export const THESIS_LIFECYCLE_STATES = ["discovered", "live", "resolved", "invalidated", "archived"] as const;
export type ThesisLifecycleStateDb = (typeof THESIS_LIFECYCLE_STATES)[number];

/** Mirrors `public.theses.surfaced_bucket` CHECK; null allowed in DB. */
export const THESIS_SURFACED_BUCKETS = ["tradable", "emerging", "monitoring"] as const;
export type ThesisSurfacedBucketDb = (typeof THESIS_SURFACED_BUCKETS)[number];
