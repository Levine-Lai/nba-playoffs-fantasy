# Vercel Frontend + Cloudflare Backend Deployment Guide

This guide matches the current codebase structure:

- `frontend/` deploys to Vercel
- `backend/` deploys to Cloudflare Workers
- `backend` data lives in Cloudflare D1

If you want the online version to behave exactly like your current local version, use the `from-local` seed path instead of the clean bootstrap seed path.

## 1. Prepare Locally

Install dependencies:

```bash
npm install --cache .npm-cache
npm install --prefix backend --cache .npm-cache
npm install --prefix frontend --cache .npm-cache
```

Run a final local check before deployment:

```bash
npm run db:migrate:local
npm run db:seed:from-local
npm run db:seed:apply:local
npm run build
```

## 2. Create The Cloudflare D1 Database

In `backend/`:

```bash
cd backend
npx wrangler login
npx wrangler d1 create playoff-fantasy-db-prod
```

Cloudflare will print:

- `database_name`
- `database_id`
- `preview_database_id`

Open `backend/wrangler.toml` and replace the placeholder values in the `[[d1_databases]]` block.

## 3. Apply The D1 Schema To Cloudflare

Still in `backend/`:

```bash
npm run db:migrate:remote
```

This applies every SQL file under `backend/migrations/`, including `0001_init.sql`, `0002_users_game_id_unique.sql`, and `0003_day_slate_transfer_penalty.sql`.

## 4. Choose How To Seed Production Data

You have 3 paths.

### Path A: Exact copy of your current local project state

Use this if you want current users, teams, leagues, rules, and cached schedule behavior copied to production.

```bash
npm run db:seed:from-local
npm run db:seed:apply:remote
```

### Path B: Clean production player pool from NBA Fantasy bootstrap

Use this if you want a clean online launch without carrying local accounts or league data.

```bash
npm run db:seed:bootstrap
npm run db:seed:apply:remote
```

### Path C: Optional live playoff seed

Use this only if you explicitly want the experimental live-playoff import path.

```bash
npm run db:seed:live
npm run db:seed:apply:remote
```

If the upstream live box score feed is slow or unavailable, fall back to Path A or Path B.

## 5. Deploy The Cloudflare Worker

In `backend/`:

```bash
npm run deploy
```

After deployment, Cloudflare will give you a Worker URL similar to:

```txt
https://playoff-fantasy-backend.<your-subdomain>.workers.dev
```

Your API base URL is:

```txt
https://playoff-fantasy-backend.<your-subdomain>.workers.dev/api
```

Quick verification:

```bash
curl https://playoff-fantasy-backend.<your-subdomain>.workers.dev/api/health
```

## 6. Deploy The Frontend To Vercel

### Option 1: Deploy from the Vercel dashboard

1. Import the Git repository into Vercel.
2. Set the project Root Directory to `frontend`.
3. Let Vercel detect the framework as `Next.js`.
4. Add this environment variable:

```txt
NEXT_PUBLIC_API_BASE_URL=https://playoff-fantasy-backend.<your-subdomain>.workers.dev/api
```

5. Click Deploy.

### Option 2: Redeploy after env changes

If you already created the Vercel project:

1. Open the project in Vercel.
2. Go to `Settings -> Environment Variables`.
3. Update `NEXT_PUBLIC_API_BASE_URL`.
4. Trigger a new deployment.

## 7. Verify The Live Site End-To-End

After both deployments finish:

1. Open the Vercel frontend URL.
2. Register a new test account.
3. Confirm you land on `Edit line-up`.
4. Build an initial 10-player team.
5. Open `Transactions`, `Points`, `Schedule`, `Help`, and `Leagues`.
6. Create a private league.
7. Create a second account and join the league by code.
8. Confirm lineup state and league membership are isolated by account.

## 8. Recommended Release Order

Use this order every time:

1. Commit changes to Git.
2. Deploy backend schema changes first.
3. Seed or migrate remote D1 if needed.
4. Deploy the Cloudflare Worker.
5. Update the Vercel env var if the backend URL changed.
6. Deploy the frontend.
7. Run a smoke test on production.

## 9. How To Modify Modules Later

Use this rule of thumb:

- Frontend page / component changes:
  edit `frontend/src/app/*` and `frontend/src/components/*`
- API contract / route changes:
  edit `backend/src/index.ts`
- D1 query and persistence changes:
  edit `backend/src/worker/store.ts`
- gameplay rule changes:
  edit `backend/src/worker/gameplay.ts`
- official NBA live data behavior:
  edit `backend/src/worker/liveData.ts`
- schema changes:
  add a new SQL migration under `backend/migrations/`
  keep remote D1 in sync by rerunning `npm run db:migrate:remote` before deploy

## 10. Common Gotchas

- `backend/wrangler.toml` must contain the real D1 IDs before `db:migrate:remote` and `deploy`.
- If the frontend still talks to the old backend, check the Vercel env var and redeploy.
- If you want an exact online copy of local state, do not use the clean bootstrap seed path.
- If Cloudflare reports CPU limit errors on auth routes, read `docs/free-tier-assessment.md` first. That is the main free-tier risk in this architecture.
