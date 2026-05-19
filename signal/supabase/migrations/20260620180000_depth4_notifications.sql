-- DEPTH4 bell dropdown: persisted in-app notifications (remodel, future kinds).

CREATE TABLE IF NOT EXISTS public.depth4_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  thesis_update_id uuid REFERENCES public.thesis_updates (id) ON DELETE SET NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depth4_notifications_user_created
  ON public.depth4_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_depth4_notifications_thesis
  ON public.depth4_notifications (thesis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_depth4_notifications_kind
  ON public.depth4_notifications (kind, created_at DESC);

ALTER TABLE public.depth4_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depth4_notifications owner read" ON public.depth4_notifications;
CREATE POLICY "depth4_notifications owner read"
  ON public.depth4_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "depth4_notifications owner update" ON public.depth4_notifications;
CREATE POLICY "depth4_notifications owner update"
  ON public.depth4_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.depth4_notifications IS
  'DEPTH4 bell notifications. kind thesis_remodel = scenario/trade-plan refresh; title/body/metadata match bell alert shape.';
