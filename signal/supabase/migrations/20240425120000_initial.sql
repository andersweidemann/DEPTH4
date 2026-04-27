-- DEPTH4 initial schema
-- Public users profile (1:1 with auth.users)

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  full_name text,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'institutional')),
  timezone text NOT NULL DEFAULT 'Europe/Stockholm',
  notification_preferences jsonb NOT NULL DEFAULT '{}',
  alerts_m3_m4_count_month int NOT NULL DEFAULT 0,
  usage_month date NOT NULL DEFAULT (date_trunc('month', (now() AT TIME ZONE 'utc'))::date),
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_complete boolean NOT NULL DEFAULT false,
  one_signal_player_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.portfolio_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  ticker text NOT NULL,
  company_name text,
  quantity numeric NOT NULL,
  avg_cost numeric,
  currency text NOT NULL DEFAULT 'SEK',
  broker text,
  manual_or_connected text NOT NULL DEFAULT 'manual' CHECK (manual_or_connected IN ('manual', 'connected', 'import')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_positions_user ON public.portfolio_positions (user_id);
CREATE INDEX idx_portfolio_positions_ticker ON public.portfolio_positions (ticker);

CREATE TABLE public.open_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  ticker text NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('limit', 'stop', 'market')),
  direction text NOT NULL CHECK (direction IN ('buy', 'sell')),
  limit_price numeric,
  quantity numeric,
  distance_pct numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_open_orders_user ON public.open_orders (user_id);

CREATE TABLE public.news_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  body_text text,
  source text,
  source_url text UNIQUE,
  published_at timestamptz,
  signal_level int NOT NULL DEFAULT 1 CHECK (signal_level BETWEEN 1 AND 4),
  category text,
  region text,
  urgency text,
  affected_sectors jsonb NOT NULL DEFAULT '[]',
  affected_tickers jsonb NOT NULL DEFAULT '[]',
  one_line_summary text,
  reasoning text,
  raw_json jsonb
);

CREATE INDEX idx_news_published ON public.news_events (published_at DESC);
CREATE INDEX idx_news_signal ON public.news_events (signal_level DESC);

CREATE TABLE public.consequence_trees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.news_events (id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  event_summary text,
  scenarios jsonb NOT NULL DEFAULT '[]',
  watch_signals jsonb NOT NULL DEFAULT '[]',
  updated_probabilities jsonb NOT NULL DEFAULT '{}',
  model_signal_level int CHECK (model_signal_level BETWEEN 1 AND 4)
);

CREATE INDEX idx_consequence_event ON public.consequence_trees (event_id);

CREATE TABLE public.user_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.news_events (id) ON DELETE CASCADE,
  tree_id uuid REFERENCES public.consequence_trees (id) ON DELETE SET NULL,
  portfolio_impact jsonb,
  order_recommendations jsonb,
  signal_level int NOT NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_alerts_user_unread ON public.user_alerts (user_id) WHERE read_at IS NULL;
CREATE INDEX idx_user_alerts_event ON public.user_alerts (event_id);

CREATE TABLE public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  briefing_date date NOT NULL,
  briefing_type text NOT NULL CHECK (briefing_type IN ('daily', 'weekend')),
  content_markdown text NOT NULL,
  delivered_at timestamptz
);

CREATE UNIQUE INDEX idx_briefings_user_date_type ON public.briefings (user_id, briefing_date, briefing_type);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consequence_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read self" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update self" ON public.users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert self" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Owner portfolio" ON public.portfolio_positions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner orders" ON public.open_orders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "News read" ON public.news_events FOR SELECT USING (true);
CREATE POLICY "Consequence read" ON public.consequence_trees FOR SELECT USING (true);
CREATE POLICY "Owner alerts" ON public.user_alerts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner briefings" ON public.briefings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Insert profile row for new auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH row EXECUTE FUNCTION public.handle_new_user();
