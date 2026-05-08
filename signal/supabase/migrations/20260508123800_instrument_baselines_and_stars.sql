-- Insider Flow Detector Phase 2: baseline caching + starred theses index

CREATE TABLE IF NOT EXISTS public.instrument_baselines (
  instrument text PRIMARY KEY,
  volatility_30d numeric,
  avg_volume_by_hour jsonb,
  last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instrument_baselines_updated ON public.instrument_baselines (last_updated DESC);

ALTER TABLE public.instrument_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read instrument baselines"
  ON public.instrument_baselines
  FOR SELECT
  TO authenticated
  USING (true);

-- Star relationships (server-side cron uses this to decide which theses to scan).
CREATE TABLE IF NOT EXISTS public.thesis_stars (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  thesis_id uuid NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thesis_id)
);

CREATE INDEX IF NOT EXISTS idx_thesis_stars_thesis ON public.thesis_stars (thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_stars_created ON public.thesis_stars (created_at DESC);

ALTER TABLE public.thesis_stars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their thesis stars"
  ON public.thesis_stars
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their thesis stars"
  ON public.thesis_stars
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their thesis stars"
  ON public.thesis_stars
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

