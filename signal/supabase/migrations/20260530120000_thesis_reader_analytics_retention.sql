-- Phase 4D.1 — daily rollups + long-lived aggregates after raw event retention.

CREATE TABLE IF NOT EXISTS public.thesis_reader_public_views_daily (
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  slug text NOT NULL,
  view_date date NOT NULL,
  human_views integer NOT NULL DEFAULT 0 CHECK (human_views >= 0),
  human_unique_visitors integer NOT NULL DEFAULT 0 CHECK (human_unique_visitors >= 0),
  crawler_views integer NOT NULL DEFAULT 0 CHECK (crawler_views >= 0),
  preview_views integer NOT NULL DEFAULT 0 CHECK (preview_views >= 0),
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thesis_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_reader_public_views_daily_slug_date
  ON public.thesis_reader_public_views_daily (slug, view_date DESC);

COMMENT ON TABLE public.thesis_reader_public_views_daily IS
  'Daily public reader metrics. Raw events older than retention are rolled up here then deleted.';

ALTER TABLE public.thesis_reader_public_views_daily ENABLE ROW LEVEL SECURITY;

-- No client policies: service role only (same as thesis_reader_public_views).
