-- Post-cleanup / health: ai_generated snapshot + DB surfacing buckets.
--
-- Notes:
-- - `/theses` loads up to 120 newest ai_generated rows then filters with `isThesisMapListableThesis` in the app
--   (title/body quality, template conviction, catalog rules). This SQL cannot reproduce that filter exactly.
-- - `surfaced_bucket` is written by thesis-surfacing cron; NULL means not bucketed yet or ineligible.
-- - Home lanes (Tradable / Emerging / Monitoring) are also rank-partitioned in the app; these counts are bucket labels only.

WITH ai AS (
  SELECT *
  FROM public.theses
  WHERE thesis_origin = 'ai_generated'
)
SELECT
  count(*) AS total_ai_generated,
  count(*) FILTER (WHERE surfaced_bucket = 'tradable') AS ai_db_tradable,
  count(*) FILTER (WHERE surfaced_bucket = 'emerging') AS ai_db_emerging,
  count(*) FILTER (WHERE surfaced_bucket = 'monitoring') AS ai_db_monitoring,
  count(*) FILTER (WHERE surfaced_bucket IS NULL) AS ai_db_bucket_null,
  count(*) FILTER (WHERE status IN ('resolved', 'invalidated')) AS ai_status_resolved_or_invalidated,
  count(*) FILTER (WHERE status = 'archived') AS ai_status_archived
FROM ai;
