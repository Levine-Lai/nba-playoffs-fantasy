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
      server.js
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

### 3. Run in development
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
3. After auto-login, go to `Edit line-up` / `Transactions` to manage your own team.
4. Create a second account and verify state isolation (different lineup/transfer history).

## Validation Completed
- Frontend type-check: `npx tsc --noEmit`
- Frontend production build: `npm run build` (in `frontend`)
- Backend syntax check: `node --check backend/src/server.js`
- Backend runtime health: `/api/health` returns `ok`

## Current Limitations
- NBA player/schedule data is still mock content.
- No password reset/email verification.
- No real NBA data provider integration yet.
- Session token is intentionally simple for private-game usage.

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
