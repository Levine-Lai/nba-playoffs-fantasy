# Project Context

This file is the project's cross-conversation memory.
Update it after every meaningful code, rules, schema, routing, or deployment-flow change so a new chat can recover the important context quickly.

## Current Product Shape
- Frontend lives in `frontend/` and is deployed on Vercel.
- Backend lives in `backend/` and runs on Cloudflare Workers + D1.
- The game is a playoff-only NBA fantasy product with 10-player rosters.
- The old floating `Design Docs` button is removed from the main app shell and should stay out of the player-facing UI unless explicitly brought back.
- The `Help` page is now a frontend-owned Chinese rules page with only two mobile-first cards (`计分规则`, `换人与 FT 规则`); do not rely on the old backend English rules payload for user-facing copy.

## Naming And Route Conventions
- User-facing leaderboard language is `Standing`, not `League`.
- Main leaderboard page is `/standing`.
- Legacy `/leagues` now exists only as a redirect and should not receive new feature work.
- Team identity should be shown as `Team Name`; do not reintroduce separate `Player Name` UI unless explicitly requested.

## Live Gameplay Rules
- `Day 1` is the real playoff opener on `2026-04-18`.
- `Points` stay hidden until the `Day 1` deadline passes.
- Before the `Day 1` deadline, transfers are unlimited setup moves and do not consume playoff FT.
- After the `Day 1` deadline, each team gets `6` total playoff FT for the entire postseason.
- Once those `6` FT are gone, each extra normal transfer costs `-50`.
- `Wildcard` and `All-Star` must remain locked until after the `Day 1` deadline.
- Play-in games (`005...`) are excluded from schedule, scoring, and standings logic.
- Standings should display effective scoring, including penalties and valid negative totals.
- Fantasy scoring weights are `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`, with captain still adding a 1.5x multiplier on that player's counted score.
- Effective scoring should follow the valid lineup shape rules:
  - Count up to 5 scoring players.
  - Use starters first.
  - If starters without games create vacancies, fill from bench order.
  - Final counted group must still satisfy either `3BC + 2FC` or `2BC + 3FC`.

## Data And State Notes
- Registration still uses `account` plus unique `gameId`.
- New users should default `teamName` to `gameId`.
- Old `teamName` values that look like `<gameId> Squad` should be treated as legacy defaults and normalized in UI display.
- Standing rows should highlight the current logged-in user.
- The right-side profile panel intentionally hides `Total Players` and `Standard transfer cost` to keep the personal info area focused on actionable stats.

## Release Workflow
- After validating code changes, the agent should push and deploy by default unless the user says not to.
- The final response must state what was deployed and still include the exact reproducible command block for the user.

## Keep Updated
- Replace stale entries instead of growing this file endlessly.
- Prefer durable decisions and current known behavior over temporary debugging notes.
