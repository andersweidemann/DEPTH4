-- 4×4 causal matrix: time_depth × asset_depth on causal_affects

ALTER TABLE public.causal_affects
  ADD COLUMN IF NOT EXISTS time_depth text
  CHECK (time_depth IN ('L1_confirmed', 'L2_this_week', 'L3_this_month', 'L4_this_quarter'));

ALTER TABLE public.causal_affects
  ADD COLUMN IF NOT EXISTS asset_depth text
  CHECK (asset_depth IN ('root', 'direct', 'indirect', 'speculative'));

-- Backfill time_depth from thesis horizon (body JSON)
UPDATE public.causal_affects ca
SET time_depth = CASE
  WHEN coalesce(t.body->>'horizon', '') ILIKE '%day%'
    OR coalesce(t.body->>'horizon', '') ILIKE '%now%'
    OR coalesce(t.body->>'horizon', '') ILIKE '%immediate%' THEN 'L1_confirmed'
  WHEN coalesce(t.body->>'horizon', '') ILIKE '%week%' THEN 'L2_this_week'
  WHEN coalesce(t.body->>'horizon', '') ILIKE '%month%' THEN 'L3_this_month'
  WHEN coalesce(t.body->>'horizon', '') ILIKE '%quarter%'
    OR coalesce(t.body->>'horizon', '') ILIKE '%year%' THEN 'L4_this_quarter'
  ELSE 'L2_this_week'
END
FROM public.theses t
WHERE ca.thesis_id = t.id
  AND ca.time_depth IS NULL;

UPDATE public.causal_affects
SET asset_depth = CASE
  WHEN strength >= 70 THEN 'direct'
  WHEN strength >= 30 THEN 'indirect'
  ELSE 'speculative'
END
WHERE asset_depth IS NULL;

WITH strongest AS (
  SELECT DISTINCT ON (thesis_id) thesis_id, asset_id
  FROM public.causal_affects
  ORDER BY thesis_id, strength DESC
)
UPDATE public.causal_affects ca
SET asset_depth = 'root'
FROM strongest s
WHERE ca.thesis_id = s.thesis_id
  AND ca.asset_id = s.asset_id;
