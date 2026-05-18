-- Thesis outcome pipeline: formal resolution records + theses.outcome column.

CREATE TABLE IF NOT EXISTS public.thesis_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  thesis_slug text NOT NULL,
  outcome text NOT NULL CHECK (
    outcome IN ('won_clean', 'won_messy', 'failed', 'expired', 'withdrawn', 'superseded')
  ),
  resolved_at timestamptz NOT NULL DEFAULT now(),
  resolved_by text NOT NULL DEFAULT 'manual' CHECK (resolved_by IN ('auto', 'manual', 'system')),
  resolved_price numeric(12, 4),
  predicted_direction text NOT NULL CHECK (predicted_direction IN ('up', 'down')),
  actual_direction text CHECK (actual_direction IN ('up', 'down', 'neutral')),
  conviction_at_start int CHECK (conviction_at_start BETWEEN 0 AND 100),
  conviction_at_end int CHECK (conviction_at_end BETWEEN 0 AND 100),
  hold_duration_days int,
  pnl numeric(12, 4),
  max_drawdown numeric(8, 4),
  catalyst text,
  reflection text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thesis_outcomes_thesis_id ON public.thesis_outcomes (thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_outcomes_resolved_at ON public.thesis_outcomes (resolved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_thesis_outcomes_thesis_id_unique ON public.thesis_outcomes (thesis_id);

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS outcome text CHECK (
    outcome IS NULL
    OR outcome IN ('won_clean', 'won_messy', 'failed', 'expired', 'withdrawn', 'superseded')
  );

ALTER TABLE public.thesis_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read thesis_outcomes" ON public.thesis_outcomes;
CREATE POLICY "Public read thesis_outcomes"
  ON public.thesis_outcomes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert thesis_outcomes" ON public.thesis_outcomes;
CREATE POLICY "Authenticated insert thesis_outcomes"
  ON public.thesis_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update thesis_outcomes" ON public.thesis_outcomes;
CREATE POLICY "Authenticated update thesis_outcomes"
  ON public.thesis_outcomes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
