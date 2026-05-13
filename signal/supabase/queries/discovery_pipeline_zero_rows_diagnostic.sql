-- When discovery_pipeline_health_48h.sql is all zeros — broader checks.
-- Run sections one at a time in Supabase SQL Editor.
--
-- FAST PATH: run discovery_pipeline_counts_one_row.sql first (single result row).
--
-- If news_events_total is 0 here: fix news ingest (signal/apps/api news_ingest → Supabase).
--   Vercel Next app does not insert news; Render/FastAPI + same Supabase URL as production.

-- A) Do we have ANY discovery clusters ever?
select status, count(*) as n
from public.thesis_discovery_clusters
group by status
order by status;

select count(*) as clusters_total from public.thesis_discovery_clusters;

-- B) If clusters_total = 0, thesis-discovery cron never persisted candidates OR wrong DB.
--    Check news volume (ingest must be running).
select count(*) as news_total from public.news_events;

select count(*) as news_last_7d
from public.news_events
where coalesce(published_at, '1970-01-01'::timestamptz) >= now() - interval '7 days';

select id, headline, source, signal_level, published_at
from public.news_events
order by signal_level desc nulls last, published_at desc nulls last
limit 15;

-- C) event_reasoning (any rows?)
select count(*) as event_reasoning_total from public.event_reasoning;

select id, cluster_id, created_at
from public.event_reasoning
order by created_at desc
limit 10;

-- D) AI theses
select count(*) as ai_theses from public.theses where thesis_origin = 'ai_generated';

-- E) Generation runs audit table (if migration applied)
select count(*) as generation_runs_total from public.thesis_generation_runs;
