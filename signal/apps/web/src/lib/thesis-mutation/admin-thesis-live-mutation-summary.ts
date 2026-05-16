import { buildMutationCoverageReport } from "@/lib/thesis-mutation/thesis-mutation-coverage";
import { peekAuditHealthMetrics } from "@/lib/thesis-mutation/audit-health-metrics";
import { isThesisMutationEnabled } from "@/lib/thesis-mutation/feature-flags";
import { peekSystemMutationCounters } from "@/lib/thesis-mutation/system-thesis-mutation";

export type AdminThesisLiveMutationBlock = {
  mutationEnabled: boolean;
  mutationCoverage: ReturnType<typeof buildMutationCoverageReport>;
  mutationCounters: {
    scope: "process_lifetime";
    byPath: Record<string, number>;
  };
  auditHealth: ReturnType<typeof peekAuditHealthMetrics> & {
    limitations: string;
  };
};

export function buildAdminThesisLiveMutationBlock(
  audit24hByActor: Record<string, number>,
): AdminThesisLiveMutationBlock {
  return {
    mutationEnabled: isThesisMutationEnabled(),
    mutationCoverage: buildMutationCoverageReport(audit24hByActor),
    mutationCounters: {
      scope: "process_lifetime",
      byPath: peekSystemMutationCounters(),
    },
    auditHealth: {
      ...peekAuditHealthMetrics(),
      limitations:
        "Success/failure counts are in-process only; they reset on deploy/cold start. Compare with thesis_updates 24h totals for persisted audit volume.",
    },
  };
}
