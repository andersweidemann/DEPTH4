-- Evidence insert → queue row → cron calls remodelScenariosOnEvidence (app layer).

CREATE TABLE IF NOT EXISTS public.evidence_cascade_queue (
  id bigserial PRIMARY KEY,
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  evidence_log_id uuid NOT NULL REFERENCES public.thesis_evidence_log (id) ON DELETE CASCADE,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thesis_id, evidence_log_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_cascade_queue_pending
  ON public.evidence_cascade_queue (created_at)
  WHERE processed = false;

COMMENT ON TABLE public.evidence_cascade_queue IS
  'Async queue for scenario remodel after thesis_evidence_log inserts (processed by /api/cron/evidence-cascade).';

ALTER TABLE public.evidence_cascade_queue ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated users cannot read/write; service role bypasses RLS.

CREATE OR REPLACE FUNCTION public.on_evidence_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Pipeline backfills probabilities inline; only queue rows still awaiting remodel.
  IF NEW.probability_before IS NULL AND NEW.probability_after IS NULL THEN
    INSERT INTO public.evidence_cascade_queue (thesis_id, evidence_log_id)
    VALUES (NEW.thesis_id, NEW.id)
    ON CONFLICT (thesis_id, evidence_log_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evidence_added_trigger ON public.thesis_evidence_log;
CREATE TRIGGER evidence_added_trigger
  AFTER INSERT ON public.thesis_evidence_log
  FOR EACH ROW
  EXECUTE FUNCTION public.on_evidence_added();

-- Realtime toasts: authenticated clients may subscribe to thesis_updates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'thesis_updates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.thesis_updates;
  END IF;
END;
$$;
