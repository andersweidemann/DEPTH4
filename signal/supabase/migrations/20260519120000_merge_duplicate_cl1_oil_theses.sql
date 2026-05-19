-- Merge duplicate CL.1 / WTI short (down) pipeline theses: keep highest mispricing edge, drop the rest.

WITH oil_short AS (
  SELECT
    t.id,
    t.slug,
    t.body,
    t.created_at,
    COALESCE(
      (
        SELECT MAX(ca.mispricing_score)
        FROM public.causal_affects ca
        WHERE ca.thesis_id = t.id
          AND ca.has_dedicated_thesis = true
      ),
      (t.body->>'conviction')::numeric,
      t.quality_score,
      0
    ) AS edge_score
  FROM public.theses t
  WHERE t.status IN ('forming', 'watching', 'ready', 'active')
    AND lower(coalesce(t.body->>'direction', '')) IN ('down', 'short')
    AND (
      upper(coalesce(t.body->>'target_asset', '')) IN ('CL.1', 'CL', 'WTI', 'USO', 'USOIL')
      OR lower(t.title) ~ '(wti|crude|cl\.1|oil).*(ceasefire|peace|de-escalat|risk premium)'
      OR t.slug = 'shorting-wti-crude-ceasefire-framework-deflates-middle-east-risk-premium'
    )
),
ranked AS (
  SELECT
    id,
    slug,
    body,
    edge_score,
    ROW_NUMBER() OVER (ORDER BY edge_score DESC, created_at DESC) AS rn
  FROM oil_short
),
keeper AS (
  SELECT id AS keeper_id, body AS keeper_body
  FROM ranked
  WHERE rn = 1
),
dupes AS (
  SELECT d.id AS dupe_id, d.body AS dupe_body, k.keeper_id, k.keeper_body
  FROM ranked d
  CROSS JOIN keeper k
  WHERE d.rn > 1
),
merged_evidence AS (
  SELECT
    dupe_id,
    keeper_id,
    (
      SELECT jsonb_agg(DISTINCT elem)
      FROM (
        SELECT jsonb_array_elements(COALESCE(keeper_body->'evidence', '[]'::jsonb)) AS elem
        UNION ALL
        SELECT jsonb_array_elements(COALESCE(dupe_body->'evidence', '[]'::jsonb)) AS elem
      ) s
    ) AS evidence
  FROM dupes
)
UPDATE public.theses t
SET
  body = jsonb_set(COALESCE(t.body, '{}'::jsonb), '{evidence}', m.evidence, true),
  updated_at = now(),
  last_refreshed_at = now()
FROM merged_evidence m
WHERE t.id = m.keeper_id
  AND m.evidence IS NOT NULL;

DELETE FROM public.theses
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY edge_score DESC, created_at DESC) AS rn
    FROM (
      SELECT
        t.id,
        t.created_at,
        COALESCE(
          (
            SELECT MAX(ca.mispricing_score)
            FROM public.causal_affects ca
            WHERE ca.thesis_id = t.id
              AND ca.has_dedicated_thesis = true
          ),
          (t.body->>'conviction')::numeric,
          t.quality_score,
          0
        ) AS edge_score
      FROM public.theses t
      WHERE t.status IN ('forming', 'watching', 'ready', 'active')
        AND lower(coalesce(t.body->>'direction', '')) IN ('down', 'short')
        AND (
          upper(coalesce(t.body->>'target_asset', '')) IN ('CL.1', 'CL', 'WTI', 'USO', 'USOIL')
          OR lower(t.title) ~ '(wti|crude|cl\.1|oil).*(ceasefire|peace|de-escalat|risk premium)'
          OR t.slug = 'shorting-wti-crude-ceasefire-framework-deflates-middle-east-risk-premium'
        )
    ) oil_short
  ) ranked
  WHERE rn > 1
);
