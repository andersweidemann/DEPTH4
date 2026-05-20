import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { createClient } from "@/lib/supabase/server";

export type PipelineStatusPayload = {
  pipelineActive: boolean;
  queueSize: number;
  lastActivity: string | null;
  currentTask: string | null;
  recentEvidenceCount: number;
};

async function countPendingCascade(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb
    .from("evidence_cascade_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"]);
  if (error) return 0;
  return count ?? 0;
}

async function latestEvidenceAt(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb
    .from("thesis_evidence_log")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const iso = data?.created_at ? String(data.created_at).trim() : "";
  return iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
}

async function recentEvidenceCount(sb: SupabaseClient, sinceIso: string): Promise<number> {
  const { count, error } = await sb
    .from("thesis_evidence_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (error) return 0;
  return count ?? 0;
}

function describeTask(queueSize: number, recentEvidence: number): string | null {
  if (queueSize > 0) {
    return queueSize === 1
      ? "Updating 1 thesis with new market data…"
      : `Updating ${queueSize} theses with new market data…`;
  }
  if (recentEvidence > 0) {
    return recentEvidence === 1
      ? "Analyzing new evidence…"
      : `Analyzing ${recentEvidence} new headlines…`;
  }
  return null;
}

export async function loadPipelineStatus(sb?: SupabaseClient): Promise<PipelineStatusPayload> {
  const client = sb ?? createServiceRoleClient() ?? (await createClient());
  const since = new Date(Date.now() - 15 * 60_000).toISOString();

  const [queueSize, lastActivity, recentEvidence] = await Promise.all([
    countPendingCascade(client),
    latestEvidenceAt(client),
    recentEvidenceCount(client, since),
  ]);

  const pipelineActive = queueSize > 0 || recentEvidence >= 3;
  const currentTask = pipelineActive ? describeTask(queueSize, recentEvidence) : null;

  return {
    pipelineActive,
    queueSize,
    lastActivity,
    currentTask,
    recentEvidenceCount: recentEvidence,
  };
}
