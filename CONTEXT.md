# Project Context | 项目上下文
This file is the cross-conversation memory for the repo. Keep it concise, current, and bilingual. / 这是仓库的跨会话记忆文件，需要保持精炼、最新，并且中英双语。

## Product Shape | 产品形态
- Frontend lives in `frontend/` and deploys on Vercel. / 前端位于 `frontend/`，部署到 Vercel。
- Backend lives in `backend/` and runs on Cloudflare Workers + D1. / 后端位于 `backend/`，运行在 Cloudflare Workers + D1。
- Shared business rules should stay reusable instead of leaking runtime-specific logic across apps. / 共享业务规则要保持可复用，不要把运行时专属逻辑混到另一侧。
- The product is an NBA playoff-only fantasy game with 10-player rosters. / 这是一个仅覆盖 NBA 季后赛的 fantasy 产品，每队 10 人阵容。

## Core Routes | 核心路由
- User-facing leaderboard language is `Standing`, not `League`. / 面向用户的排行榜文案使用 `Standing`，不用 `League`。
- Main leaderboard page is `/standing`; legacy `/leagues` is redirect-only. / 主排行榜页面是 `/standing`；旧的 `/leagues` 只保留跳转。
- `/points` is the per-manager daily scoring page with the roster view and right sidebar snapshot. / `/points` 是单个经理的每日得分页，包含阵容展示和右侧资料快照。
- `/schedule` uses April, May, and June month calendars as the main view, plus `Playoff Path` and a matchup detail modal. / `/schedule` 以 4、5、6 月月历为主视图，同时展示 `Playoff Path` 和比赛详情弹窗。

## Live Rules | 当前玩法规则
- `Day 1` is the real playoff opener on `2026-04-18`. / `Day 1` 是真实季后赛揭幕日 `2026-04-18`。
- `Points` stay hidden until the `Day 1` deadline passes. / `Points` 会在 `Day 1` 截止前保持隐藏。
- Before the `Day 1` deadline, transfers are unlimited setup moves and do not consume playoff FT or `Total transactions`. / `Day 1` 截止前的转会属于无限次建队调整，不消耗季后赛 FT，也不计入 `Total transactions`。
- After the `Day 1` deadline, each team gets `6` total playoff FT and every extra normal transfer costs `-50`. / `Day 1` 截止后，每队整个季后赛共有 `6` 次 FT，额外普通转会每次扣 `-50`。
- `Wildcard` and `All-Star` unlock only after the `Day 1` deadline, with one of each per manager for the full playoff run. / `Wildcard` 和 `All-Star` 只会在 `Day 1` 截止后解锁；每位经理整个季后赛各有一张。
- Play-in games (`005...`) are excluded from schedule, scoring, and standings. / 附加赛（`005...`）不计入赛程、得分和排行榜。
- Fantasy scoring is `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`. / Fantasy 计分规则是 `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`。
- Effective scoring counts up to 5 active players and must end in a valid `3BC + 2FC` or `2BC + 3FC` shape, using starters first and then bench order to fill gaps. / 有效计分最多统计 5 名有比赛的球员，并且最终必须满足 `3BC + 2FC` 或 `2BC + 3FC` 的合法阵型，优先使用首发，再按替补顺序补位。
- For gamedays on or after `2026-04-20`, a player who still has not appeared by Beijing `16:00` is treated as a non-participant for that gameday, so later bench players may replace them. / 对于 `2026-04-20` 及之后的 gameday，如果球员到北京时间 `16:00` 仍未实际出场，则该球员在该日视为未上场，后续替补可以递补。

