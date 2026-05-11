/** Session cache keys — account data is hydrated from Supabase on sign-in; these are not the source of truth. */
export const DEPTH4_STARRED_SESSION_KEY = "depth4.v2.starred.v1";
export const DEPTH4_NOTIFY_PREFS_SESSION_KEY = "depth4.v2.notify.prefs.v1";
export const DEPTH4_THESIS_OUTCOMES_SESSION_KEY = "depth4.v2.thesisOutcomes.v1";

/** Same string as `DEPTH4_THESIS_OUTCOMES_CHANGED` in `thesis-outcomes-store` — kept here to avoid import cycles. */
export const DEPTH4_THESIS_OUTCOMES_CHANGED_EVENT = "depth4:thesis-outcomes-changed";
