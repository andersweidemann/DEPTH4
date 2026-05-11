-- DEPTH4 v2: account-backed Book positions (thesis-linked trades).
-- sessionStorage remains a local cache; this table is the source of truth after hydration.

CREATE TABLE IF NOT EXISTS public.depth4_user_book (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depth4_user_book_updated ON public.depth4_user_book (updated_at DESC);

ALTER TABLE public.depth4_user_book ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "depth4_user_book owner all" ON public.depth4_user_book;
CREATE POLICY "depth4_user_book owner all"
  ON public.depth4_user_book
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.depth4_user_book IS
  'DEPTH4 Book positions JSON array per user; synced from web client; sessionStorage is cache only.';
