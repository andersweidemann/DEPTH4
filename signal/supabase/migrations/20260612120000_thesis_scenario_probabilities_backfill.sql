-- Backfill resolution path probabilities for key seeded / catalog theses (clean/messy/broken as bull/base/bear).

update public.theses
set scenario_probabilities = '{"bull": 48, "base": 27, "bear": 25}'::jsonb
where slug = 'war-peace-gold-short';

update public.theses
set scenario_probabilities = '{"bull": 35, "base": 30, "bear": 35}'::jsonb
where slug = 'crude-oil-short-peace-premium-deflation-on-i-b22f66b9';

update public.theses
set quality_score = 80,
    promotion_blocked_reason = null
where slug = 'war-peace-gold-short'
  and (quality_score is null or quality_score < 75);

update public.theses
set status = 'ready'
where thesis_origin = 'seeded_system'
  and status is distinct from 'ready';
