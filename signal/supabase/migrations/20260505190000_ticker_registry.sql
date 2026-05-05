-- Ticker registry for instrument metadata + news matching

CREATE TABLE IF NOT EXISTS public.ticker_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  display_name text NOT NULL,
  short_name text NOT NULL,
  asset_class text NOT NULL CHECK (
    asset_class IN ('commodity', 'equity', 'etf', 'forex', 'bond', 'index', 'crypto')
  ),
  sector text,
  region text,
  themes text[],
  keywords text[],
  correlated text[],
  notes text
);

CREATE INDEX IF NOT EXISTS idx_ticker_registry_symbol ON public.ticker_registry (symbol);

ALTER TABLE public.ticker_registry ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users. Writes are handled via service role (RLS bypass) / migrations.
DROP POLICY IF EXISTS "Ticker registry read" ON public.ticker_registry;
CREATE POLICY "Ticker registry read" ON public.ticker_registry
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seed common instruments (id uses DEFAULT).
INSERT INTO public.ticker_registry (
  symbol, display_name, short_name, asset_class, sector, region, themes, keywords, correlated, notes
) VALUES
(
  'XAUUSD', 'Gold / US Dollar', 'Gold',
  'commodity', NULL, 'global',
  ARRAY['gold','safe-haven','inflation','USD','commodities','geopolitical'],
  ARRAY['gold','bullion','XAU','precious metals','safe haven','Federal Reserve','inflation','dollar weakness','Middle East','Iran','war','conflict','rate cut'],
  ARRAY['GLD','IAU','SLV','TLT','UUP'],
  'Safe-haven commodity. Rises on geopolitical risk, USD weakness, inflation expectations, and Fed dovishness.'
),
(
  'GLD', 'SPDR Gold Shares ETF', 'Gold ETF',
  'etf', NULL, 'us',
  ARRAY['gold','safe-haven','inflation','commodities'],
  ARRAY['gold','bullion','XAU','precious metals','safe haven','inflation','dollar'],
  ARRAY['XAUUSD','IAU','SLV','TLT'],
  'ETF tracking gold spot price. Same drivers as XAUUSD.'
),
(
  'USOIL', 'WTI Crude Oil', 'Crude Oil',
  'commodity', 'energy', 'global',
  ARRAY['oil','energy','OPEC','Iran','Middle East','inflation','USD'],
  ARRAY['oil','crude','WTI','Brent','OPEC','Iran','Saudi Arabia','tanker','Strait of Hormuz','pipeline','energy','petroleum','refinery'],
  ARRAY['XLE','CVX','XOM','USO','BNO'],
  'WTI crude oil. Highly sensitive to Middle East geopolitics, OPEC decisions, and USD strength.'
),
(
  'XLE', 'Energy Select Sector SPDR', 'Energy ETF',
  'etf', 'energy', 'us',
  ARRAY['energy','oil','gas','commodities'],
  ARRAY['oil','energy','crude','OPEC','pipeline','refinery','Exxon','Chevron','ConocoPhillips'],
  ARRAY['USOIL','CVX','XOM','COP','USO'],
  'US energy sector ETF. Tracks oil majors. Moves with crude prices and energy policy.'
),
(
  'SPY', 'S&P 500 ETF', 'S&P 500',
  'etf', NULL, 'us',
  ARRAY['equities','US market','macro','Fed','recession','growth'],
  ARRAY['S&P 500','Fed','interest rates','GDP','recession','earnings','tariff','trade war','US economy','inflation'],
  ARRAY['QQQ','IWM','VTI','TLT'],
  'Broad US equity market. Affected by macro conditions, Fed policy, earnings, and geopolitical risk appetite.'
),
(
  'TLT', 'iShares 20+ Year Treasury ETF', 'Long Bonds',
  'etf', NULL, 'us',
  ARRAY['bonds','rates','Fed','safe-haven','recession','duration'],
  ARRAY['Treasury','Fed','interest rates','yield','recession','inflation','rate cut','rate hike','safe haven'],
  ARRAY['SPY','GLD','UUP','IEF'],
  'Long-duration US Treasury ETF. Rises on rate cut expectations, recession fears, and safe-haven demand.'
),
(
  'UUP', 'Invesco DB US Dollar Index', 'US Dollar',
  'etf', NULL, 'us',
  ARRAY['USD','forex','Fed','macro','safe-haven'],
  ARRAY['dollar','USD','Fed','rate hike','DXY','currency','forex','reserve currency'],
  ARRAY['GLD','XAUUSD','TLT','EEM'],
  'US Dollar index ETF. Rises on Fed hawkishness and risk-off sentiment.'
),
(
  'EEM', 'iShares MSCI Emerging Markets ETF', 'Emerging Markets',
  'etf', NULL, 'em',
  ARRAY['emerging markets','EM','USD','China','commodities','risk'],
  ARRAY['emerging markets','China','Brazil','India','dollar','commodity','EM','tariff','trade','geopolitical'],
  ARRAY['SPY','UUP','FXI','EWZ'],
  'Broad EM equity ETF. Hurt by USD strength, US tariffs, and risk-off. Benefits from commodity booms and dollar weakness.'
),
(
  'ALFA', 'Alfa Laval AB', 'Alfa Laval',
  'equity', 'industrials', 'eu',
  ARRAY['industrials','Sweden','heat transfer','energy','marine','defense-adjacent'],
  ARRAY['Alfa Laval','heat exchanger','marine','energy efficiency','industrial','Sweden','Nordics','OMXS'],
  ARRAY['SAND','EPIROC','ABB'],
  'Swedish industrial company. Heat transfer, fluid handling, separation. Exposed to energy transition, marine shipping, and industrial capex cycles.'
)
ON CONFLICT (symbol) DO NOTHING;

