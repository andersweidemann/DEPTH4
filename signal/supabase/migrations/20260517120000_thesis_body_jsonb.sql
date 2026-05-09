-- Optional full thesis book payload for rows loaded from Supabase (catalog, user, ai_generated).
-- Canonical keys are documented in `signal/apps/web/src/lib/thesis-engine-v2/thesis-db-body.ts`
-- and in the `Thesis` type (camelCase in TS; snake_case recommended in JSON for PostgREST).
-- When null, clients merge narrative from mocks (catalog) or session (user) as today.

ALTER TABLE public.theses ADD COLUMN IF NOT EXISTS body jsonb;

COMMENT ON COLUMN public.theses.body IS
  'Optional thesis book JSON. Single-purpose fields: title/micro_label usually also in columns; '
  'body holds narrative (why_thesis_exists, thesis_cascade, whats_unpriced, trigger, trade, invalidation, '
  'time_stop, risk_factors, etc.). Generators must not duplicate the hero sentence across blocks; '
  'risk_factors should reference Invalidation, not paste it.';
