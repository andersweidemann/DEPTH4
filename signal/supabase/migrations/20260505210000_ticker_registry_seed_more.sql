-- Expand ticker_registry with curated US/EU/Sweden instruments (quality-first).

INSERT INTO public.ticker_registry (
  symbol, display_name, short_name, asset_class, sector, region, themes, keywords, correlated, notes
) VALUES

-- CRYPTO (spot + proxies)
(
  'BTCUSD', 'Bitcoin / US Dollar', 'Bitcoin',
  'crypto', NULL, 'global',
  ARRAY['bitcoin','crypto','risk','liquidity','USD','rates'],
  ARRAY['bitcoin','BTC','crypto','ETF inflows','halving','hashrate','miners','SEC','stablecoin','risk-on','risk-off','liquidity','real yields'],
  ARRAY['IBIT','GBTC','COIN','MSTR','QQQ'],
  'Bitcoin is a high-beta liquidity asset. Sensitive to USD liquidity, real yields, and risk sentiment; can act as a risk proxy.'
),
(
  'ETHUSD', 'Ethereum / US Dollar', 'Ethereum',
  'crypto', NULL, 'global',
  ARRAY['ethereum','crypto','risk','liquidity','USD','rates'],
  ARRAY['ethereum','ETH','crypto','staking','layer 2','SEC','ETF','risk-on','liquidity','real yields'],
  ARRAY['BTCUSD','COIN','QQQ'],
  'Ethereum is a high-beta crypto asset with protocol-specific catalysts (staking, scaling, regulation) plus broad liquidity sensitivity.'
),
(
  'COIN', 'Coinbase Global Inc', 'Coinbase',
  'equity', 'financials', 'us',
  ARRAY['crypto','broker','trading volumes','regulation','risk'],
  ARRAY['Coinbase','COIN','crypto exchange','spot volumes','ETF flows','SEC','regulation','bitcoin','ethereum'],
  ARRAY['BTCUSD','ETHUSD','MSTR'],
  'Crypto brokerage equity proxy. Benefits from higher crypto prices and trading activity; sensitive to regulatory headlines.'
),
(
  'MSTR', 'MicroStrategy Inc', 'MicroStrategy',
  'equity', 'technology', 'us',
  ARRAY['bitcoin proxy','crypto','leverage','risk'],
  ARRAY['MicroStrategy','MSTR','bitcoin holdings','BTC proxy','convertible','leverage','crypto'],
  ARRAY['BTCUSD','IBIT','GBTC'],
  'Levered BTC proxy via corporate holdings/financing. Amplifies BTC moves and is sensitive to funding/volatility.'
),
(
  'IBIT', 'iShares Bitcoin Trust', 'Bitcoin ETF',
  'etf', NULL, 'us',
  ARRAY['bitcoin','crypto','ETF flows','risk'],
  ARRAY['Bitcoin ETF','IBIT','ETF inflows','ETF outflows','bitcoin','BTC'],
  ARRAY['BTCUSD','GBTC','COIN','MSTR'],
  'US-listed spot bitcoin ETF. Flow headlines and risk sentiment are key drivers.'
),
(
  'GBTC', 'Grayscale Bitcoin Trust', 'Bitcoin Trust',
  'etf', NULL, 'us',
  ARRAY['bitcoin','crypto','ETF flows','risk'],
  ARRAY['GBTC','Grayscale','bitcoin trust','ETF flows','discount','premium','bitcoin','BTC'],
  ARRAY['BTCUSD','IBIT','COIN','MSTR'],
  'Bitcoin trust/ETF proxy. Sensitive to flow and structure headlines as well as spot BTC.'
),

