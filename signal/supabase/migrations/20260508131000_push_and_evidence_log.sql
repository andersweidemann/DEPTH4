-- Phase 3: Web push subscriptions + server-side evidence log

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Evidence log: persistent, server-written timeline for thesis updates
CREATE TABLE IF NOT EXISTS public.thesis_evidence_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id uuid NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  description text,
  probability_before jsonb,
  probability_after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- used to prevent duplicates on retries (e.g. anomaly_id + event_type)
  dedupe_key text UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_evidence_log_thesis_id ON public.thesis_evidence_log (thesis_id);
CREATE INDEX IF NOT EXISTS idx_evidence_log_created_at ON public.thesis_evidence_log (created_at DESC);

ALTER TABLE public.thesis_evidence_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read evidence log"
  ON public.thesis_evidence_log
  FOR SELECT
  TO authenticated
  USING (true);

