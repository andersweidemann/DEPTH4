-- Causal graph: events, assets, thesis edges (affects), clusters, cross-thesis relations.

-- =============================================================================
-- Core tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.causal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (
    category IN (
      'geopolitics',
      'monetary_policy',
      'fiscal_policy',
      'commodity_supply',
      'demand_shock',
      'technology',
      'climate',
      'trade_policy'
    )
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'faded')),
  confidence int NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  first_detected timestamptz NOT NULL DEFAULT now(),
  last_updated timestamptz NOT NULL DEFAULT now(),
  source_headlines text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.causal_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  name text NOT NULL,
  asset_class text NOT NULL CHECK (
    asset_class IN ('equity', 'commodity', 'rates', 'fx', 'crypto', 'etf')
  ),
  related_etfs text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.causal_affects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.causal_assets (id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('up', 'down', 'neutral')),
  strength int NOT NULL CHECK (strength BETWEEN 0 AND 100),
  priced_in_percent int NOT NULL CHECK (priced_in_percent BETWEEN 0 AND 100),
  mispricing_score int GENERATED ALWAYS AS (strength - priced_in_percent) STORED,
  why_it_matters text,
  has_dedicated_thesis boolean NOT NULL DEFAULT false,
  thesis_slug text REFERENCES public.theses (slug) ON DELETE SET NULL,
  UNIQUE (thesis_id, asset_id)
);

