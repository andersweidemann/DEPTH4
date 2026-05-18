-- Phase 4F — Curated public thesis discovery (separate from link-only sharing).

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS reader_public_discoverable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reader_discovery_label text NULL,
  ADD COLUMN IF NOT EXISTS reader_discovery_priority integer NOT NULL DEFAULT 0;

ALTER TABLE public.theses
  DROP CONSTRAINT IF EXISTS theses_reader_discovery_label_check;

ALTER TABLE public.theses
  ADD CONSTRAINT theses_reader_discovery_label_check
  CHECK (
    reader_discovery_label IS NULL
    OR reader_discovery_label IN ('featured', 'exemplar', 'curated', 'ai_generated')
  );

ALTER TABLE public.theses
  DROP CONSTRAINT IF EXISTS theses_reader_discoverable_requires_public_check;

ALTER TABLE public.theses
  ADD CONSTRAINT theses_reader_discoverable_requires_public_check
  CHECK (NOT reader_public_discoverable OR reader_public_enabled);

COMMENT ON COLUMN public.theses.reader_public_discoverable IS
  'When true (and reader_public_enabled), thesis appears on the public discovery index (/public-theses).';

COMMENT ON COLUMN public.theses.reader_discovery_label IS
  'Optional editorial label: featured, exemplar, curated, ai_generated.';

COMMENT ON COLUMN public.theses.reader_discovery_priority IS
  'Higher sorts earlier within the same label tier (editorial ordering).';

CREATE INDEX IF NOT EXISTS idx_theses_reader_public_discoverable
  ON public.theses (reader_discovery_priority DESC, updated_at DESC)
  WHERE reader_public_discoverable = true
    AND reader_public_enabled = true
    AND slug IS NOT NULL;
