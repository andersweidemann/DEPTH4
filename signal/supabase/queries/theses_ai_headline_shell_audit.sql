-- Audit: ai_generated titles that look like IR / headline shells (VISION.md — not DEPTH4 theses).
-- Run in Supabase SQL editor; review ids before DELETE.
-- Complements theses_ai_junk_registry_audit.sql (earnings-call transcript patterns).

SELECT id,
       slug,
       left(title, 140) AS title_preview,
       status,
       created_at,
       updated_at
FROM public.theses
WHERE thesis_origin = 'ai_generated'
  AND (
    title ~* 'Fair Value|Near Fair Value|Long-Term Targets|On Track|PT raised|price target'
    OR title ~* 'Good Earnings|Strong Earnings|Earnings Beat|Earnings And Growth|Aggressive Campaign|We May Be Going|Shares Near'
  )
ORDER BY updated_at DESC
LIMIT 200;
