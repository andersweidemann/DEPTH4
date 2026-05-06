-- User-submitted suggestions for the curated ticker registry (quality-first).

CREATE TABLE IF NOT EXISTS public.ticker_registry_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  display_name text,
  short_name text,
  asset_class text,
  region text,
  notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticker_registry_suggestions_user ON public.ticker_registry_suggestions (user_id);
CREATE INDEX IF NOT EXISTS idx_ticker_registry_suggestions_symbol ON public.ticker_registry_suggestions (symbol);

-- One suggestion per user per symbol.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticker_registry_suggestions_user_symbol
  ON public.ticker_registry_suggestions (user_id, symbol);

ALTER TABLE public.ticker_registry_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can submit suggestions for themselves.
DROP POLICY IF EXISTS "Ticker registry suggestions insert" ON public.ticker_registry_suggestions;
CREATE POLICY "Ticker registry suggestions insert" ON public.ticker_registry_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can view their own suggestions (optional, helpful for UX).
DROP POLICY IF EXISTS "Ticker registry suggestions read own" ON public.ticker_registry_suggestions;
CREATE POLICY "Ticker registry suggestions read own" ON public.ticker_registry_suggestions
  FOR SELECT USING (auth.uid() = user_id);

