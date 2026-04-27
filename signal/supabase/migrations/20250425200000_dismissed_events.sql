-- Per-user "not interested" for feed items (hides the headline in their dashboard)
CREATE TABLE public.user_dismissed_events (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.news_events (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX idx_ude_user ON public.user_dismissed_events (user_id);

ALTER TABLE public.user_dismissed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage their dismissed events"
  ON public.user_dismissed_events
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
