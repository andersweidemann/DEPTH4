-- Remove duplicate AI-generated CL.1 short thesis; keep crude-oil-short-peace-premium-deflation (higher edge).

DELETE FROM public.theses
WHERE slug = 'shorting-wti-crude-ceasefire-framework-deflates-middle-east-risk-premium'
  AND lower(coalesce(body->>'direction', '')) IN ('down', 'short')
  AND (
    upper(coalesce(body->>'target_asset', '')) IN ('CL.1', 'CL', 'WTI', 'USO', 'USOIL')
    OR lower(title) ~ '(wti|crude|cl\.1|oil).*(ceasefire|peace|de-escalat|risk premium)'
  )
  AND thesis_origin = 'ai_generated'
  AND EXISTS (
    SELECT 1
    FROM public.theses keeper
    WHERE keeper.slug LIKE 'crude-oil-short-peace-premium-deflation%'
      AND keeper.id <> public.theses.id
  );
