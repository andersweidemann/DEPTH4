-- Extend evidence cascade queue for status-based re-modeling (trade plan + scenarios).

ALTER TABLE public.evidence_cascade_queue
  ADD COLUMN IF NOT EXISTS trigger_reason text NOT NULL DEFAULT 'new_evidence',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS result jsonb;

COMMENT ON COLUMN public.evidence_cascade_queue.trigger_reason IS
  'new_evidence | price_significant_move | daily_recalc | weekly_reeval | manual';

COMMENT ON COLUMN public.evidence_cascade_queue.status IS
  'pending | processing | done | failed';

UPDATE public.evidence_cascade_queue
SET
  status = 'done',
  processed_at = COALESCE(processed_at, created_at)
WHERE processed = true
  AND (status IS NULL OR status = 'pending');

CREATE INDEX IF NOT EXISTS idx_evidence_cascade_queue_status_pending
  ON public.evidence_cascade_queue (created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.on_evidence_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.probability_before IS NULL AND NEW.probability_after IS NULL THEN
    INSERT INTO public.evidence_cascade_queue (
      thesis_id,
      evidence_log_id,
      trigger_reason,
      status,
      processed
    )
    VALUES (NEW.thesis_id, NEW.id, 'new_evidence', 'pending', false)
    ON CONFLICT (thesis_id, evidence_log_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
