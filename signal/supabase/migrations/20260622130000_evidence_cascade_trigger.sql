-- Idempotent repair: evidence_cascade_queue + trigger on thesis_evidence_log inserts.
-- Safe to run multiple times in Supabase SQL Editor if earlier migrations never applied.

-- 1. Queue table (matches app + 20260621120000 / 20260622120000)
CREATE TABLE IF NOT EXISTS public.evidence_cascade_queue (
  id bigserial PRIMARY KEY,
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  evidence_log_id uuid NOT NULL REFERENCES public.thesis_evidence_log (id) ON DELETE CASCADE,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thesis_id, evidence_log_id)
);

ALTER TABLE public.evidence_cascade_queue
  ADD COLUMN IF NOT EXISTS trigger_reason text NOT NULL DEFAULT 'new_evidence',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS result jsonb;

ALTER TABLE public.evidence_cascade_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_evidence_cascade_queue_pending
  ON public.evidence_cascade_queue (created_at)
  WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_evidence_cascade_queue_status_pending
  ON public.evidence_cascade_queue (created_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.evidence_cascade_queue IS
  'Async queue for full thesis re-model after thesis_evidence_log inserts (/api/cron/evidence-cascade).';

-- 2. Trigger function — queue every new evidence row (news cron sets probabilities inline; cascade still runs full remodel)
CREATE OR REPLACE FUNCTION public.on_evidence_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.evidence_cascade_queue (
    thesis_id,
    evidence_log_id,
    trigger_reason,
    status,
    processed
  )
  VALUES (NEW.thesis_id, NEW.id, 'new_evidence', 'pending', false)
  ON CONFLICT (thesis_id, evidence_log_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. Trigger (repo name: evidence_added_trigger)
DROP TRIGGER IF EXISTS evidence_cascade_after_insert ON public.thesis_evidence_log;
DROP TRIGGER IF EXISTS evidence_added_trigger ON public.thesis_evidence_log;
CREATE TRIGGER evidence_added_trigger
  AFTER INSERT ON public.thesis_evidence_log
  FOR EACH ROW
  EXECUTE FUNCTION public.on_evidence_added();

-- 4. Backfill last 24h evidence not yet queued
INSERT INTO public.evidence_cascade_queue (
  thesis_id,
  evidence_log_id,
  trigger_reason,
  status,
  processed
)
SELECT e.thesis_id, e.id, 'new_evidence', 'pending', false
FROM public.thesis_evidence_log e
LEFT JOIN public.evidence_cascade_queue q ON q.evidence_log_id = e.id
WHERE e.created_at > now() - interval '24 hours'
  AND q.id IS NULL
ON CONFLICT (thesis_id, evidence_log_id) DO NOTHING;

-- 5. Realtime publication for thesis_updates (idempotent)
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
