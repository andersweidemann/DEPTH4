-- Discovery / AI thesis pipeline health (last 48 hours)
-- Run in Supabase SQL Editor against the live project.
-- Adjust the interval if needed.

-- 1) thesis_discovery_clusters: candidate vs promoted (48h)
select status, count(*) as n
from public.thesis_discovery_clusters
where created_at >= now() - interval '48 hours'
group by status
order by status;

-- 2) Recent clusters (sample)
select id, status, signal_score, cardinality(member_news_event_ids) as n_members, title_hint, created_at
from public.thesis_discovery_clusters
where created_at >= now() - interval '48 hours'
order by created_at desc
limit 25;

-- 3) AI-generated theses (all time + recent)
select count(*) as ai_theses_total
from public.theses
where thesis_origin = 'ai_generated';

select id, slug, title, discovery_cluster_id, created_at, updated_at
from public.theses
where thesis_origin = 'ai_generated'
order by updated_at desc
limit 20;

-- 4) event_reasoning: rows in 48h with non-empty affected_theses (JSON path)
select
  count(*) filter (
    where coalesce(jsonb_array_length(reasoning->'affected_theses'), 0) > 0
  ) as with_affected_theses,
  count(*) as total_rows
from public.event_reasoning
where created_at >= now() - interval '48 hours';

-- 5) Sample reasoning payloads (affected_theses visibility)
select id, cluster_id, news_event_id, created_at, reasoning->'affected_theses' as affected_theses
from public.event_reasoning
where created_at >= now() - interval '48 hours'
order by created_at desc
limit 15;
