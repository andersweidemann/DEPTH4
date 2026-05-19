-- Batch fixes: seeded thesis Q80 baseline, gold symbol body patch, remove stale ai_generated theses.

update public.theses
set
  quality_score = 80,
  quality_checks = '[
    {"name": "incentive_analysis", "passed": true},
    {"name": "causal_chain_depth", "passed": true},
    {"name": "conviction_calibrated", "passed": true},
    {"name": "no_contradiction", "passed": true},
    {"name": "trade_plan_complete", "passed": true},
    {"name": "evidence_present", "passed": true},
    {"name": "resolution_paths", "passed": true},
    {"name": "title_matches_direction", "passed": true}
  ]'::jsonb
where thesis_origin = 'seeded_system'
  and (quality_score = 0 or quality_score is null);

update public.theses
set body = jsonb_set(
  coalesce(body, '{}'::jsonb),
  '{target_asset}',
  '"XAUUSD"'::jsonb
)
where slug in (
  'gold-short-iran-d-tente-deflates-safe-haven--6fba68a2',
  'gold-short-middle-east-risk-premium-collapse-8e113e88'
);

delete from public.causal_affects
where thesis_id in (select id from public.theses where thesis_origin = 'ai_generated');

delete from public.event_thesis_links
where thesis_id in (select id from public.theses where thesis_origin = 'ai_generated');

delete from public.thesis_updates
where thesis_id in (select id from public.theses where thesis_origin = 'ai_generated');

delete from public.thesis_stars
where thesis_id in (select id from public.theses where thesis_origin = 'ai_generated');

delete from public.theses
where thesis_origin = 'ai_generated';
