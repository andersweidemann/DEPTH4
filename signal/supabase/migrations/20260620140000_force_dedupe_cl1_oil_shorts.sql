-- Force-remove duplicate live CL.1 / WTI peace-premium SHORT theses (broader than 20260619130000).
-- Run in Supabase SQL editor if map still shows two oil shorts after prior migration.
--
-- Diagnostic (expect 2 rows before, 1 after):
--   select slug, status, thesis_origin, body->>'direction' as dir, body->>'target_asset' as asset
--   from public.theses
--   where status in ('forming','watching','ready','active')
--     and lower(coalesce(body->>'direction','')) in ('down','short')
--     and (slug ilike '%crude-oil%' or slug ilike '%shorting-wti%' or slug ilike '%peace-premium%'
--          or lower(title) ~ '(wti|crude|cl\.1).*(peace|ceasefire|premium|de-escalat)');

WITH oil_short AS (
  SELECT
    t.id,
    t.slug,
    t.created_at,
    COALESCE(
      (
        SELECT MAX(ca.mispricing_score)
        FROM public.causal_affects ca
        WHERE ca.thesis_id = t.id
          AND ca.has_dedicated_thesis = true
      ),
      t.quality_score,
      (t.body->>'conviction')::numeric,
      0
    ) AS edge_score
  FROM public.theses t
  WHERE t.status IN ('forming', 'watching', 'ready', 'active')
    AND lower(coalesce(t.body->>'direction', '')) IN ('down', 'short')
    AND (
      upper(coalesce(t.body->>'target_asset', t.body->>'asset', '')) IN ('CL.1', 'CL', 'WTI', 'USO', 'USOIL')
      OR t.slug ILIKE '%crude-oil%'
      OR t.slug ILIKE '%shorting-wti%'
      OR t.slug ILIKE '%peace-premium%'
      OR lower(t.title) ~ '(wti|crude|cl\.1|oil).*(peace|ceasefire|premium|de-escalat|risk premium)'
    )
),
ranked AS (
  SELECT id, slug, edge_score, ROW_NUMBER() OVER (ORDER BY edge_score DESC, created_at DESC) AS rn
  FROM oil_short
)
DELETE FROM public.theses
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
