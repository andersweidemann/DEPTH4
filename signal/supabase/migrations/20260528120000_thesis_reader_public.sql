-- Phase 4C — explicit per-thesis public reader share (canonical /theses/<slug>/read).

ALTER TABLE public.theses
  ADD COLUMN IF NOT EXISTS reader_public_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.theses.reader_public_enabled IS
  'When true, /theses/<slug>/read is readable without login (read-only reader surface). Default false.';

CREATE INDEX IF NOT EXISTS idx_theses_reader_public_slug
  ON public.theses (slug)
  WHERE reader_public_enabled = true AND slug IS NOT NULL;
