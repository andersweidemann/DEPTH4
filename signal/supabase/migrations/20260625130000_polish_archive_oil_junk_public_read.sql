-- POLISH: archive duplicate oil + junk theses, public anon read, CL.1 compliance copy, archived_at.

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.theses.archived_at IS
  'Wall clock when the row was moved to status=archived (surfacing cleanup, dedupe, quality gate).';

-- 1) Archive duplicate oil theses (keep CL.1 / ceasefire-framework canonical row).
UPDATE public.theses
SET
  status = 'archived',
  lifecycle_state = 'archived',
  archive_reason = 'superseded_by_better_thesis',
  archived_at = NOW(),
  updated_at = NOW()
WHERE slug IN (
  'strait-hormuz-oil-long',
  'opec-unity-fracturing',
  'iran-escalation-under-trump-lifts-oil-defense-pressures-risk-assets-jadl'
)
  AND status IN ('forming', 'watching', 'ready', 'active');

-- 2) Archive junk 0-quality empty-body theses.
UPDATE public.theses
SET
  status = 'archived',
  lifecycle_state = 'archived',
  archive_reason = 'insufficient_quality',
  archived_at = NOW(),
  updated_at = NOW()
WHERE quality_score = 0
  AND (body IS NULL OR body = '{}'::jsonb)
  AND status IN ('forming', 'watching', 'ready', 'active');

-- 3) Catalog CL.1 ceasefire oil thesis — probabilistic research framing (not user rows).
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
        'Short CL.1',
        'Potential downside bias in CL.1',
        'gi'
      )
    )
  ),
  updated_at = NOW()
WHERE slug LIKE 'crude-oil-short-peace-premium-deflation%'
  AND thesis_origin IN ('seeded_system', 'ai_generated')
  AND (
    title ~* 'we are initiating'
    OR coalesce(body->>'thesis_statement', '') ~* 'we are initiating'
    OR coalesce(body->>'summary', '') ~* 'we are initiating'
  );

-- 4) Public workspace read: anon may load live catalog + AI theses and their evidence log.
DROP POLICY IF EXISTS "Anon can read live public theses" ON public.theses;
CREATE POLICY "Anon can read live public theses"
  ON public.theses
  FOR SELECT
  TO anon
  USING (
    thesis_origin IN ('seeded_system', 'ai_generated')
    AND status IN ('ready', 'watching', 'active', 'resolved', 'invalidated', 'archived')
  );

DROP POLICY IF EXISTS "Anon can read evidence log for public theses" ON public.thesis_evidence_log;
CREATE POLICY "Anon can read evidence log for public theses"
  ON public.thesis_evidence_log
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.theses t
      WHERE t.id::text = thesis_evidence_log.thesis_id::text
        AND t.thesis_origin IN ('seeded_system', 'ai_generated')
    )
  );
