-- Insider Flow Detector: flow anomalies per thesis

CREATE TABLE IF NOT EXISTS public.flow_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  thesis_id text NOT NULL,
  thesis_title text NOT NULL,

  pattern_type text NOT NULL CHECK (pattern_type IN ('BULL_LEAK', 'BEAR_LEAK')),
  status text NOT NULL CHECK (status IN ('UNCONFIRMED_LEAK', 'CONFIRMED_MOVE', 'INVALIDATED')),

  instruments_moved jsonb NOT NULL DEFAULT '[]',
  return_data jsonb NOT NULL DEFAULT '{}',
  volume_multiple numeric,
  z_score numeric,

  linked_story_id uuid REFERENCES public.news_events (id) ON DELETE SET NULL,
  matched_tags jsonb NOT NULL DEFAULT '[]',

  confirmed_headline_at timestamptz,
  invalidated_at timestamptz,

  notes text
);

CREATE INDEX IF NOT EXISTS idx_flow_anomalies_created_at ON public.flow_anomalies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_anomalies_thesis_created ON public.flow_anomalies (thesis_id, created_at DESC);

ALTER TABLE public.flow_anomalies ENABLE ROW LEVEL SECURITY;

-- Minimal policy for MVP:
-- allow authenticated users to read anomaly feed. (Write path should use service role in cron.)
CREATE POLICY "Authenticated can read flow anomalies"
  ON public.flow_anomalies
  FOR SELECT
  TO authenticated
  USING (true);

