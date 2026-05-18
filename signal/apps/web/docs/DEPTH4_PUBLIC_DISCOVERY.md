# DEPTH4 public thesis discovery (Phase 4F)

## Distinction

| State | Field | Effect |
|-------|--------|--------|
| Private reader | `reader_public_enabled = false` | `/theses/<slug>/read` requires sign-in |
| Public link only | `reader_public_enabled = true`, `reader_public_discoverable = false` | Anyone with link can read; **not** on discovery index |
| Public + discoverable | both true | Listed on **`/public-theses`** |

## Data model

Columns on `public.theses`:

- `reader_public_discoverable` (default `false`)
- `reader_discovery_label` — `featured` \| `exemplar` \| `curated` \| `ai_generated` \| null
- `reader_discovery_priority` — integer; higher sorts earlier within tier

Constraint: discoverable requires `reader_public_enabled`.

Disabling public link clears discoverability and label/priority.

## Ordering (discovery index)

1. `reader_discovery_priority` DESC  
2. Label tier: featured → exemplar → curated → (no label) → ai_generated label  
3. `thesis_origin`: `seeded_system` before `user` before `ai_generated`  
4. `updated_at` DESC  

No ML ranking — editorial and pragmatic exemplar bias only.

## Permissions

Same as Phase 4C.1 / 4E: **elevated** (admin or operator) or **owner** for owner-backed theses.  
API: `GET|PATCH /api/theses/[slug]/reader-discovery` (server-enforced).

## Metadata / indexing

| Surface | robots |
|---------|--------|
| `/theses/<slug>/read` (public link) | `noindex, nofollow` (unchanged) |
| `/public-theses` | `noindex, follow` — discovery is public; search indexing restrained |

OG on individual reader pages unchanged (Phase 4B).

## Rollout

1. Apply migration `20260602120000_thesis_reader_discovery.sql`.
2. Enable public link on chosen exemplar theses (`reader_public_enabled`).
3. In thesis reader share UI (elevated): **List on discovery**, set label/priority.
4. Verify **`/public-theses`** shows only discoverable rows.
5. Do not auto-enable discoverability for all public theses.

## Representing higher-signal theses

- Use **Exemplar** or **Featured** labels on early `seeded_system` catalog theses.
- Use higher **priority** to pin editorial order.
- Generic `ai_generated` theses can remain link-only or use **AI-generated** label if listed intentionally.
