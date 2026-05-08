-- Phase 1: Dual-lane thesis system — schema only (no clustering/LLM yet).
-- - Extends public.theses with origin + AI metadata columns
-- - Adds thesis_discovery_clusters + thesis_generation_runs
-- - RLS: authenticated read on new tables; writes via service role only
-- - Backfill: seeded catalog + owner-less rows → seeded_system; user-owned → user
-- - Enforces: thesis_origin=user iff owner_user_id is set (system/ai rows are owner-less)

-- =============================================================================
-- 1) Discovery cluster (Phase 2+ pipeline writes here)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.thesis_discovery_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'forming'
    CHECK (status IN ('forming', 'candidate', 'promoted', 'rejected', 'archived')),
  title_hint text,
  member_news_event_ids uuid[] NOT NULL DEFAULT '{}',
  signal_score numeric NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_discovery_clusters_status
  ON public.thesis_discovery_clusters (status);
CREATE INDEX IF NOT EXISTS idx_thesis_discovery_clusters_updated_at
  ON public.thesis_discovery_clusters (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_thesis_discovery_clusters_signal
  ON public.thesis_discovery_clusters (signal_score DESC);

COMMENT ON TABLE public.thesis_discovery_clusters IS
  'News-driven narrative clusters for AI thesis discovery (Phase 2+).';

-- =============================================================================
-- 2) Generation run audit / idempotency (Phase 3+)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.thesis_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.thesis_discovery_clusters (id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  model text,
  input_hash text,
  output_thesis_id text REFERENCES public.theses (id) ON DELETE SET NULL,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'promoted', 'rejected', 'skipped_dedupe', 'error')),
  rejection_reason text,
  raw_llm_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_generation_runs_cluster_id
  ON public.thesis_generation_runs (cluster_id);
CREATE INDEX IF NOT EXISTS idx_thesis_generation_runs_run_at
  ON public.thesis_generation_runs (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_thesis_generation_runs_decision
  ON public.thesis_generation_runs (decision);
CREATE INDEX IF NOT EXISTS idx_thesis_generation_runs_input_hash
  ON public.thesis_generation_runs (input_hash)
  WHERE input_hash IS NOT NULL;

COMMENT ON TABLE public.thesis_generation_runs IS
  'LLM thesis generation attempts per cluster; service-role writes only.';

-- =============================================================================
-- 3) public.theses — origin lane + AI metadata
-- =============================================================================

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS thesis_origin text NOT NULL DEFAULT 'seeded_system'
    CHECK (thesis_origin IN ('user', 'seeded_system', 'ai_generated'));

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS generation_confidence numeric(5, 4);

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS generation_reasoning_summary text;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS discovery_cluster_id uuid
    REFERENCES public.thesis_discovery_clusters (id) ON DELETE SET NULL;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS first_detected_at timestamptz;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS ai_generation_version text;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS ai_expires_at timestamptz;

-- Drop CHECK on thesis_origin if re-run with ADD COLUMN IF NOT EXISTS (PostgreSQL may not re-add check); enforce via composite constraint below.

CREATE INDEX IF NOT EXISTS idx_theses_thesis_origin
  ON public.theses (thesis_origin);

CREATE INDEX IF NOT EXISTS idx_theses_discovery_cluster_id
  ON public.theses (discovery_cluster_id)
  WHERE discovery_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_theses_ai_generated
  ON public.theses (thesis_origin, updated_at DESC)
  WHERE thesis_origin = 'ai_generated';

COMMENT ON COLUMN public.theses.thesis_origin IS
  'user = owner_user_id set; seeded_system = catalog; ai_generated = discovery pipeline.';

-- =============================================================================
-- 4) Backfill thesis_origin
-- =============================================================================

UPDATE public.theses
SET thesis_origin = 'user'
WHERE owner_user_id IS NOT NULL;

-- Catalog / owner-less rows default to seeded_system; never clobber future ai_generated rows on re-run.
UPDATE public.theses
SET thesis_origin = 'seeded_system'
WHERE owner_user_id IS NULL
  AND thesis_origin IS DISTINCT FROM 'ai_generated';

-- =============================================================================
-- 5) Invariant: user lane owns rows; system/AI rows have no owner
-- =============================================================================

ALTER TABLE public.theses
  DROP CONSTRAINT IF EXISTS theses_origin_owner_invariant;

ALTER TABLE public.theses
  ADD CONSTRAINT theses_origin_owner_invariant CHECK (
    (thesis_origin = 'user' AND owner_user_id IS NOT NULL)
    OR (thesis_origin IN ('seeded_system', 'ai_generated') AND owner_user_id IS NULL)
  );

-- =============================================================================
-- 6) Optional: generation_confidence in [0, 1] when present
-- =============================================================================

ALTER TABLE public.theses
  DROP CONSTRAINT IF EXISTS theses_generation_confidence_range;

ALTER TABLE public.theses
  ADD CONSTRAINT theses_generation_confidence_range CHECK (
    generation_confidence IS NULL
    OR (generation_confidence >= 0 AND generation_confidence <= 1)
  );

-- =============================================================================
-- 7) RLS on new tables (read-only for authenticated; service role bypasses)
-- =============================================================================

ALTER TABLE public.thesis_discovery_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read thesis discovery clusters" ON public.thesis_discovery_clusters;
CREATE POLICY "Authenticated can read thesis discovery clusters"
  ON public.thesis_discovery_clusters
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can read thesis generation runs" ON public.thesis_generation_runs;
CREATE POLICY "Authenticated can read thesis generation runs"
  ON public.thesis_generation_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- 8) Tighten user thesis RLS — users may only insert/update user-origin rows
-- =============================================================================

DROP POLICY IF EXISTS "Users can insert own theses" ON public.theses;
CREATE POLICY "Users can insert own theses"
  ON public.theses
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND thesis_origin = 'user');

DROP POLICY IF EXISTS "Users can update own theses" ON public.theses;
CREATE POLICY "Users can update own theses"
  ON public.theses
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid() AND thesis_origin = 'user')
  WITH CHECK (owner_user_id = auth.uid() AND thesis_origin = 'user');
