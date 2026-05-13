-- DESTRUCTIVE: remove ai_generated thesis rows that are clearly ingest/transcript titles, not causal heroes.
-- Child rows on thesis_id (e.g. thesis_stars, thesis_evidence_log) CASCADE — verify FKs in your branch before running.
-- Prefer: run theses_ai_junk_registry_audit.sql, export ids, then execute in a transaction during a maintenance window.

BEGIN;

DELETE FROM public.theses
WHERE thesis_origin = 'ai_generated'
  AND (
    title ~* '(earnings[[:space:]]+call|transcript|slideshow|presents[[:space:]]+at|webcast|analyst[[:space:]]+day|shareholder|prepared[[:space:]]+remarks|conference[[:space:]]+call)'
    OR title ~* 'Q[1-4][[:space:]]+20[0-9]{2}[[:space:]]+earnings'
  );

COMMIT;
