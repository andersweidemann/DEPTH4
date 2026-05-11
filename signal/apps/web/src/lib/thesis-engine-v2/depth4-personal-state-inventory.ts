/**
 * DEPTH4 personal state — intentional storage boundaries (account vs device vs ephemeral).
 *
 * Update this comment when adding new user-specific state so the app does not drift back to
 * browser-only source of truth for product-critical data.
 *
 * | State | Source of truth | Refresh | Logout/login | Device change | Notes |
 * |-------|-----------------|---------|--------------|----------------|-------|
 * | Starred theses | `public.thesis_stars` + session cache | Yes | Yes | Yes | Hydrate merges legacy session once. Toggle audit: `depth4_thesis_star_events`. |
 * | Book / positions | `public.depth4_user_book` + session cache | Yes | Yes | Yes | |
 * | Notify prefs + manual outcomes | `public.users.notification_preferences` JSON keys | Yes | Yes | Yes | |
 * | User-owned theses | `public.theses` (RLS owner) + session cache | Yes | Yes | Yes | |
 * | Thesis bell read/dismiss | `public.depth4_user_alert_state` | Yes | Yes | Yes | Stable ids `evidence:<log id>`, `manual-outcome:…`. Failed PATCHes use a **small in-memory queue** (retry + flush on next persist / sign-in hydrate) — not browser storage. |
 * | Community follows | `sessionStorage` only | Tab | No | No | **Intentional:** lightweight demo UX; not account-backed. |
 * | V2 plan picker (`useV2Plan`) | `sessionStorage` only | Tab | No | No | **Intentional:** demo tier switcher until billing ties plan to account. |
 * | Feed lead traffic lights | `localStorage` | Yes | Same browser only | No | **Intentional per-device:** feed annotation toy; not security/account data. |
 * | Feed model hint override | `localStorage` (see feed consumers) | Per device | Per device | No | **Intentional per-device** UI hint. |
 * | Drawer open / scroll / hover | React memory | No | No | No | Ephemeral UI. |
 */

export const DEPTH4_PERSONAL_STATE_INVENTORY_VERSION = 2;