-- FX (major pairs + EM proxy)
(
  'EURUSD', 'Euro / US Dollar', 'EURUSD',
  'forex', NULL, 'eu',
  ARRAY['FX','EUR','USD','rates','ECB','Fed'],
  ARRAY['EURUSD','euro','EUR','dollar','USD','ECB','Fed','rate differential','inflation','PMI'],
  ARRAY['DXY','UUP','SPY'],
  'EURUSD reflects relative growth/inflation and ECB vs Fed pricing. Moves on macro surprises and rate differentials.'
),
(
  'USDJPY', 'US Dollar / Japanese Yen', 'USDJPY',
  'forex', NULL, 'global',
  ARRAY['FX','JPY','USD','rates','carry','risk'],
  ARRAY['USDJPY','yen','JPY','Bank of Japan','BOJ','yield curve control','carry trade','intervention','rate differential'],
  ARRAY['DXY','US10Y','TLT'],
  'USDJPY is a global rates/carry barometer. Sensitive to US yields, BOJ policy shifts, and risk-off episodes.'
),
(
  'GBPUSD', 'British Pound / US Dollar', 'GBPUSD',
  'forex', NULL, 'eu',
  ARRAY['FX','GBP','USD','rates','BoE','Fed'],
  ARRAY['GBPUSD','pound','GBP','BoE','Bank of England','Fed','rate differential','inflation','wages'],
  ARRAY['DXY','UUP'],
  'GBPUSD moves on UK vs US rate expectations and UK macro surprises; also reacts to risk sentiment.'
),
(
  'USDCNH', 'US Dollar / Chinese Yuan (offshore)', 'USDCNH',
  'forex', NULL, 'em',
  ARRAY['FX','China','USD','growth','risk'],
  ARRAY['USDCNH','yuan','CNY','CNH','PBoC','China','capital controls','trade','tariffs','stimulus'],
  ARRAY['EEM','FXI','UUP'],
  'USDCNH is a China growth/risk gauge. Moves on PBoC signaling, trade/tariff risk, and capital flow headlines.'
),

-- RATES / CREDIT (proxies)
(
  'IEF', 'iShares 7-10 Year Treasury ETF', 'Mid Treasuries',
  'etf', NULL, 'us',
  ARRAY['bonds','rates','Fed','duration','macro'],
  ARRAY['Treasury','yields','Fed','interest rates','inflation','CPI','jobs','duration'],
  ARRAY['TLT','SHY','SPY'],
  'Intermediate Treasury ETF. Moves with rates expectations; less convexity than TLT.'
),
(
  'SHY', 'iShares 1-3 Year Treasury ETF', 'Short Treasuries',
  'etf', NULL, 'us',
  ARRAY['bonds','rates','Fed','cash proxy'],
  ARRAY['Treasury','front-end','Fed','rate hike','rate cut','yields','money market'],
  ARRAY['IEF','TLT'],
  'Front-end Treasury proxy. Anchored to Fed policy expectations.'
),
(
  'HYG', 'iShares iBoxx High Yield Corporate Bond ETF', 'High Yield',
  'etf', NULL, 'us',
  ARRAY['credit','risk','spreads','recession'],
  ARRAY['high yield','junk bonds','credit spreads','defaults','risk-off','recession','rates'],
  ARRAY['SPY','LQD'],
  'High yield credit risk proxy. Worsens on recession risk and spread widening; improves on risk-on and easing.'
),
(
  'LQD', 'iShares iBoxx Investment Grade Corporate Bond ETF', 'IG Credit',
  'etf', NULL, 'us',
  ARRAY['credit','rates','spreads','duration'],
  ARRAY['investment grade','corporate bonds','credit spreads','rates','duration'],
  ARRAY['IEF','HYG'],
  'Investment grade credit + duration proxy. Sensitive to both rates and spread risk.'
),

-- COMMODITIES (macro staples)
(
  'XAGUSD', 'Silver / US Dollar', 'Silver',
  'commodity', NULL, 'global',
  ARRAY['silver','precious metals','inflation','USD','risk'],
  ARRAY['silver','XAG','precious metals','industrial demand','safe haven','inflation','dollar'],
  ARRAY['SLV','XAUUSD','GLD'],
  'Silver mixes precious metal + industrial demand. Sensitive to USD, real yields, and manufacturing cycle.'
),
(
  'NATGAS', 'US Natural Gas', 'Natural Gas',
  'commodity', 'energy', 'us',
  ARRAY['gas','energy','weather','LNG','inflation'],
  ARRAY['natural gas','Henry Hub','LNG','storage','weather','pipeline','energy','power prices'],
  ARRAY['UNG','XLE'],
  'Natural gas is weather/storage sensitive and reacts to LNG export capacity and pipeline disruptions.'
),
(
  'COPPER', 'Copper', 'Copper',
  'commodity', NULL, 'global',
  ARRAY['copper','China','growth','industrials','energy transition'],
  ARRAY['copper','Dr. Copper','China','construction','PMI','industrial metals','energy transition'],
  ARRAY['HG','FCX','EEM'],
  'Copper is a global growth/China cycle bellwether and a key input for electrification/energy transition.'
),

