-- Audit: ai_generated rows whose hero/title still looks like ingest (transcript / deck / call), not a DEPTH4 thesis.
-- Run in Supabase SQL editor; review ids before any delete.
--
-- Query 1 — one row: totals + pollution rate (answers Part 1 handoff).
WITH ai AS (
  SELECT *
  FROM public.theses
  WHERE thesis_origin = 'ai_generated'
),
flagged AS (
  SELECT
    ai.*,
    (
      title ~* '(earnings[[:space:]]+call|transcript|slideshow|presents[[:space:]]+at|webcast|analyst[[:space:]]+day|shareholder|prepared[[:space:]]+remarks|conference[[:space:]]+call)'
      OR title ~* 'Q[1-4][[:space:]]+20[0-9]{2}[[:space:]]+earnings'
    ) AS is_junk_title
  FROM ai
)
SELECT
  (SELECT count(*) FROM ai) AS total_ai_generated,
  (SELECT count(*) FROM flagged WHERE is_junk_title) AS polluted_ai_theses,
  (SELECT count(*) FROM flagged WHERE is_junk_title AND status = 'forming') AS polluted_forming,
  round(
    100.0 * (SELECT count(*) FROM flagged WHERE is_junk_title)::numeric
    / nullif((SELECT count(*) FROM ai), 0),
    2
  ) AS pct_polluted;

-- Query 2 — sample rows (trim output in UI if large)
SELECT id, slug, left(title, 120) AS title_preview, status, updated_at
FROM public.theses
WHERE thesis_origin = 'ai_generated'
  AND (
    title ~* '(earnings[[:space:]]+call|transcript|slideshow|presents[[:space:]]+at|webcast|analyst[[:space:]]+day|shareholder|prepared[[:space:]]+remarks|conference[[:space:]]+call)'
    OR title ~* 'Q[1-4][[:space:]]+20[0-9]{2}[[:space:]]+earnings'
  )
ORDER BY updated_at DESC
LIMIT 50;