CREATE TABLE IF NOT EXISTS public.thesis_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  to_thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('shares_event', 'implies', 'contradicts')),
  UNIQUE (from_thesis_id, to_thesis_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_thesis_relations_from ON public.thesis_relations (from_thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_relations_to ON public.thesis_relations (to_thesis_id);

CREATE TABLE IF NOT EXISTS public.event_thesis_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.causal_events (id) ON DELETE CASCADE,
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  UNIQUE (event_id, thesis_id)
);

CREATE INDEX IF NOT EXISTS idx_event_thesis_links_event ON public.event_thesis_links (event_id);
CREATE INDEX IF NOT EXISTS idx_event_thesis_links_thesis ON public.event_thesis_links (thesis_id);
CREATE INDEX IF NOT EXISTS idx_causal_affects_thesis ON public.causal_affects (thesis_id);

-- =============================================================================
-- Thesis columns for graph / priced-in estimate
-- =============================================================================

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.causal_events (id) ON DELETE SET NULL;

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS priced_in_estimate int CHECK (priced_in_estimate IS NULL OR priced_in_estimate BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_theses_event_id ON public.theses (event_id) WHERE event_id IS NOT NULL;

-- =============================================================================
-- Seed events & assets
-- =============================================================================

INSERT INTO public.causal_events (slug, title, description, category, confidence, first_detected)
VALUES
  (
    'war-peace-transition',
    'War de-escalation',
    'Peace talks progress, escalation headlines thin',
    'geopolitics',
    82,
    now()
  ),
  (
    'fed-policy-2025',
    'Fed policy pivot',
    'Fed signals rate-cut patience on tariff-inflation dilemma',
    'monetary_policy',
    78,
    now()
  ),
  (
    'china-demand-copper',
    'China demand recovery',
    'China stimulus + restocking drives copper demand',
    'demand_shock',
    65,
    now()
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  confidence = EXCLUDED.confidence,
  last_updated = now();

INSERT INTO public.causal_assets (symbol, name, asset_class, related_etfs)
VALUES
  ('XAUUSD', 'Spot Gold', 'commodity', ARRAY['GLD', 'IAU']),
  ('RTX', 'RTX Corp', 'equity', ARRAY['ITA']),
  ('CL.1', 'WTI Crude Oil', 'commodity', ARRAY['USO', 'XLE']),
  ('GC.1', 'Gold Futures', 'commodity', ARRAY['GLD', 'IAU']),
  ('GLD', 'SPDR Gold', 'etf', ARRAY['GLD']),
  ('IAU', 'iShares Gold', 'etf', ARRAY['IAU']),
  ('GDX', 'Gold Miners', 'etf', ARRAY['GDX']),
  ('UUP', 'US Dollar Index', 'etf', ARRAY['UUP']),
  ('TLT', '20+ Year Treasury', 'etf', ARRAY['TLT']),
  ('IEF', '7-10 Year Treasury', 'etf', ARRAY['IEF']),
  ('HG.1', 'Copper Futures', 'commodity', ARRAY['CPER', 'JJC']),
  ('LMT', 'Lockheed Martin', 'equity', ARRAY['LMT']),
  ('XLE', 'Energy Select', 'etf', ARRAY['XLE']),
  ('EURUSD', 'EUR/USD', 'fx', ARRAY['FXE']),
  ('SPX', 'S&P 500', 'equity', ARRAY['SPY'])
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  asset_class = EXCLUDED.asset_class,
  related_etfs = EXCLUDED.related_etfs;

-- =============================================================================
-- Link catalog theses to events
-- =============================================================================

INSERT INTO public.event_thesis_links (event_id, thesis_id, is_primary)
SELECT ce.id, t.id, true
FROM public.theses t
JOIN public.causal_events ce ON ce.slug = 'war-peace-transition'
WHERE t.slug IN ('war-peace-gold-short', 'us-defense-repricing-rtx-lmt')
ON CONFLICT (event_id, thesis_id) DO NOTHING;

INSERT INTO public.event_thesis_links (event_id, thesis_id, is_primary)
SELECT ce.id, t.id, true
FROM public.theses t
JOIN public.causal_events ce ON ce.slug = 'fed-policy-2025'
WHERE t.slug = 'fed-pivot-delayed-tlt-weakness'
ON CONFLICT (event_id, thesis_id) DO NOTHING;

INSERT INTO public.event_thesis_links (event_id, thesis_id, is_primary)
SELECT ce.id, t.id, true
FROM public.theses t
JOIN public.causal_events ce ON ce.slug = 'china-demand-copper'
WHERE t.slug = 'china-stimulus-copper-long'
ON CONFLICT (event_id, thesis_id) DO NOTHING;

UPDATE public.theses t
SET event_id = ce.id
FROM public.causal_events ce
WHERE t.slug IN ('war-peace-gold-short', 'us-defense-repricing-rtx-lmt')
  AND ce.slug = 'war-peace-transition';

UPDATE public.theses t
SET event_id = ce.id
FROM public.causal_events ce
WHERE t.slug = 'fed-pivot-delayed-tlt-weakness'
  AND ce.slug = 'fed-policy-2025';

UPDATE public.theses t
SET event_id = ce.id
FROM public.causal_events ce
WHERE t.slug = 'china-stimulus-copper-long'
  AND ce.slug = 'china-demand-copper';

-- =============================================================================
-- Initial causal affects (gold cluster)
-- =============================================================================

INSERT INTO public.causal_affects (
  thesis_id,
  asset_id,
  direction,
  strength,
  priced_in_percent,
  why_it_matters,
  has_dedicated_thesis
)
SELECT
  t.id,
  ca.id,
  CASE
    WHEN ca.symbol IN ('XAUUSD', 'GC.1', 'GLD', 'IAU', 'GDX') THEN 'down'
    WHEN ca.symbol IN ('UUP', 'EURUSD') THEN 'down'
    ELSE 'neutral'
  END,
  CASE ca.symbol
    WHEN 'XAUUSD' THEN 95
    WHEN 'GC.1' THEN 90
    WHEN 'GLD' THEN 88
    WHEN 'IAU' THEN 72
    WHEN 'GDX' THEN 65
    WHEN 'UUP' THEN 48
    ELSE 35
  END,
  CASE ca.symbol
    WHEN 'XAUUSD' THEN 72
    WHEN 'GC.1' THEN 65
    WHEN 'GLD' THEN 70
    WHEN 'IAU' THEN 34
    WHEN 'GDX' THEN 45
    WHEN 'UUP' THEN 12
    ELSE 50
  END,
  CASE ca.symbol
    WHEN 'XAUUSD' THEN 'Primary trade — war premium in spot'
    WHEN 'GLD' THEN 'ETF flows mirror spot'
    WHEN 'IAU' THEN 'Lower-fee ETF — moderate edge'
    WHEN 'GDX' THEN 'Miners lag spot on peace headlines'
    WHEN 'UUP' THEN 'Haven USD unwind underpriced'
    ELSE 'Indirect risk-sentiment read'
  END,
  false
FROM public.theses t
CROSS JOIN public.causal_assets ca
WHERE t.slug = 'war-peace-gold-short'
  AND ca.symbol IN ('XAUUSD', 'GC.1', 'GLD', 'IAU', 'GDX', 'UUP')
ON CONFLICT (thesis_id, asset_id) DO NOTHING;

INSERT INTO public.causal_affects (thesis_id, asset_id, direction, strength, priced_in_percent, why_it_matters, has_dedicated_thesis)
SELECT
  t.id,
  ca.id,
  CASE WHEN ca.symbol IN ('RTX', 'LMT') THEN 'up' WHEN ca.symbol = 'XLE' THEN 'down' ELSE 'neutral' END,
  CASE ca.symbol WHEN 'RTX' THEN 78 WHEN 'LMT' THEN 70 WHEN 'XLE' THEN 55 ELSE 30 END,
  CASE ca.symbol WHEN 'RTX' THEN 55 WHEN 'LMT' THEN 50 WHEN 'XLE' THEN 38 ELSE 45 END,
  CASE ca.symbol
    WHEN 'RTX' THEN 'Defense bid on budget clarity'
    WHEN 'XLE' THEN 'Oil risk premium fades with ceasefire path'
    ELSE 'Secondary read'
  END,
  false
FROM public.theses t
CROSS JOIN public.causal_assets ca
WHERE t.slug = 'us-defense-repricing-rtx-lmt'
  AND ca.symbol IN ('RTX', 'LMT', 'XLE')
ON CONFLICT (thesis_id, asset_id) DO NOTHING;

INSERT INTO public.causal_affects (thesis_id, asset_id, direction, strength, priced_in_percent, why_it_matters, has_dedicated_thesis, thesis_slug)
SELECT
  t.id,
  ca.id,
  'down',
  CASE ca.symbol WHEN 'TLT' THEN 90 WHEN 'IEF' THEN 75 ELSE 40 END,
  CASE ca.symbol WHEN 'TLT' THEN 67 WHEN 'IEF' THEN 55 ELSE 40 END,
  CASE ca.symbol WHEN 'TLT' THEN 'Duration expression of delayed cuts' ELSE 'Rates complex' END,
  ca.symbol = 'TLT',
  CASE WHEN ca.symbol = 'TLT' THEN t.slug ELSE NULL END
FROM public.theses t
CROSS JOIN public.causal_assets ca
WHERE t.slug = 'fed-pivot-delayed-tlt-weakness'
  AND ca.symbol IN ('TLT', 'IEF', 'XAUUSD')
ON CONFLICT (thesis_id, asset_id) DO NOTHING;

INSERT INTO public.causal_affects (thesis_id, asset_id, direction, strength, priced_in_percent, why_it_matters, has_dedicated_thesis, thesis_slug)
SELECT
  t.id,
  ca.id,
  'up',
  CASE ca.symbol WHEN 'HG.1' THEN 92 ELSE 60 END,
  CASE ca.symbol WHEN 'HG.1' THEN 48 ELSE 44 END,
  CASE ca.symbol WHEN 'HG.1' THEN 'Primary copper expression' ELSE 'Industrial beta' END,
  ca.symbol = 'HG.1',
  CASE WHEN ca.symbol = 'HG.1' THEN t.slug ELSE NULL END
FROM public.theses t
CROSS JOIN public.causal_assets ca
WHERE t.slug = 'china-stimulus-copper-long'
  AND ca.symbol IN ('HG.1', 'SPX')
ON CONFLICT (thesis_id, asset_id) DO NOTHING;

-- Cross-thesis: gold short vs defense long (portfolio tension)
INSERT INTO public.thesis_relations (from_thesis_id, to_thesis_id, relation_type)
SELECT t1.id, t2.id, 'contradicts'
FROM public.theses t1
JOIN public.theses t2 ON t2.slug = 'us-defense-repricing-rtx-lmt'
WHERE t1.slug = 'war-peace-gold-short'
ON CONFLICT (from_thesis_id, to_thesis_id, relation_type) DO NOTHING;

INSERT INTO public.thesis_relations (from_thesis_id, to_thesis_id, relation_type)
SELECT t1.id, t2.id, 'shares_event'
FROM public.theses t1
JOIN public.theses t2 ON t2.slug = 'us-defense-repricing-rtx-lmt'
WHERE t1.slug = 'war-peace-gold-short'
ON CONFLICT (from_thesis_id, to_thesis_id, relation_type) DO NOTHING;

-- =============================================================================
-- RLS (read-only for app)
-- =============================================================================

ALTER TABLE public.causal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.causal_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.causal_affects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thesis_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_thesis_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read causal_events" ON public.causal_events;
CREATE POLICY "Public read causal_events"
  ON public.causal_events FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read causal_assets" ON public.causal_assets;
CREATE POLICY "Public read causal_assets"
  ON public.causal_assets FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read causal_affects" ON public.causal_affects;
CREATE POLICY "Public read causal_affects"
  ON public.causal_affects FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read thesis_relations" ON public.thesis_relations;
CREATE POLICY "Public read thesis_relations"
  ON public.thesis_relations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read event_thesis_links" ON public.event_thesis_links;
CREATE POLICY "Public read event_thesis_links"
  ON public.event_thesis_links FOR SELECT TO anon, authenticated USING (true);
