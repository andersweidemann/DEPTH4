-- Minimal thesis store for Insider Flow Detector (Phase 2)
-- NOTE: This is a lightweight MVP table to support server-side cron + persistent logs.

CREATE TABLE IF NOT EXISTS public.theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('forming','watching','ready','active','resolved','invalidated','archived')),

  -- Scenario probabilities (optional for now; UI still has its own scenario model)
  scenario_probabilities jsonb NOT NULL DEFAULT '{"base":40,"bull":35,"bear":25}',

  -- Insider Flow configuration (optional; when null/empty, thesis is not monitored)
  insider_flow jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_theses_status ON public.theses (status);
CREATE INDEX IF NOT EXISTS idx_theses_updated_at ON public.theses (updated_at DESC);

ALTER TABLE public.theses ENABLE ROW LEVEL SECURITY;

-- MVP: allow authenticated users to read theses (writes happen elsewhere / service role).
CREATE POLICY "Authenticated can read theses"
  ON public.theses
  FOR SELECT
  TO authenticated
  USING (true);

