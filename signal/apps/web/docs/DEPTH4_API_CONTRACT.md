# DEPTH4 API contract (Chunk 9)

Single source of truth for HTTP routes under `signal/apps/web/src/app/api/`. Shapes match `src/types/*`.

## Authentication

| Method | Path | Request | Response | Errors |
|--------|------|-----------|----------|--------|
| POST | `/api/auth/login` | `{ email, password, rememberMe }` | `{ user, token, refresh_token? }` | 401 invalid credentials, 400 missing fields |
| POST | `/api/auth/signup` | `{ email, password }` | `{ user, token, refresh_token? }` | 400 missing, 409 email exists, 422 weak password |
| GET | `/api/auth/google` | `?next=` | 302 OAuth URL | 500 misconfig |
| GET | `/api/auth/callback` | (alias) | 302 → `/auth/callback` | — |
| POST | `/api/auth/logout` | (cookie / Bearer) | `{ success: true }` | — |
| GET | `/api/auth/me` | optional `Authorization: Bearer`; **session cookies** respected when Bearer omitted | `{ user: User \| null }` | — |
| POST | `/api/auth/forgot-password` | `{ email }` | `{ success: true }` always (no enumeration) | — |

OAuth / cookie verification: `docs/AUTH_OAUTH_VERIFICATION.md`.

## Theses

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/theses` | `?assetClass=&status=&sort=&starred=` | `ThesisListResponse` (`focus`, `monitor`) |
| POST | `/api/theses` | `{ statement, asset, direction }` | `{ success, thesis?: { id, slug } }` |
| GET | `/api/theses/[slug]` | — | `Thesis` |
| GET | `/api/theses/[slug]/assessment` | — | `ThesisAssessment` |
| GET | `/api/theses/[slug]/evidence` | — | `EvidenceItem[]` |
| GET | `/api/theses/[slug]/positions` | — | `LinkedPosition` |
| POST | `/api/theses/[slug]/chat` | `{ message }` + Bearer | `{ reply }` — server uses **`ANTHROPIC_MODEL_CHEAP`** (default `claude-3-5-haiku-latest`) for Anthropic |
| POST | `/api/theses/[slug]/star` | — toggle | `{ starred: boolean }` |
| POST | `/api/theses/[slug]/resolve` | `{ outcome }` | `{ success: true }` |
| POST | `/api/theses/[slug]/clear-outcome` | — | `{ success: true }` |

## Feed

| GET `/api/feed` | → `FeedItem[]` |
| GET `/api/feed/reasoning` | → `{ items: NewsEvent[] }` (reasoning rows only; legacy shape) |

## Book

| GET `/api/book` | → `BookResponse` |
| POST `/api/book/open` | `{ thesisSlug, direction, entryPrice }` | `{ position }` |
| POST `/api/book/close` | `{ positionId, exitPrice? }` | `{ position }` |
| POST `/api/book/resolve` | `{ thesisSlug, outcome }` | `{ success: true }` |

## Help

| GET `/api/help` | → `HelpResponse` |

---

## WebSocket (optional; not required for initial ship)

Endpoint: `wss://api.depth4.com/ws?token=<jwt>`

Inbound message shapes:

```json
{ "type": "thesis_update", "slug": "war-peace-gold-short", "field": "conviction", "value": 78, "timestamp": "2026-05-12T10:30:00Z" }
```

```json
{ "type": "news_event", "event": { /* NewsEvent */ }, "timestamp": "2026-05-12T10:30:00Z" }
```

```json
{ "type": "position_update", "positionId": "pos_123", "field": "pnl", "value": 45.2, "timestamp": "2026-05-12T10:30:00Z" }
```

Client handling (with SWR): on `thesis_update` revalidate `/api/theses/${slug}`; on `news_event` revalidate `/api/feed`; on `position_update` revalidate `/api/book`. **Polling fallback:** refetch every 30s acceptable.
