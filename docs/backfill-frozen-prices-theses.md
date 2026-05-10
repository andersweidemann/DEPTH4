# Backfill plan — frozen market price cleanup in `public.theses.body`

New generators follow the global rule (constitution, thesis book template, Cursor rule, API / `packages/ai` prompts) so **fresh** thesis prose avoids embedding stale spot levels. **Legacy rows** may still store dollar figures inside `public.theses.body` (JSONB narrative).

This document is the operational checklist for a later pass in Supabase. **Do not run destructive updates without reviewing row counts and backups.**

## Schema note

- `public.theses.body` is **JSONB** (see `signal/supabase/migrations/20260517120000_thesis_body_jsonb.sql`). Use **`body::text`** for regex / `ILIKE` discovery so matches are reliable.
- Catalog thesis **primary keys** in seed data are: `th-gold`, `th-hormuz`, `th-opec`, `th-tlt`, `th-defense`, `th-qqq`, `th-copper`, `th-eutech` (see `signal/supabase/migrations/20260509120000_theses_text_ids_slug_seed.sql`). UI / docs sometimes refer to the same ideas as USO, RTX, HG, META — those map to the IDs above, not separate `th-uso` / `th-rtx` rows.

---

## A) Identify candidates (Supabase SQL editor)

Run when ready to inventory affected rows:

```sql
SELECT id, slug, title, body
FROM public.theses
WHERE body IS NOT NULL
  AND (
    body::text ~ '\$[0-9]'
    OR body::text ILIKE '%gold at %'
    OR body::text ILIKE '%oil at %'
    OR body::text ILIKE '%QQQ at %'
    OR body::text ILIKE '%TLT at %'
    OR body::text ILIKE '%copper at %'
  );
```

**Goal:** list thesis bodies with literal `$` + digits or “asset at [price]” style phrases that look like frozen spot or index levels. Tighten or extend the `ILIKE` clauses after the first result review.

---

## B) Choose backfill approach

### Option 1 — Manual surgical edits

- For a **small** set (especially seeded catalog theses), hand-edit the few JSON paths that still embed explicit prices; replace with **timeless** wording (levels only where quote-maintained, or empty per constitution).
- Likely sufficient first pass for catalog IDs: `th-gold`, `th-hormuz`, `th-opec`, `th-tlt`, `th-defense`, `th-qqq`, `th-copper`, `th-eutech`.

### Option 2 — LLM-assisted refresh

- For **many** rows (e.g. user or extended theses), regenerate affected sections using the updated thesis-book template + constitution so output avoids embedding specific prices.
- Write back `public.theses.body` via an **admin-only** path or a **one-off** audited script (dry-run, per-row diff, then apply).

---

## C) Migration shell (catalog only) — draft only

**Not for blind execution.** Prefer Option 1 phrase-level fixes over global regex. The snippet below only illustrates intent: scrub obvious `$1234` style tokens from known catalog IDs after you replace it with **curated** `UPDATE ... SET body = ...` per thesis or vetted `regexp_replace` on `body::text` then `::jsonb` with validation.

```sql
-- PLACEHOLDER NAME: e.g. 20260520XXXXXX_remove_frozen_prices_catalog_theses.sql
-- Refine: hand-written replacements per id, or tested regex + jsonb validity check.

-- Example of what we are *not* shipping as-is (dumb global replace breaks legitimate text):
-- UPDATE public.theses
-- SET body = regexp_replace(body::text, '\$[0-9]{3,5}(\.[0-9]{1,2})?', '$X', 'g')::jsonb
-- WHERE id IN (
--   'th-gold', 'th-hormuz', 'th-opec', 'th-tlt', 'th-defense', 'th-qqq', 'th-copper', 'th-eutech'
-- );
```

Any migration must preserve valid JSON and application expectations for keys documented in `signal/apps/web/src/lib/thesis-engine-v2/thesis-db-body.ts`.

---

## D) Next actions (after app deploy)

1. Run the **discovery** query (section A) and note **row count** and **id** distribution.
2. If impact is **limited to catalog**, prefer **Option 1** (manual JSON edits or small targeted `UPDATE`s).
3. If many **non-catalog** rows match, plan **Option 2** with logging and rollback.
4. Optional: add a short comment in release notes that prod `body` may lag until backfill completes.

---

## Related code (prevention, not backfill)

- Catalog defaults: `signal/apps/web/src/lib/thesis-engine-v2/catalog-data.ts`
- Voice / template: `depth4-retail-voice-constitution.ts`, `thesis-book-template.ts`
- Cursor rule: `.cursor/rules/depth4-thesis-narrative-writing.mdc`
- LLM scan lines: `signal/apps/api/signal_api/ai/prompts.py`, `signal/packages/ai/src/index.ts`
