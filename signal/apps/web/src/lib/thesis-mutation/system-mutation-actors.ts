/** Default actor_type + reason strings for engine/cron thesis writes (Phase 2). */
export const SYSTEM_MUTATION = {
  scheduler: {
    actorType: "scheduler",
    surfacingReason: "Scheduled home surfacing refresh (bucket, score, freshness)",
  },
  news: {
    actorType: "news",
    scenarioReason: "News tag/ticker match adjusted scenario probabilities",
  },
  macro: {
    actorType: "macro",
    scenarioReason: "Macro event reasoning adjusted scenario probabilities",
  },
  system: {
    actorType: "system",
    defaultReason: "Engine field update",
  },
} as const;
