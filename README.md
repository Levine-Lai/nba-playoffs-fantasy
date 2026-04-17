# NBA Playoff Fantasy

This project now runs as:

- `frontend/`: Next.js app for Vercel
- `backend/`: Cloudflare Worker + D1 backend

The user-facing gameplay stays the same:

- register + login
- initial 10-player team creation
- line-up editing
- points view
- transactions
- private leagues
- schedule
- help / rules

Recent transaction rules implemented in the current build:

- transaction drafts are confirmed as a batch
- after `Day 1` starts, each normal transfer costs `-50` points for that slate
- transfer penalties only appear in standings after that slate deadline passes
- `Wildcard` is a once-per-playoffs chip for unlimited no-penalty pre-deadline transfers
- `All-Star` is a once-per-playoffs chip for unlimited no-penalty pre-deadline transfers with temporary over-budget squad support
- the transaction table shows the next five schedule days with opponent logos and `-` on off days

## Architecture

- Frontend: Next.js 14, React, Tailwind CSS, TypeScript
- Backend runtime: Cloudflare Workers
- Backend database: Cloudflare D1
- Local seed source: existing SQLite file in `backend/data/playoff-fantasy.db`

## Important Paths

- `frontend/src/lib/api.ts`
- `backend/src/index.ts`
- `backend/src/worker/store.ts`
- `backend/src/worker/liveData.ts`
- `backend/src/worker/gameplay.ts`
- `backend/migrations/0001_init.sql`
- `backend/migrations/0002_users_game_id_unique.sql`
- `backend/migrations/0003_day_slate_transfer_penalty.sql`
- `backend/wrangler.toml`

## Local Development

1. Install dependencies

```bash
npm install --cache .npm-cache
npm install --prefix backend --cache .npm-cache
npm install --prefix frontend --cache .npm-cache
```

2. Create the local D1 schema

```bash
npm run db:migrate:local
```

3. Seed local D1

Use the exact current local SQLite data:

```bash
npm run db:seed:from-local
npm run db:seed:apply:local
```

Or generate a clean player pool from the NBA Fantasy bootstrap feed:

```bash
npm run db:seed:bootstrap
npm run db:seed:apply:local
```

4. Configure the frontend API base

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8787/api
```

5. Start both apps

```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend Worker: `http://127.0.0.1:8787`

## Cloudflare D1 Seed Commands

- `npm run db:seed:from-local`
  Creates `backend/tmp/d1-seed.sql` from the current local SQLite database and schedule cache.

- `npm run db:seed:bootstrap`
  Creates `backend/tmp/d1-seed.sql` from the NBA Fantasy bootstrap API.

- `npm run db:seed:live`
  Tries to build `backend/tmp/d1-seed.sql` from official playoff schedule / box score feeds.
  This is optional and depends on upstream availability.

## Deployment Docs

- Step-by-step deployment:
  `docs/deploy-vercel-cloudflare.md`
- Free-tier assessment:
  `docs/free-tier-assessment.md`

## Validation Completed

- Worker type-check: `npm run typecheck --prefix backend`
- Frontend production build: `npm run build --prefix frontend`
- Transaction flow now also uses `POST /api/transactions/confirm` for batch-confirm + chip activation
- Registration now requires both `account` and `gameId` to be unique; apply `backend/migrations/0002_users_game_id_unique.sql` anywhere the D1 schema already exists
- Day-based slate transfer scoring uses `backend/migrations/0003_day_slate_transfer_penalty.sql` to set `weekly_free_transfers = 0` and `transfer_penalty = 50`
- Root build check: `npm run build`
- Local D1 migration applied successfully
- Local D1 seed imported from current SQLite data
- Local Worker runtime smoke test:
  - `GET /api/health`
  - `POST /api/auth/register`
  - `GET /api/lineup`

## Notes

- `backend/wrangler.toml` contains placeholder D1 IDs. Replace them after running `wrangler d1 create`.
- The current backend intentionally preserves the existing auth behavior with `bcryptjs`, which matters for the free-tier assessment in `docs/free-tier-assessment.md`.
- `backend/data/` remains the source of truth for exporting your current local state into D1 when you want an exact migration.
