-- Audit: ai_generated rows whose hero/title still looks like ingest (transcript / deck / call), not a DEPTH4 thesis.
-- Run in Supabase SQL editor; review ids before any delete.
SELECT
  count(*) AS polluted_ai_theses,
  count(*) FILTER (WHERE status = 'forming') AS polluted_forming
FROM public.theses
WHERE thesis_origin = 'ai_generated'
  AND (
    title ~* '(earnings[[:space:]]+call|transcript|slideshow|presents[[:space:]]+at|webcast|analyst[[:space:]]+day|shareholder|prepared[[:space:]]+remarks|conference[[:space:]]+call)'
    OR title ~* 'Q[1-4][[:space:]]+20[0-9]{2}[[:space:]]+earnings'
  );

-- Sample rows (trim output in UI if large)
SELECT id, slug, left(title, 120) AS title_preview, status, updated_at
FROM public.theses
WHERE thesis_origin = 'ai_generated'
  AND (
    title ~* '(earnings[[:space:]]+call|transcript|slideshow|presents[[:space:]]+at|webcast|analyst[[:space:]]+day|shareholder|prepared[[:space:]]+remarks|conference[[:space:]]+call)'
    OR title ~* 'Q[1-4][[:space:]]+20[0-9]{2}[[:space:]]+earnings'
  )
ORDER BY updated_at DESC
LIMIT 50;
