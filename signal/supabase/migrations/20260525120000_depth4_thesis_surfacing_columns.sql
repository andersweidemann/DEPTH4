-- DEPTH4 thesis surfacing / lifecycle columns (Phase 2).
-- Does not touch scenario_probabilities or conviction merge logic.

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS lifecycle_state text
    CHECK (
      lifecycle_state IS NULL
      OR lifecycle_state IN ('discovered', 'live', 'resolved', 'invalidated', 'archived')
    );

UPDATE public.theses
SET lifecycle_state = CASE status::text
  WHEN 'archived' THEN 'archived'
  WHEN 'resolved' THEN 'resolved'
  WHEN 'invalidated' THEN 'invalidated'
  WHEN 'forming' THEN 'discovered'
  ELSE 'live'
END
WHERE lifecycle_state IS NULL;

ALTER TABLE public.theses ALTER COLUMN lifecycle_state SET DEFAULT 'live';
ALTER TABLE public.theses ALTER COLUMN lifecycle_state SET NOT NULL;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS surfaced_bucket text
    CHECK (
      surfaced_bucket IS NULL
      OR surfaced_bucket IN ('tradable', 'emerging', 'monitoring')
    );

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS thesis_score double precision;

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS last_meaningful_update_at timestamptz;

UPDATE public.theses
SET last_meaningful_update_at = updated_at
WHERE last_meaningful_update_at IS NULL;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS evidence_momentum jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS outcome_label text;
ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS outcome_notes text;
ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS surfacing_computed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_theses_lifecycle_updated
  ON public.theses (lifecycle_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_theses_system_surfacing
  ON public.theses (thesis_origin, surfaced_bucket)
  WHERE thesis_origin IN ('seeded_system', 'ai_generated');

COMMENT ON COLUMN public.theses.lifecycle_state IS
  'DEPTH4 registry axis: discovered | live | resolved | invalidated | archived (independent of list status labels).';
COMMENT ON COLUMN public.theses.surfaced_bucket IS
  'Homepage competitive bucket for system/catalog rows; null for terminal rows or unset.';
COMMENT ON COLUMN public.theses.thesis_score IS
  'Cached thesisScoreV0-style rank input; filled by cron, not conviction math.';
COMMENT ON COLUMN public.theses.last_meaningful_update_at IS
  'Wall clock of last material thesis/evidence movement; defaults to updated_at until enriched.';
COMMENT ON COLUMN public.theses.surfacing_computed_at IS
  'When the thesis-surfacing cron last wrote surfaced_bucket / thesis_score for this row.';
