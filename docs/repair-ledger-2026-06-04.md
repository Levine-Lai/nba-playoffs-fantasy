# 2026-06-04 Ledger Repair Report

## Status
- Remote D1 repair was applied with `node backend\scripts\repair-remote-ledger-2026-06-04.mjs --apply`.
- The repair covered finalized playoff scoring periods Day 1 through Day 39.
- Day 40 was intentionally left untouched because it was still the current/live scoring day at repair time.
- The post-apply verification rerun was idempotent for actual points: `filled=0`, `changed=0`, `unchanged=975`, `warnings=[]`.

## Root Causes
- Transfer confirmation mutated `user_states` before ensuring the current scoring day's lineup was locked. A transfer made after a scoring deadline could therefore remove that player's already-earned points from the same day.
- Historical roster replay only rewound transfers whose `windowKey` date was after the target day. Same-day transfers made after the deadline were not rewound, so previous-day score reconstruction could accidentally use the new roster.
- The zero-day display came from incomplete or stale league ledger state: several finalized days had missing actual ledger entries, so history and standings displayed `0` instead of recalculated final scores.

## Runtime Fix
- `POST /api/transactions/confirm` and legacy `POST /api/transactions` now lock the current scoring lineup before committing roster changes.
- `buildRosterStateForPeriod` now compares transfer timestamps with the target period deadline and rewinds same-day post-deadline transfers.
- Result: selling a player after a scoring deadline no longer changes that player's already-earned points for that day; the transfer only applies from the next eligible scoring day.

## Remote Data Repair
- Processed users with complete rosters: 25.
- Processed finalized periods: 39, from Day 1 through Day 39.
- Actual ledger entries filled: 156.
- Actual ledger entries changed: 50.
- Actual ledger entries unchanged during apply: 769.
- Penalty ledger entries changed or removed: 0.
- Repaired lineup lock entries generated: 177.
- `user_states.overall_points` and `user_states.overall_rank` were recalculated from the repaired ledger.
- `standing_payload_cache_v1` was cleared so standings rebuild from corrected data.

## Day Summary

| Day | Period | Filled | Changed | Explicit Zero After Repair |
| --- | --- | ---: | ---: | ---: |
| Day 1 | day:2026-04-18 | 0 | 1 | 1 |
| Day 2 | day:2026-04-19 | 0 | 0 | 0 |
| Day 3 | day:2026-04-20 | 0 | 0 | 1 |
| Day 4 | day:2026-04-21 | 0 | 0 | 0 |
| Day 5 | day:2026-04-22 | 0 | 0 | 0 |
| Day 6 | day:2026-04-23 | 0 | 0 | 1 |
| Day 7 | day:2026-04-24 | 0 | 0 | 0 |
| Day 8 | day:2026-04-25 | 0 | 0 | 0 |
| Day 9 | day:2026-04-26 | 0 | 0 | 0 |
| Day 10 | day:2026-04-27 | 0 | 0 | 0 |
| Day 11 | day:2026-04-28 | 0 | 0 | 0 |
| Day 12 | day:2026-04-29 | 0 | 0 | 2 |
| Day 13 | day:2026-04-30 | 0 | 0 | 0 |
| Day 14 | day:2026-05-01 | 0 | 0 | 2 |
| Day 15 | day:2026-05-02 | 0 | 0 | 2 |
| Day 16 | day:2026-05-03 | 0 | 1 | 2 |
| Day 17 | day:2026-05-04 | 0 | 0 | 1 |
| Day 18 | day:2026-05-05 | 0 | 0 | 0 |
| Day 19 | day:2026-05-06 | 0 | 0 | 1 |
| Day 20 | day:2026-05-07 | 0 | 1 | 0 |
| Day 21 | day:2026-05-08 | 0 | 1 | 1 |
| Day 22 | day:2026-05-09 | 0 | 17 | 0 |
| Day 23 | day:2026-05-10 | 0 | 0 | 1 |
| Day 24 | day:2026-05-11 | 0 | 0 | 0 |
| Day 25 | day:2026-05-12 | 0 | 0 | 1 |
| Day 26 | day:2026-05-13 | 0 | 2 | 2 |
| Day 27 | day:2026-05-15 | 0 | 1 | 0 |
| Day 28 | day:2026-05-17 | 0 | 4 | 4 |
| Day 29 | day:2026-05-18 | 0 | 1 | 0 |
| Day 30 | day:2026-05-19 | 0 | 10 | 6 |
| Day 31 | day:2026-05-20 | 0 | 1 | 0 |
| Day 32 | day:2026-05-21 | 21 | 2 | 4 |
| Day 33 | day:2026-05-22 | 20 | 1 | 0 |
| Day 34 | day:2026-05-23 | 22 | 0 | 4 |
| Day 35 | day:2026-05-24 | 21 | 1 | 1 |
| Day 36 | day:2026-05-25 | 19 | 0 | 4 |
| Day 37 | day:2026-05-26 | 19 | 1 | 1 |
| Day 38 | day:2026-05-28 | 18 | 1 | 1 |
| Day 39 | day:2026-05-30 | 16 | 4 | 1 |

## Spot Checks
- `Test1` / `蒂尔尼想打篮球` changed from 3701 to 4711 total points.
- `Test1` Day 28 changed from 13 to 98, matching the visible player-card sum for that day: T.Harris 19 + J.Harden 25 + J.Duren 25 + D.Jenkins 29.
- `Test1` Day 32 through Day 39 were missing before repair and are now filled: 90, 142, 91, 86, 136, 129, 94, 152.
- After repair, Day 28 through Day 39 each have 25 actual ledger entries.

## Verification
- `npm run -s --prefix backend typecheck` passed.
- A post-apply verify-only calculation found no remaining actual-point fills or changes for Day 1 through Day 39.
