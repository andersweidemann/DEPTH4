-- One-row snapshot: paste result into a ticket or compare staging vs prod.
select
  (select count(*) from public.news_events) as news_events_total,
  (select count(*) from public.thesis_discovery_clusters) as discovery_clusters_total,
  (select count(*) from public.thesis_discovery_clusters where status = 'candidate') as candidates,
  (select count(*) from public.thesis_discovery_clusters where status = 'promoted') as promoted,
  (select count(*) from public.event_reasoning) as event_reasoning_total,
  (select count(*) from public.theses where thesis_origin = 'ai_generated') as ai_theses,
  (select count(*) from public.theses where thesis_origin = 'seeded_system') as seeded_theses;

-- Interpretation:
-- news_events_total = 0  → Ingest is not writing to this DB (Python API / Render cron / wrong SUPABASE_* on API).
-- news > 0, discovery_clusters_total = 0 → Run thesis-discovery cron; enable THESIS_DISCOVERY_SOFT_PERSIST=1
--   or lower THESIS_DISCOVERY_MIN_EVENTS / SIGNAL_THRESHOLD (see .env.example).
-- promoted + event_reasoning > 0 but ai_theses = 0 → fixed in web: event-reasoning now always ensures an
--   ai_generated row per insert; run GET /api/cron/backfill-ai-thesis-registry?limit=200 once after deploy.
