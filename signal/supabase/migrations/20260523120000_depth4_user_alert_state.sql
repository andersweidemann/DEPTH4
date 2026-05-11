-- DEPTH4 thesis bell: per-user read / dismissed state for stable alert keys (e.g. evidence:<uuid>).
-- Client memory is cleared on logout; this table is the source of truth across sessions and devices.

CREATE TABLE IF NOT EXISTS public.depth4_user_alert_state (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('read', 'dismissed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_depth4_user_alert_state_updated ON public.depth4_user_alert_state (user_id, updated_at DESC);

ALTER TABLE public.depth4_user_alert_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depth4_user_alert_state owner all" ON public.depth4_user_alert_state;
CREATE POLICY "depth4_user_alert_state owner all"
  ON public.depth4_user_alert_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.depth4_user_alert_state IS
  'DEPTH4 alert tray read/dismissed flags keyed by stable client ids (evidence:<thesis_evidence_log.id>, etc.).';
