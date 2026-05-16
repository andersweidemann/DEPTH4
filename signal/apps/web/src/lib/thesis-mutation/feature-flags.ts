/** Phase 1: route writes through ThesisMutationService + thesis_updates audit. */
export function isThesisMutationEnabled(): boolean {
  const v = (process.env.USE_THESIS_MUTATION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Phase 1: allow createSuccessor (off by default). */
export function isThesisSuccessorEnabled(): boolean {
  const v = (process.env.ENABLE_THESIS_SUCCESSOR ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
