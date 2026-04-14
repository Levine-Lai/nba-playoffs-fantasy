# NBA Playoff Fantasy Prototype

A playoff-focused NBA fantasy game prototype with initial frontend and backend setup.

## Features Implemented
- `Home`: register + login page
- `Edit line-up`: manage roster and captain
- `Points`: view daily points summary and player points
- `Transactions`: free transfer flow and transfer history
- `Leagues`: rank tables by league type
- `Schedule`: game schedule view
- `Help`: game rules and scoring matrix
- Account system:
  - Register with `account` + `gameId` + `password` + `confirmPassword`
  - Login with `account` + `password`
  - Token-based session
  - Each account has an independent lineup and transfer history
- NBA Fantasy bootstrap import:
  - Imports teams, player positions, salary, selected %, availability, total/event points
  - Stores game rules in SQLite (`initial_budget`, `first_deadline`, `weekly_free_transfers`)
- Initial team builder:
  - New accounts start with an empty roster and 100 budget
  - Pick exactly 10 players: 5 `BC` + 5 `FC`
  - Create Team saves starters, bench, captain, roster value, and bank
- Rule-based gameplay:
  - Points page stays locked before `first_deadline`
  - Transactions are limitless before `first_deadline`
  - After `first_deadline`, weekly free transfers default to 2

## Tech Stack
- Frontend: Next.js 14, React, Tailwind CSS, TypeScript
- Backend: Node.js, Express, SQLite (`better-sqlite3`)
- Monorepo scripts: `concurrently` for running both services

## Project Structure
```txt
playoffs/
  backend/
    src/
      db.js
      gameTemplate.js
      importBootstrapData.js
      server.js
      setRule.js
    data/
      playoff-fantasy.db
  frontend/
    src/
      app/
      components/
      data/
      lib/
  docs/
    PRD-Playoff-Fantasy.md
  package.json
```

## Setup
### 1. Install dependencies
```bash
npm install --cache .npm-cache
npm install --prefix backend --cache .npm-cache
npm install --prefix frontend --cache .npm-cache
```

### 2. Configure frontend env
Create `frontend/.env.local`:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
```

You can copy `frontend/.env.local.example`.

### 3. Import NBA Fantasy player data
```bash
npm run import:data
```

This pulls from:
```txt
https://nbafantasy.nba.com/api/bootstrap-static/
```

The import creates/updates:
- `teams`
- `element_types`
- `players`
- `game_rules`

### 3.1 Optional: try official NBA live playoff import
```bash
npm run import:data:live --prefix backend
```

This command does **not** replace the default bootstrap import. It is an opt-in importer that tries to read:
- official NBA schedule JSON from the NBA S3 mirror
- official NBA live box score JSON from the NBA S3 mirror

Current behavior:
- if official playoff box scores are available, it builds a live playoff player pool and enables the cached live schedule
- if official playoff box scores are not available yet, it only refreshes the local live schedule cache and keeps the existing player pool unchanged

Important note:
- direct requests to `stats.nba.com` / `cdn.nba.com` can return `403` in some environments
- this prototype currently uses the official NBA S3 mirror as the safer live-data path
- the backend will only switch schedule display to the live cache when the cache is marked `ready=true`

### 4. Run in development
```bash
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`

Run separately if needed:
```bash
npm run dev:backend
npm run dev:frontend
```

## API Endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/profile`
- `GET /api/meta/player-data`
- `GET /api/players`
- `POST /api/team/create`
- `GET /api/lineup`
- `PUT /api/lineup`
- `GET /api/points/today`
- `GET /api/transactions/options`
- `POST /api/transactions`
- `GET /api/leagues`
- `GET /api/schedule`
- `GET /api/help/rules`
- `GET /api/health`

## Basic Usage Flow
1. Open `http://localhost:3000`
2. Register a new account:
   - account (for login)
   - game ID (display name in game)
   - password + confirm password
3. After auto-login, go to `Edit line-up`.
4. If the roster is empty, pick 10 players in the initial team builder:
   - 5 `BC`
   - 5 `FC`
   - total salary <= 100
5. Click `Create Team`, then use `Edit line-up` and `Transactions` normally.
6. Create a second account and verify state isolation (different lineup/transfer history).

## Database Editing
SQLite file:
```txt
backend/data/playoff-fantasy.db
```

List current game rules:
```bash
npm run rule:set
```

Change the first deadline:
```bash
npm run rule:set -- first_deadline 2026-04-18T23:00:00Z
```

Change weekly free transfers:
```bash
npm run rule:set -- weekly_free_transfers 2
```

Change initial budget:
```bash
npm run rule:set -- initial_budget 100
```

Re-import player data from the NBA Fantasy API:
```bash
npm run import:data
```

By default, re-import preserves rules you already changed. To force rule values during import:
```powershell
$env:PLAYOFF_FIRST_DEADLINE="2026-04-18T23:00:00Z"; npm run import:data
$env:PLAYOFF_INITIAL_BUDGET="100"; npm run import:data
$env:PLAYOFF_WEEKLY_FREE_TRANSFERS="2"; npm run import:data
```

For manual edits, you can open the SQLite DB in a GUI like DB Browser for SQLite. The most useful tables are:
- `users`: login account and game ID
- `user_states`: each user's roster, bank, transfer history
- `players`: imported player pool
- `teams`: imported NBA teams
- `element_types`: `BC` / `FC` roster position config
- `game_rules`: budget, deadline, free-transfer settings

## Validation Completed
- Frontend type-check: `npx tsc --noEmit`
- Frontend production build: `npm run build` (in `frontend`)
- Backend syntax check: `node --check backend/src/server.js`
- Backend runtime health: `/api/health` returns `ok`
- NBA Fantasy bootstrap import: 665 players imported locally

## Current Limitations
- Player data comes from NBA Fantasy bootstrap, but live playoff box-score scoring is not wired yet.
- Schedule data is still mock content.
- No password reset/email verification.
- Session token is intentionally simple for private-game usage.
- Official NBA live playoff import exists as an experimental path, but it should not be treated as the default source until playoff box scores are consistently available.

## Suggested Next Steps
1. Integrate real NBA schedule and player box score data.
2. Add league invite and membership management.
3. Add over-limit transfer penalty rules and lineup lock logic.
4. Add E2E tests and API schema validation.

## Troubleshooting
- If you see a strange 404 page with broken styles, check if another service is already using port `3000`.
- On Windows PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```
- Then restart:
```bash
npm run dev
```
- `frontend` now runs a `predev` step that clears `.next` cache automatically to prevent stale chunk errors.
