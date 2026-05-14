-- Recent clusters: macro v17 + registry repair attempted + validation still rejected.
-- Join latest event_reasoning for hero / chain / mispricing and raw_response (main + repair pass).

WITH rejected AS (
  SELECT *
  FROM (
    SELECT DISTINCT ON (t.cluster_id)
      t.cluster_id,
      t.reason_code,
      t.detail,
      t.created_at AS validation_at,
      t.meta AS validation_meta
    FROM public.thesis_pipeline_trace t
    WHERE t.stage = 'validation'
      AND t.status = 'rejected'
      AND t.prompt_version = 'macro-reasoning-plain-v17'
      AND COALESCE((t.meta->>'registry_repair_attempted')::boolean, false) = true
    ORDER BY t.cluster_id, t.created_at DESC
  ) latest_per_cluster
  ORDER BY validation_at DESC
  LIMIT 25
),
latest_er AS (
  SELECT DISTINCT ON (er.cluster_id)
    er.cluster_id,
    er.id AS event_reasoning_id,
    er.news_event_id,
    er.reasoning,
    er.raw_response,
    er.prompt_version,
    er.created_at AS er_created_at
  FROM public.event_reasoning er
  INNER JOIN rejected r ON r.cluster_id = er.cluster_id
  WHERE er.prompt_version = 'macro-reasoning-plain-v17'
  ORDER BY er.cluster_id, er.created_at DESC
)
SELECT
  r.cluster_id,
  r.reason_code,
  r.detail,
  r.validation_at,
  r.validation_meta,
  e.event_reasoning_id,
  e.news_event_id,
  e.er_created_at,
  e.reasoning->>'thesis_trade_line' AS thesis_trade_line,
  e.reasoning->>'reasoning_chain' AS reasoning_chain,
  e.reasoning->>'mispricing_hypothesis' AS mispricing_hypothesis,
  e.reasoning->>'event_summary' AS event_summary,
  e.reasoning->'forming_narrative_layer' AS forming_narrative_layer,
  e.raw_response->'assistant_text' AS main_assistant_text,
  e.raw_response->'registry_repair'->>'assistant_text' AS repair_assistant_text
FROM rejected r
LEFT JOIN latest_er e ON e.cluster_id = r.cluster_id
ORDER BY r.validation_at DESC
LIMIT 10;
