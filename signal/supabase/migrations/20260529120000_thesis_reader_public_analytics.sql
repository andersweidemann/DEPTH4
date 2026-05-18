-- Phase 4D — first-party public reader view analytics (privacy-conscious, aggregate-friendly).

CREATE TABLE IF NOT EXISTS public.thesis_reader_public_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id text NOT NULL REFERENCES public.theses (id) ON DELETE CASCADE,
  slug text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  view_date date NOT NULL DEFAULT (timezone('utc', now()))::date,
  visitor_key text NOT NULL,
  visitor_kind text NOT NULL CHECK (visitor_kind IN ('human', 'crawler', 'preview')),
  source_bucket text NOT NULL DEFAULT 'direct'
    CHECK (source_bucket IN ('direct', 'slack', 'linkedin', 'x', 'search', 'other', 'unknown')),
  referrer_host text NULL,
  device_class text NOT NULL DEFAULT 'unknown'
    CHECK (device_class IN ('mobile', 'desktop', 'unknown')),
  event_source text NOT NULL DEFAULT 'server_render'
    CHECK (event_source IN ('server_render', 'client_beacon')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reader_public_views_thesis_viewed
  ON public.thesis_reader_public_views (thesis_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reader_public_views_slug_date
  ON public.thesis_reader_public_views (slug, view_date DESC);

CREATE INDEX IF NOT EXISTS idx_reader_public_views_thesis_date_kind
  ON public.thesis_reader_public_views (thesis_id, view_date, visitor_kind);

COMMENT ON TABLE public.thesis_reader_public_views IS
  'Append-only public /theses/[slug]/read opens. visitor_key is a daily coarse hash — not a persistent user id.';

ALTER TABLE public.thesis_reader_public_views ENABLE ROW LEVEL SECURITY;

-- No client/anon policies: writes via service role only.
