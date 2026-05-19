-- Per-user hide from theses card view (/theses).

CREATE TABLE IF NOT EXISTS public.user_hidden_theses (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thesis_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hidden_theses_user ON public.user_hidden_theses (user_id, hidden_at DESC);

ALTER TABLE public.user_hidden_theses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own hidden theses" ON public.user_hidden_theses;
CREATE POLICY "Users read own hidden theses"
  ON public.user_hidden_theses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users hide theses" ON public.user_hidden_theses;
CREATE POLICY "Users hide theses"
  ON public.user_hidden_theses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users unhide theses" ON public.user_hidden_theses;
CREATE POLICY "Users unhide theses"
  ON public.user_hidden_theses
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
