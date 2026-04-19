# Project Context | 项目上下文
This file is the cross-conversation memory for the repo. Keep it concise, current, and bilingual. / 这是仓库的跨会话记忆文件，需要保持精炼、最新、且中英双语。

## Product Shape | 产品形态
- Frontend lives in `frontend/` and deploys on Vercel. / 前端位于 `frontend/`，部署到 Vercel。
- Backend lives in `backend/` and runs on Cloudflare Workers + D1. / 后端位于 `backend/`，运行在 Cloudflare Workers + D1。
- The game is an NBA playoff-only fantasy product with 10-player rosters. / 这是一个只覆盖 NBA 季后赛的 fantasy 产品，每队 10 人阵容。

## Core Routes | 核心路由
- User-facing leaderboard language is `Standing`, not `League`. / 面向用户的排行榜文案用 `Standing`，不用 `League`。
- Main leaderboard page is `/standing`; legacy `/leagues` is redirect-only. / 主排行榜页面是 `/standing`；旧的 `/leagues` 只保留跳转。
- `/schedule` uses April, May, and June month calendars as the main view. / `/schedule` 以 4 月、5 月、6 月月历作为主视图。
- Each schedule game renders as one row, with away on the left, home on the right, `Day1` in the date header, and `R1G1` under the score. / 赛程中的每场比赛按单行展示，左客右主，日期头显示 `Day1`，比分下方显示 `R1G1`。
- `/schedule` also shows `Playoff Path` under the calendars and supports a matchup detail modal with both teams' fantasy box scores including `TOV`. / `/schedule` 还会在月历下方显示 `Playoff Path`，并支持打开双方 fantasy 数据弹窗，包含 `TOV`。

## Live Rules | 当前玩法规则
- `Day 1` is the real playoff opener on `2026-04-18`. / `Day 1` 是实际季后赛揭幕日 `2026-04-18`。
- `Points` stay hidden until the `Day 1` deadline passes. / `Points` 在 `Day 1` 截止前保持隐藏。
- Before the `Day 1` deadline, transfers are unlimited setup moves and do not consume playoff FT or `Total transactions`. / `Day 1` 截止前的转会属于无限次建队调整，不消耗季后赛 FT，也不计入 `Total transactions`。
- After the `Day 1` deadline, each team gets `6` total playoff FT; each extra normal transfer costs `-50`. / `Day 1` 截止后，每支队伍整个季后赛共有 `6` 次 FT；额外普通转会每次扣 `-50`。
- `Wildcard` and `All-Star` unlock only after the `Day 1` deadline. Each manager has one of each for the whole playoff run. / `Wildcard` 和 `All-Star` 只在 `Day 1` 截止后解锁；每位玩家整个季后赛各有一张。
- There is no per-team player cap during the playoffs. / 季后赛阶段没有单支球队选人上限。
- Play-in games (`005...`) are excluded from schedule, scoring, and standings. / 附加赛（`005...`）不计入赛程、得分和排行榜。
- There is no captain gameplay; stored `captain_id` is backward-compatibility only. / 当前没有 captain 玩法；存储中的 `captain_id` 仅用于兼容旧数据。
- Fantasy scoring is `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`. / Fantasy 计分规则是 `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`。
- Effective scoring counts up to 5 active players and must end in a valid `3BC + 2FC` or `2BC + 3FC` shape, using starters first and then bench order to fill gaps. / 有效得分最多统计 5 名有比赛的球员，且最终必须满足 `3BC + 2FC` 或 `2BC + 3FC` 的合法阵型，优先使用首发，再按替补顺序补位。

## UI Notes | UI 约定
- Standing highlights the logged-in user with a deeper blue row that stays highlighted on hover. / Standing 中当前登录用户使用更深蓝色高亮，hover 时保持高亮。
- The right sidebar on another manager's `Points` page must show the viewed manager's snapshot, not the current viewer's own profile. / 查看其他经理的 `Points` 页面时，右侧信息栏必须显示被查看经理的资料，而不是当前登录者自己的资料。
- Effective scoring players on the `Points` page are highlighted in yellow, and that highlight must stay aligned with the real scoring logic. / `Points` 页面的有效计分球员会用黄色高亮，且必须和真实计分逻辑一致。
- Fantasy scores render as whole numbers with no decimals across Standing, Points, sidebars, and Home leaders. / Standing、Points、侧栏和 Home leaders 中的 fantasy 分数都显示为整数，不显示小数。

## Data And Sync Notes | 数据与同步说明
- `/api/standings` refreshes current-period points before ranking, and the Standing page polls while visible so ordering stays aligned with Points. / `/api/standings` 会在排行前刷新当前计分日分数，Standing 页面在可见时轮询刷新，以保持与 Points 一致。
- Current scoring-day lineup must lock at the deadline. Any post-deadline lineup reorder should only affect the next editable day, not the current scoring day. / 当前计分日的阵容必须在 DDL 锁定；DDL 后的阵容调整只能影响下一个可编辑比赛日，不能反写当前计分日。
- Backend lineup locks are stored in `app_state` under `lineup_locks_v1`. Optional manual historical corrections can be provided via `lineup_corrections_v1`. / 后端锁阵容快照存放在 `app_state` 的 `lineup_locks_v1` 中；历史人工修正可通过 `lineup_corrections_v1` 提供。
- A built-in Day 1 correction currently restores `kusuri` to `169` using the captured 2026-04-19 13:20 evidence, because the original Day 1 bench order was not preserved in the old system. / 当前内置了一条 Day 1 修正，用 2026-04-19 13:20 的截图证据把 `kusuri` 还原到 `169`，因为旧系统没有保存原始 Day 1 的替补顺序。
- Historical cases that were already polluted before lineup locks existed cannot always be reconstructed from current DB state alone; confirmed evidence is needed before adding more manual corrections. / 在锁阵容机制上线前已经被污染的历史 case，无法总是仅靠当前 DB 状态自动反推；继续补更多人工修正时，需要有已确认的证据。

## Risks And Workflow | 风险与流程
- Any change that could affect live data or player progress must be surfaced before implementation and requires explicit approval. Pure UI changes are exempt. / 任何可能影响线上数据或玩家进度的改动，都必须先明确告知并获得批准；纯 UI 改动除外。
- Do not push or deploy by default. Only run `git push` or deployment commands when the user explicitly asks. / 默认不要执行 `git push` 或部署命令；只有用户明确要求时才执行。
- Final responses for deployable changes must still end with the exact command block the user should run next. / 只要改动涉及可部署代码，最终回复仍必须以用户下一步应执行的精确命令块结尾。
