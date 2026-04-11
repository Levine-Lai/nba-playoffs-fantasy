# NBA Playoff Fantasy PRD

## Version
| Field | Value |
|---|---|
| Document Version | v0.2 |
| Date | 2026-04-10 |
| Status | Review-ready |

## 1. Overview
### 1.1 Background
Current fantasy gameplay ends with regular season. Users want a playoff mode to keep competing with friends.

### 1.2 Product Summary
Users set a 10-player squad before playoff rounds, get weekly free transfers, earn points from real player performances, and compete in league rankings. MVP uses the NBA Fantasy bootstrap API as the initial player database source.

### 1.3 Goals
- Business goal: retain engagement during playoff period.
- User goal: continue friend-league competition after regular season.
- MVP goal: deliver a playable end-to-end prototype with core pages and APIs.

### 1.4 Target Users
- NBA fans familiar with fantasy basics.
- Social competitive players in private leagues.

### 1.5 Terms
- Gameweek: playoff weekly cycle.
- Free Transfer: weekly transfer quota with no penalty.
- Captain: selected player with 1.5x multiplier.

## 2. Scope
### 2.1 MVP Pages
- Home
- Edit line-up
- Points
- Transactions
- Leagues
- Schedule
- Help

### 2.2 Core Flow
```mermaid
flowchart LR
A[Home Login] --> B[Edit Line-up]
B --> C[Points]
B --> D[Transactions]
C --> E[Leagues]
B --> F[Schedule]
B --> G[Help]
D --> B
```

### 2.3 Global Rules (MVP)
- Roster size fixed to 10 players.
- Initial roster must contain exactly 5 Back Court (`BC`) and 5 Front Court (`FC`) players.
- Initial roster budget defaults to 100.
- New accounts start with an empty roster and must create a team before editing lineup, viewing points, or making transfers.
- 5 starters count toward daily score.
- Captain receives 1.5x score multiplier.
- Weekly free transfer quota defaults to 2. [Assumption]
- Transfers are unlimited before the configured first deadline.
- Points are hidden before the configured first deadline.

## 3. Functional Requirements
### 3.1 Home
- Register with account, game ID, password, and confirm password.
- Login with account and password.
- Return token and user profile.
- Show error when required fields are missing, passwords do not match, account exists, or game ID exists.

### 3.2 Edit line-up
- If user has no roster, show the initial team builder.
- Initial team builder shows selected squad on the left and player selection on the right.
- Player selection supports search, position filter, team filter, max cost filter, and sorting.
- Create Team validates 10 unique players, 5 `BC`, 5 `FC`, and total salary <= 100.
- Show gameweek and deadline.
- Show starters and bench cards.
- Allow captain selection.
- Save lineup.

### 3.3 Points
- Before first deadline, show locked state and do not display daily points.
- If user has no roster, ask user to create the initial team first.
- Show average/final/top game-day points.
- Show player point cards for starters and bench.

### 3.4 Transactions
- If user has no roster, ask user to create the initial team first.
- Before first deadline, show limitless transfer mode.
- After first deadline, enforce weekly free transfer quota.
- Show free transfers left and finance metrics.
- Select outgoing and incoming players.
- Confirm transfer and refresh lineup/market.
- Show transfer history.

### 3.5 Leagues
- Show private/public/global league tables.
- Show current rank, previous rank, and rank delta.

### 3.6 Schedule
- Show games grouped by date.
- Show gameweek header and tipoff times.

### 3.7 Help
- Show roster rules.
- Show scoring table.
- Show weekly gameplay guide.

## 4. Non-functional Requirements
### 4.1 Performance
- First meaningful view under 3 seconds in local environment. [To confirm]
- API P95 under 500ms for MVP mock.

### 4.2 Security
- Token should not be exposed in URLs.
- Add authentication middleware in production phase. [To confirm]

### 4.3 Observability
- Log key events: login, lineup save, transfer submit.
- Capture API-level error logs.

### 4.4 Integration
- MVP stores accounts, rosters, teams, players, and game rules in SQLite.
- Player data is imported from `https://nbafantasy.nba.com/api/bootstrap-static/`.
- Future work should add live playoff schedule and box-score scoring integration. [To confirm]

## 5. Data Dictionary
### 5.1 Player
| Field | Type | Required | Description |
|---|---|---|---|
| id | string | Yes | Player ID |
| name | string | Yes | Player name |
| team | string | Yes | Team code |
| position | string | Yes | BC/FC |
| salary | number | Yes | Salary value |
| points | number | No | Daily fantasy points |
| canSelect | boolean | No | Whether player can be selected |
| canTransact | boolean | No | Whether player can be transferred |

### 5.2 User State
| Field | Type | Required | Description |
|---|---|---|---|
| userId | number | Yes | Account owner |
| starters | Player[] | Yes | Starting 5 |
| bench | Player[] | Yes | Bench 5 |
| captainId | string | No | Captain player ID |
| rosterValue | number | Yes | Sum of roster salary |
| bank | number | Yes | Budget remaining |
| usedThisWeek | number | Yes | Transfers used in the current week |

### 5.3 Transaction
| Field | Type | Required | Description |
|---|---|---|---|
| outPlayerId | string | Yes | Outgoing player ID |
| inPlayerId | string | Yes | Incoming player ID |
| timestamp | ISO string | No | Transaction timestamp |

### 5.4 Game Rules
| Field | Type | Required | Description |
|---|---|---|---|
| initial_budget | number | Yes | Default 100 |
| weekly_free_transfers | number | Yes | Default 2 |
| first_deadline | ISO string | Yes | Unlock point scoring and switch transfers from limitless to limited |

## 6. Acceptance Criteria
- Login endpoint returns token.
- New account starts with empty roster.
- Initial team builder can create a legal 10-player roster.
- Illegal initial teams are rejected when over budget or not 5 `BC` + 5 `FC`.
- Edit line-up can save captain choice.
- Points are locked before first deadline.
- Points page renders summary and player cards.
- Transactions are limitless before first deadline and limited after first deadline.
- Transactions can complete at least one transfer and show history.
- Leagues/Schedule/Help pages render expected sections.
- Frontend `npx tsc --noEmit` passes.
- Frontend `npm run build` passes.

## 7. Open Questions
1. Should free transfer quota always be 2 per week?
2. Should over-limit transfers apply score penalty (for example -4)?
3. Should bench auto-substitute before tipoff lock?
4. Is league admin flow required in MVP?
5. Which live box-score source is preferred for production scoring?
6. Should first playoff deadline be set manually by league admin or inferred from schedule import?
