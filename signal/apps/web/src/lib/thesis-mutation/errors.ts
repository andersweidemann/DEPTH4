/** Thrown when `public.thesis_updates` insert fails after the thesis row was written. */
export class ThesisMutationAuditError extends Error {
  readonly code = "audit_write_failed" as const;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ThesisMutationAuditError";
  }
}
