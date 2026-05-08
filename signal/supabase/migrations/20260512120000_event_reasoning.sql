-- Macro reasoning persistence (DEPTH4 L1–L4 structured output).
-- Anchor model: at most one row per (cluster_id, prompt_version) when cluster_id is set.
-- news_event_id is the chosen anchor from thesis_discovery_clusters.member_news_event_ids
-- (e.g. newest published_at/created_at or highest signal_level — selection logic lives in the worker).

CREATE TABLE IF NOT EXISTS public.event_reasoning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_event_id uuid NOT NULL REFERENCES public.news_events (id) ON DELETE CASCADE,
  cluster_id uuid REFERENCES public.thesis_discovery_clusters (id) ON DELETE SET NULL,
  reasoning jsonb NOT NULL,
  raw_response jsonb,
  model text NOT NULL,
  prompt_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_reasoning_news_event_prompt_version_key UNIQUE (news_event_id, prompt_version)
);

-- One macro-reasoning snapshot per discovery cluster per prompt version (cluster narrative).
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_reasoning_cluster_prompt_version
  ON public.event_reasoning (cluster_id, prompt_version)
  WHERE cluster_id IS NOT NULL;

-- UNIQUE (news_event_id, prompt_version) above supplies a btree usable for lookups by news_event_id.

CREATE INDEX IF NOT EXISTS idx_event_reasoning_cluster_id
  ON public.event_reasoning (cluster_id)
  WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_reasoning_thesis_relation
  ON public.event_reasoning ((reasoning->>'thesis_relation'));

CREATE INDEX IF NOT EXISTS idx_event_reasoning_confidence
  ON public.event_reasoning (((reasoning->>'confidence')::double precision));

COMMENT ON TABLE public.event_reasoning IS
  'Validated MacroEventReasoning JSON per cluster (anchor news_event_id + cluster_id). '
  'Service role writes; clients read via cluster_id or join through thesis_discovery_clusters.member_news_event_ids.';

COMMENT ON COLUMN public.event_reasoning.news_event_id IS
  'Anchor event chosen from cluster member_news_event_ids (not a fan-out per headline).';

COMMENT ON COLUMN public.event_reasoning.cluster_id IS
  'Discovery cluster this reasoning summarizes; NULL reserved for future non-cluster event-only runs.';

ALTER TABLE public.event_reasoning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read event reasoning" ON public.event_reasoning;
CREATE POLICY "Authenticated can read event reasoning"
  ON public.event_reasoning
  FOR SELECT
  TO authenticated
  USING (true);

-- Inserts/updates/deletes: no policies for authenticated — denied by default.
-- Service role bypasses RLS for cron/workers.
