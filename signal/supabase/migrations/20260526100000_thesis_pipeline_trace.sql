-- Append-only audit trail for DEPTH4 thesis discovery → macro reasoning → registry → UI surfacing.
-- Written by cron workers (service role); readable by authenticated clients for admin tooling.

CREATE TABLE IF NOT EXISTS public.thesis_pipeline_trace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.thesis_discovery_clusters (id) ON DELETE CASCADE,
  news_event_id uuid REFERENCES public.news_events (id) ON DELETE SET NULL,
  stage text NOT NULL,
  status text NOT NULL,
  reason_code text,
  detail text,
  thesis_candidate_id uuid,
  thesis_id text REFERENCES public.theses (id) ON DELETE SET NULL,
  model text,
  prompt_version text,
  source_tier_mix jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_pipeline_trace_cluster_created
  ON public.thesis_pipeline_trace (cluster_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_thesis_pipeline_trace_stage
  ON public.thesis_pipeline_trace (stage, created_at DESC);

COMMENT ON TABLE public.thesis_pipeline_trace IS
  'DEPTH4 pipeline stage events (ingest/cluster/promotion/reasoning/candidate/validation/thesis/surfaced). '
  'Stable IDs: cluster_id, news_event_id (anchor when known), thesis_candidate_id = event_reasoning.id, thesis_id = public.theses.id.';

COMMENT ON COLUMN public.thesis_pipeline_trace.reason_code IS
  'Canonical rejection bucket (headline_rewrite, missing_l3_l4, …) or worker-specific codes for infra failures.';

COMMENT ON COLUMN public.thesis_pipeline_trace.source_tier_mix IS
  'JSON map of news signal_level counts for cluster members at trace time (e.g. {"3":2,"4":1}).';

ALTER TABLE public.thesis_pipeline_trace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read thesis pipeline trace" ON public.thesis_pipeline_trace;
CREATE POLICY "Authenticated can read thesis pipeline trace"
  ON public.thesis_pipeline_trace
  FOR SELECT
  TO authenticated
  USING (true);
