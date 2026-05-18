# DEPTH4 internal roles (Phase 4E / 4E.1)

## Source of truth

- **`public.depth4_user_roles`** — who has `admin` or `operator` (multiple roles per user allowed).
- **`public.depth4_user_role_audit`** — `granted`, `revoked`, `bootstrap_from_env`.

**elevated** = `admin` OR `operator` (reader publish, reader analytics, anatomy debug).  
**admin-only** = `admin` only (llm-ops, pipeline audit, thesis-live, role management).

Server routes enforce privileges; UI gates call `GET /api/me/depth4-privileges` for display only.

## Production mode (4E.1)

Normal operation is **DB-only**:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEPTH4_ROLE_ENV_FALLBACK` | `0` (off) | **Emergency only** — grant from env without a DB row. Do not enable in prod. |
| `DEPTH4_ROLE_ENV_BOOTSTRAP` | `0` (off) | **Migration only** — write env allowlists into DB on match / empty-table seed. |

Do **not** use `NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS` or `NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS` — they are not read by the server and must not be used for client gating.

Optional server-only bootstrap allowlists (only when `DEPTH4_ROLE_ENV_BOOTSTRAP=1`):

- `DEPTH4_ADMIN_EMAILS` — comma-separated emails (bootstrap writes `admin` on first login match; grant by UUID in UI for ongoing ops).
- `DEPTH4_OPERATOR_USER_IDS` — comma-separated Supabase user UUIDs (bulk seed when table is empty).

## Rollout checklist

1. Apply migration `20260601120000_depth4_user_roles.sql` in Supabase.
2. Grant roles in **`/admin/depth4-roles`** (or SQL `INSERT INTO depth4_user_roles`).
3. Confirm health panel: no operator UUIDs listed under “not in DB”; env fallback **off**.
4. Set on Vercel (production):
   - `DEPTH4_ROLE_ENV_FALLBACK=0` (or unset — default is off)
   - `DEPTH4_ROLE_ENV_BOOTSTRAP=0` (or unset — default is off)
5. Remove unused env vars:
   - `NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS`
   - `NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS`
6. Optionally remove `DEPTH4_ADMIN_EMAILS` / `DEPTH4_OPERATOR_USER_IDS` after all users are in DB.

## Verify completeness

- **UI:** `/admin/depth4-roles` — role table + operational health (policy flags, env gaps).
- **API:** `GET /api/admin/depth4-user-roles` — `{ roles, health }`.
- **SQL:**

```sql
SELECT user_id, role, created_at FROM public.depth4_user_roles ORDER BY created_at DESC;
SELECT * FROM public.depth4_user_role_audit ORDER BY created_at DESC LIMIT 50;
```

If `health.envOnlyPrivilegePossible` is true, env can still grant access without DB rows — turn off `DEPTH4_ROLE_ENV_FALLBACK`.

## Permission behavior (unchanged)

- Owner-backed theses → owner or elevated
- Catalog / owner-less AI theses → elevated only
- Admin analytics → elevated only
- Admin consoles → admin only
