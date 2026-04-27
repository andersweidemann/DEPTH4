# DEPTH4 (SIGNAL)

Geopolitical intelligence app: **Next.js** web UI, **FastAPI** backend, **Supabase** database/auth, optional **Redis** and **Stripe**.

## What’s in this repo

| Path | What it is |
|------|------------|
| `signal/` | Full app: `apps/web` (Next), `apps/api` (Python), `packages/*`, `supabase/migrations` |
| `render.yaml` | [Render](https://render.com) blueprint to host the API (Docker) |

Local MetaTrader / EA work stays in a `mt5/` folder on your machine if you use one; that folder is **gitignored** and is not part of DEPTH4.

## Quick start (development)

```bash
cd signal
npm install
cp .env.example .env
# Edit .env — see comments inside signal/.env.example

npm run dev:web    # Next.js → http://localhost:3000
# In another terminal:
npm run dev:api    # API → http://localhost:8000
```

API env can also live in `signal/apps/api/.env` (see `signal/apps/api/.env.example`).

## Deploy (short)

1. Push this repo to GitHub.
2. **Vercel**: root directory `signal/apps/web`, set env vars from `signal/.env.example`.
3. **Render**: new Blueprint from `render.yaml`; set secrets in the dashboard.
4. Set **`NEXT_PUBLIC_API_URL`** on Vercel to your Render API URL.

Details were covered in your deployment checklist (Upstash Redis, Supabase URLs for auth, etc.).
