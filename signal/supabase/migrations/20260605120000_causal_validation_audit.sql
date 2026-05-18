-- Causal validation: post-migration audit hook (run via web cron or script).
-- After applying migrations that touch causal_events / event_thesis_links / theses.event_id:
--   curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/causal-conflict-scan"
-- Or admin: GET /api/admin/conflicts

COMMENT ON TABLE public.event_thesis_links IS
  'Links catalog/user theses to causal events. New links must pass causal validation (web API / AI pipeline).';
