export interface DesignDocItem {
  id: string;
  title: string;
  date: string;
  content: string;
}

export const designDocs: DesignDocItem[] = [
  {
    id: "doc-1",
    title: "UI Clone Strategy",
    date: "2026-04-09",
    content: `# UI Clone Strategy

## Goal
Recreate the NBA Fantasy playoff look with strong blue and yellow branding, right information rail, and card-based roster layout.

## Layout
- Top hero banner and primary tabs
- Main content panel and optional right sidebar
- Gray shell with white inner cards

## Visual Tokens
- Brand blue: #1f4ea1
- Highlight yellow: #f4d23c
- Score pink: #e5165a
- Typography: Oswald + Rajdhani

## Interaction
- Active tab highlight
- Captain toggle in lineup page
- Transfer action with free-transfer counter`
  },
  {
    id: "doc-2",
    title: "API Draft",
    date: "2026-04-09",
    content: `# API Draft

## Endpoints
- /auth/login
- /profile
- /lineup
- /points/today
- /transactions/options
- /transactions
- /leagues
- /schedule
- /help/rules

## Principles
- SQLite-backed auth, roster, and transaction state
- NBA Fantasy bootstrap data for the player pool
- Response shapes aligned to page blocks
- Easy migration path to DB-backed services`
  },
  {
    id: "doc-3",
    title: "Roadmap",
    date: "2026-04-09",
    content: `# Roadmap

## Short term
- Real NBA data ingestion
- Deadline lock for gameweek changes
- Private league invite flow

## Mid term
- Redis caching for schedules and points
- Weekly trend and rank report cards
- Extra transfer penalty rules

## Engineering debt
- Authentication middleware
- API schema validation and error codes
- End-to-end test coverage`
  },
  {
    id: "doc-4",
    title: "Initial Team Builder",
    date: "2026-04-10",
    content: `# Initial Team Builder

## Goal
Let a newly registered user create an empty-to-playable playoff roster before entering the normal lineup and transfer flow.

## Flow
- Register or log in.
- If the roster is empty, Edit line-up opens the team builder.
- User selects exactly 10 players with a 100 budget.
- Roster must contain 5 Back Court and 5 Front Court players.
- Create Team saves the roster, sets a default Starting 5, and unlocks line-up editing.

## Data
- Player pool is imported from NBA Fantasy bootstrap data.
- Game rules live in SQLite game_rules: initial_budget, weekly_free_transfers, first_deadline.
- Transactions are limitless before first_deadline and limited to weekly_free_transfers after it.`
  },
  {
    id: "doc-5",
    title: "Original Site UI Pass",
    date: "2026-04-10",
    content: `# Original Site UI Pass

## Goal
Bring the prototype closer to the original NBA Fantasy visual system using the provided index.css and index.js as local references.

## Source Cues
- Active nav tabs use yellow #ffdb4d on a dark NBA-blue bar.
- Content cards use white bodies, grey-blue gradient headers, fine #d8d8d8 table borders, and compact shadows.
- Player cards use a narrow uppercase sports headline style, team code, info dot, score/salary footer, and blue/red team-like accents.
- The roster builder follows a two-column pattern: selected squad on the left and player selection/filter table on the right.

## Applied Changes
- Updated shared Tailwind tokens and CSS variables to match the original theme values.
- Rebuilt the site chrome with the red top strip, white hero lockup, dark blue nav bar, and original-style tab behavior.
- Added reusable classes for panels, tables, yellow/blue buttons, stat cards, right-sidebar cards, player cards, and builder metrics.
- Restyled Initial Team Builder to show 10 roster slots and a denser Player Selection table.

## Asset Handling
The original bundle references Action NBA font files and NBA CDN image URLs. Fonts still use a fallback display stack, while player headshots and team logos are now supported through local public assets with NBA CDN fallback URLs.`
  },
  {
    id: "doc-6",
    title: "NBA Image Assets",
    date: "2026-04-10",
    content: `# NBA Image Assets

## Goal
Use real player headshots and team logos in the prototype while keeping the app reliable for local play.

## Asset Strategy
- Local assets are preferred because the game will be used by a small friend group and should not depend on CDN availability.
- Player files are normalized from \`nba-headshots-520x380/{code}-TEAM-NAME.png\` into \`frontend/public/nba/headshots/{code}.png\`.
- Team logo files are normalized from \`nba-team-logos/{team-slug}.png\` into \`frontend/public/nba/team-logos/{teamCode}.png\`.
- API responses include local URLs first and NBA CDN URLs as image error fallbacks.

## Updated Surfaces
- Header hero now uses local player headshots with CDN fallback.
- Player cards show real player headshots and team logos.
- Initial Team Builder shows small player thumbnails and selected-squad team logos.
- Schedule rows show local team logos with CDN fallback.

## Data Contract
Player objects may include: \`code\`, \`teamCode\`, \`headshotUrl\`, \`headshotFallbackUrl\`, \`teamLogoUrl\`, \`teamLogoFallbackUrl\`.

Schedule game objects may include \`homeTeam\` and \`awayTeam\` objects with \`name\`, \`code\`, \`logoUrl\`, and \`logoFallbackUrl\`.`
  },
  {
    id: "doc-7",
    title: "Preseason State And DB Inspect",
    date: "2026-04-11",
    content: `# Preseason State And DB Inspect

## Transactions Fix
- The transfer market endpoint now uses explicit SQL table aliases when excluding roster player ids.
- This fixes the \`/api/transactions/options\` 500 error caused by an ambiguous \`id\` reference after joining \`players\` and \`teams\`.

## Preseason Rules
- Current prototype \`first_deadline\` is set to \`2026-04-20T00:00:00Z\`.
- Before that deadline, profile surfaces show:
  - \`overallPoints = 0\`
  - \`overallRank = 0\`
  - \`gamedayPoints = 0\`
  - \`totalPlayers = 0\`
- Existing user states were normalized to those preseason defaults.

## Score Scaling
- Imported NBA Fantasy point totals are stored in tenths.
- Player-facing values now divide \`event_points\`, \`total_points\`, and \`points_per_game\` by 10 before returning them to the frontend.

## Position Color Rule
- \`FC\` uses the red treatment.
- \`BC\` uses the blue treatment.

## DB Visibility
- Registration data is stored in SQLite:
  - \`backend/data/playoff-fantasy.db\`
- Primary tables:
  - \`users\`: account, game_id, password hash, created time
  - \`sessions\`: login token to user mapping
  - \`user_states\`: roster, captain, bank, transfers, profile state
- Quick inspect command:
  - \`npm run db:users\`
- Optional filter:
  - \`npm run db:users -- levine\``
  },
  {
    id: "doc-8",
    title: "Transactions Desk",
    date: "2026-04-11",
    content: `# Transactions Desk

## Goal
Rebuild the Transactions page to match the original NBA Fantasy transfer desk structure more closely.

## Layout
- Top summary panel with deadline, action buttons, and transaction finance stats.
- Left column shows the current roster grouped by Front Court then Back Court.
- Right column is a Player Selection rail with filters and grouped market results.
- Bottom action is a single Make Transactions button after choosing one outgoing and one incoming player.

## Left Roster List
- Each row includes:
  - info badge
  - player headshot
  - player name
  - team + position
  - salary
  - fantasy average
  - total points
  - schedule/opponent text with team logo slot
- Selected outgoing player is highlighted with a yellow-tinted background.

## Player Selection Rail
- Filters:
  - view
  - sorted by
  - search player list
  - max cost
- Results are grouped by FC and BC.
- Default display shows the top 5 players per group after applying the current sort and filter state.

## Interaction Rules
- User clicks a left-side row to choose who goes out.
- User clicks a right-side row to choose who comes in.
- Incoming player must match the outgoing player's position group.
- Cost and projected money remaining update before submit.`
  }
];
