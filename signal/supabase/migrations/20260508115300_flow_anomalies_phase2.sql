-- Insider Flow Detector Phase 2 fields

ALTER TABLE public.flow_anomalies
  ADD COLUMN IF NOT EXISTS probability_suggestion jsonb,
  ADD COLUMN IF NOT EXISTS status_reason text;

CREATE INDEX IF NOT EXISTS idx_flow_anomalies_status ON public.flow_anomalies (status);