## UI Notes | UI 约定
- Standing highlights the logged-in user with a deeper blue row that stays highlighted on hover. / Standing 会用更深的蓝色高亮当前登录用户，并在 hover 时保持高亮。
- On another manager's `/points` page, the right sidebar must show the viewed manager's snapshot, not the current viewer's own profile. / 查看其他经理的 `/points` 页面时，右侧栏必须显示被查看经理的快照，而不是当前登录者自己的资料。
- Effective scoring players on `/points` are highlighted in yellow, and that highlight must stay aligned with the real scoring logic. / `/points` 里的有效计分球员会用黄色高亮，并且必须和真实计分逻辑一致。
- Fantasy scores render as whole numbers with no decimals across Standing, Points, sidebars, and Home leaders. / Standing、Points、侧栏和 Home leaders 中的 fantasy 分数都显示为整数，不显示小数。
- `Daily Fantasy Leaders` belongs at the bottom of `/points`, after the roster sections, not directly under the gameday summary card. / `Daily Fantasy Leaders` 应该放在 `/points` 页最底部、阵容区块之后，而不是直接放在当日总分卡下面。
- Home leaders score rendering should fall back to `entry.player.points` when `entry.points` is missing so the UI does not show an empty score band. / Home leaders 的分数渲染在 `entry.points` 缺失时要回退到 `entry.player.points`，避免分数条出现空白。

## Data And Sync Notes | 数据与同步说明
- `/api/standings` refreshes current-period points before ranking, but the Standing page should only keep polling during live games or the Beijing `16:00` settlement window. / `/api/standings` 会在排名前刷新当前计分日分数，但 Standing 页面只应在比赛进行中或北京时间 `16:00` 结算窗口持续轮询。
- Standing polling cadence comes from backend response fields `refreshIntervalMs` and `nextRefreshAt`; do not hardcode a fixed frontend interval there. / Standing 的轮询节奏来自后端返回的 `refreshIntervalMs` 和 `nextRefreshAt`；不要在前端重新写死固定间隔。
- Current scoring-day lineups must lock at the deadline; post-deadline reorders should affect only the next editable day. / 当前计分日的阵容必须在截止时锁定；截止后的调序只能影响下一可编辑日。
- Backend lineup locks are stored in `app_state` under `lineup_locks_v1`, with optional manual overrides in `lineup_corrections_v1`. / 后端阵容锁存放在 `app_state` 的 `lineup_locks_v1` 中，可选人工修正放在 `lineup_corrections_v1`。
- `GET/PUT /api/lineup` must use the active `All-Star` lineup snapshot when that chip is live for the current editable period. / 当当前可编辑周期存在生效中的 `All-Star` 时，`GET/PUT /api/lineup` 必须读写对应的激活阵容快照。

## Risks And Workflow | 风险与流程
- Any change that could affect live data or player progress must be surfaced before implementation and requires explicit approval; pure UI changes are exempt. / 任何可能影响线上数据或玩家进度的修改，都必须先说明影响并获得明确批准；纯 UI 修改除外。
- Do not push or deploy by default. Only run `git push` or deployment commands when the user explicitly asks. / 默认不要执行 `git push` 或部署命令；只有用户明确要求时才执行。
- Final responses for deployable changes must still end with the exact command block the user should run next. / 只要改动涉及可部署代码，最终回复仍必须以用户下一步应执行的精确命令块结尾。

## Latest Change | 最新变更
- The latest UI change keeps `Daily Fantasy Leaders` at the bottom of `/points`, removes the team abbreviation from each leader card, removes the score prefix label, and renders the score itself in black with a fallback path so it remains visible even if one payload field is missing. / 最新 UI 变更保持 `Daily Fantasy Leaders` 位于 `/points` 页底部，移除了每张 leaders 卡片里的球队缩写，去掉了分数前缀标签，并把实际分数改为黑色，同时保留兜底取值路径，这样即使某个返回字段缺失，分数仍然可见。
- `CourtPlayerCard` on both `/edit-lineup` and `/points` now uses a portrait-first layout with the headshot pushed upward and widened to roughly `84%` to `92%` of the card width so the shoulders visually brace against the card edges; `/points` also switches to a pink-purple gradient highlight when `points / salary > 5` or `points > 50`. / `/edit-lineup` 和 `/points` 的 `CourtPlayerCard` 现在使用以人物为主的版式，头像整体上移，并把宽度大致调到卡片宽度的 `84%` 到 `92%`，让肩膀视觉上顶住卡片边缘；同时 `/points` 在 `points / salary > 5` 或 `points > 50` 时会切换为粉紫渐变高亮。
