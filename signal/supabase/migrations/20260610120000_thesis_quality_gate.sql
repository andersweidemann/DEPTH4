-- Thesis promotion quality gate (DEPTH4 PROMPT 12)

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS quality_score int DEFAULT 0;

ALTER TABLE public.theses
  DROP CONSTRAINT IF EXISTS theses_quality_score_check;

ALTER TABLE public.theses
  ADD CONSTRAINT theses_quality_score_check CHECK (quality_score >= 0 AND quality_score <= 100);

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS quality_checks jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS promotion_blocked_reason text;

COMMENT ON COLUMN public.theses.quality_score IS
  '0–100 composite from quality gate checks; gates list surfacing and status promotion.';

COMMENT ON COLUMN public.theses.quality_checks IS
  'JSON array of per-check pass/fail results from runQualityGate.';

COMMENT ON COLUMN public.theses.promoted_at IS
  'Last time status was promoted (watching → active → ready).';

COMMENT ON COLUMN public.theses.promotion_blocked_reason IS
  'Human-readable reason when promotion was blocked by quality gate.';

CREATE INDEX IF NOT EXISTS idx_theses_quality_score ON public.theses (quality_score DESC);
