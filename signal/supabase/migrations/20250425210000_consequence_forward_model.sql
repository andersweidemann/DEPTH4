-- Serial forward "transmission" chain + early indicators for DEPTH4 (ahead of the market)
ALTER TABLE public.consequence_trees
  ADD COLUMN IF NOT EXISTS forward_model jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.consequence_trees.forward_model IS
  'transmission_chain (4 plies), early_lead_indicators, forward_horizon_summary — from consequence LLM';
