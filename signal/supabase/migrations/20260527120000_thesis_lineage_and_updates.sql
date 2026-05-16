-- Phase 1: thesis lineage columns + append-only mutation history (additive, nullable).

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS supersedes_thesis_id text REFERENCES public.theses (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lineage_root_thesis_id text REFERENCES public.theses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_theses_supersedes ON public.theses (supersedes_thesis_id)
  WHERE supersedes_thesis_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_theses_lineage_root ON public.theses (lineage_root_thesis_id)
  WHERE lineage_root_thesis_id IS NOT NULL;

COMMENT ON COLUMN public.theses.supersedes_thesis_id IS
  'When set, this row supersedes the parent thesis (core causal claim changed). Parent row is not mutated.';
COMMENT ON COLUMN public.theses.lineage_root_thesis_id IS
  'Stable lineage root for version family; self-rooted rows point at own id after backfill.';

CREATE TABLE IF NOT EXISTS public.thesis_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL,
  actor_id uuid NULL,
  change_type text NOT NULL,
  reason text NULL,
  old_values jsonb NULL,
  new_values jsonb NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_thesis_updates_thesis_created
  ON public.thesis_updates (thesis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_thesis_updates_actor
  ON public.thesis_updates (actor_type, actor_id);

CREATE INDEX IF NOT EXISTS ix_thesis_updates_change
  ON public.thesis_updates (change_type);

COMMENT ON TABLE public.thesis_updates IS
  'Append-only audit log for thesis mutations (field updates, status transitions, successors).';

ALTER TABLE public.thesis_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read thesis_updates" ON public.thesis_updates;
CREATE POLICY "Authenticated read thesis_updates"
  ON public.thesis_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.theses t
      WHERE t.id = thesis_id
        AND (
          t.thesis_origin IN ('seeded_system', 'ai_generated')
          OR t.owner_user_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Users insert thesis_updates for own theses" ON public.thesis_updates;
CREATE POLICY "Users insert thesis_updates for own theses"
  ON public.thesis_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.theses t
      WHERE t.id = thesis_id
        AND t.owner_user_id = auth.uid()
        AND t.thesis_origin = 'user'
    )
  );

-- Idempotent lineage backfill (Phase 1 step 6).
UPDATE public.theses
SET lineage_root_thesis_id = id
WHERE lineage_root_thesis_id IS NULL;
