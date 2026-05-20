-- QUICK WINS: idempotent archive cleanup + non-user quality-0 gate + oil thesis compliance copy.

-- 1) Archive duplicate oil theses (keep CL.1 ceasefire-framework canonical row).
UPDATE public.theses
SET
  status = 'archived',
  lifecycle_state = 'archived',
  archive_reason = 'superseded_by_higher_quality_thesis',
  archived_at = COALESCE(archived_at, NOW()),
  updated_at = NOW()
WHERE slug IN (
  'strait-hormuz-oil-long',
  'opec-unity-fracturing',
  'iran-escalation-under-trump-lifts-oil-defense-pressures-risk-assets-jadl'
)
  AND status IN ('forming', 'watching', 'ready', 'active');

-- 2) Archive seeded/AI junk only — never auto-archive user-created rows.
UPDATE public.theses
SET
  status = 'archived',
  lifecycle_state = 'archived',
  archive_reason = 'insufficient_quality_for_display',
  archived_at = COALESCE(archived_at, NOW()),
  updated_at = NOW()
WHERE quality_score = 0
  AND thesis_origin IS DISTINCT FROM 'user'
  AND (body IS NULL OR body = '{}'::jsonb)
  AND status IN ('forming', 'watching', 'ready', 'active');

-- 3) Probabilistic framing on canonical oil thesis slugs (research hypothesis, not advice).
UPDATE public.theses
SET
  title = regexp_replace(
    title,
    'We are initiating a short position in',
    'This thesis suggests a potential downside bias in',
    'gi'
  ),
  body = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(body, '{}'::jsonb),
          '{thesis_statement}',
          to_jsonb(
            regexp_replace(
              coalesce(body->>'thesis_statement', title, ''),
              'We are initiating a short',
              'This thesis suggests a potential downside bias in',
              'gi'
            )
          )
        ),
        '{summary}',
        to_jsonb(
          regexp_replace(
            coalesce(body->>'summary', ''),
            'We are initiating a short position in',
            'This thesis suggests a potential downside bias in',
            'gi'
          )
        )
      ),
      '{market_misread}',
      to_jsonb(
        regexp_replace(
          coalesce(body->>'market_misread', ''),
          'We are initiating a short',
          'The market may still be overpricing',
          'gi'
        )
      )
    ),
    '{trade}',
    to_jsonb(
      regexp_replace(
        coalesce(body->>'trade', ''),
        'Short CL\.1',
        'Potential downside bias in CL.1',
        'gi'
      )
    )
  ),
  updated_at = NOW()
WHERE (
    slug IN ('shorting-wti-crude-ceasefire-framework-defla-c96389a4')
    OR slug LIKE 'crude-oil-short-peace-premium-deflation%'
  )
  AND thesis_origin IN ('seeded_system', 'ai_generated')
  AND (
    title ~* 'we are initiating'
    OR coalesce(body->>'thesis_statement', '') ~* 'we are initiating'
    OR coalesce(body->>'summary', '') ~* 'we are initiating'
    OR coalesce(body->>'trade', '') ~* 'short cl'
  );