-- US MACRO ETFs / SECTORS
(
  'QQQ', 'Nasdaq-100 ETF', 'Nasdaq 100',
  'etf', NULL, 'us',
  ARRAY['equities','US market','tech','rates','growth'],
  ARRAY['Nasdaq','QQQ','mega-cap tech','AI','semiconductors','rates','real yields','growth stocks'],
  ARRAY['SPY','XLK','SOXX'],
  'Growth/tech-heavy US equity proxy. Sensitive to rate moves and risk sentiment.'
),
(
  'IWM', 'Russell 2000 ETF', 'US Small Caps',
  'etf', NULL, 'us',
  ARRAY['equities','US market','small caps','rates','growth'],
  ARRAY['Russell 2000','IWM','small caps','US economy','rates','financial conditions'],
  ARRAY['SPY','TLT'],
  'Small-cap proxy. More domestic and credit-sensitive than SPY; reacts to growth and funding conditions.'
),
(
  'XLF', 'Financial Select Sector SPDR', 'Financials ETF',
  'etf', 'financials', 'us',
  ARRAY['financials','banks','rates','credit'],
  ARRAY['banks','financials','net interest margin','yields','credit losses','stress tests'],
  ARRAY['KBE','SPY'],
  'US financials sector proxy. Benefits from steeper curves and strong credit; hurt by stress and funding shocks.'
),
(
  'XLK', 'Technology Select Sector SPDR', 'Tech ETF',
  'etf', 'technology', 'us',
  ARRAY['technology','rates','growth','AI'],
  ARRAY['technology','XLK','software','hardware','AI','semiconductors','rates','real yields'],
  ARRAY['QQQ','SOXX','SPY'],
  'US tech sector ETF. Sensitive to rates and tech cycle; key for AI/semis headlines.'
),
(
  'XLV', 'Health Care Select Sector SPDR', 'Healthcare ETF',
  'etf', 'healthcare', 'us',
  ARRAY['healthcare','defensives','policy'],
  ARRAY['healthcare','XLV','FDA','drug pricing','Medicare','defensive'],
  ARRAY['SPY'],
  'US healthcare sector ETF. Often defensive; sensitive to policy, FDA, and reimbursement headlines.'
),
(
  'XLI', 'Industrial Select Sector SPDR', 'Industrials ETF',
  'etf', 'industrials', 'us',
  ARRAY['industrials','growth','capex','defense-adjacent'],
  ARRAY['industrials','XLI','capex','PMI','aerospace','defense','infrastructure'],
  ARRAY['SPY'],
  'US industrials sector ETF. Sensitive to growth, capex, and infrastructure/defense demand.'
),

-- EU / SWEDEN (high-leverage large caps)
(
  'SAND', 'Sandvik AB', 'Sandvik',
  'equity', 'industrials', 'eu',
  ARRAY['industrials','Sweden','mining','manufacturing','China'],
  ARRAY['Sandvik','mining equipment','machining','manufacturing','Sweden','Nordics','China PMI'],
  ARRAY['ALFA','EPIROC','ABB'],
  'Swedish industrial exposed to mining/manufacturing cycle; sensitive to China/global PMI and capex.'
),
(
  'ERIC', 'Ericsson AB', 'Ericsson',
  'equity', 'technology', 'eu',
  ARRAY['telecom','5G','Sweden','defense-adjacent','US-China'],
  ARRAY['Ericsson','5G','telecom equipment','network','Sweden','NATO','US-China'],
  ARRAY['NOKIA','QQQ'],
  'Telecom equipment cyclical. Sensitive to carrier capex, geopolitics (network security), and FX.'
),
(
  'ABB', 'ABB Ltd', 'ABB',
  'equity', 'industrials', 'eu',
  ARRAY['industrials','automation','energy transition','EU'],
  ARRAY['ABB','automation','electrification','industrial','EU','capex','energy transition'],
  ARRAY['ALFA','SAND'],
  'European automation/electrification leader. Exposed to industrial capex and energy transition spending.'
),
(
  'NDA-SE', 'Nordea Bank Abp', 'Nordea',
  'equity', 'financials', 'eu',
  ARRAY['banks','Nordics','rates','credit'],
  ARRAY['Nordea','bank','Nordics','rates','credit losses','stress'],
  ARRAY['XLF','SPY'],
  'Nordic bank sensitive to rates and credit cycle; reacts to regulatory and macro risk.'
)

ON CONFLICT (symbol) DO NOTHING;

