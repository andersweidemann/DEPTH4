-- Append-only log when a user stars or unstars a thesis (UI toggle).
-- `thesis_stars` only reflects current state; this table preserves unstar (and star) history for support and analytics.

CREATE TABLE IF NOT EXISTS public.depth4_thesis_star_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('star', 'unstar')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depth4_thesis_star_events_user_created
  ON public.depth4_thesis_star_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_depth4_thesis_star_events_thesis_created
  ON public.depth4_thesis_star_events (thesis_id, created_at DESC);

ALTER TABLE public.depth4_thesis_star_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depth4_thesis_star_events insert own" ON public.depth4_thesis_star_events;
CREATE POLICY "depth4_thesis_star_events insert own"
  ON public.depth4_thesis_star_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "depth4_thesis_star_events select own" ON public.depth4_thesis_star_events;
CREATE POLICY "depth4_thesis_star_events select own"
  ON public.depth4_thesis_star_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.depth4_thesis_star_events IS
  'DEPTH4: one row per star/unstar toggle from the client (signed-in users).';
