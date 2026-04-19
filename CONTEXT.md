# Project Context | 项目上下文
This file is the project's cross-conversation memory. Keep it concise, current, and bilingual after meaningful changes. / 这个文件是项目的跨会话记忆。每次有重要改动后，都要用精简且最新的中英文内容更新它。

## Current Product Shape | 当前产品形态
- Frontend lives in `frontend/` and deploys on Vercel. / 前端位于 `frontend/`，部署在 Vercel。
- Backend lives in `backend/` and runs on Cloudflare Workers + D1. / 后端位于 `backend/`，运行在 Cloudflare Workers + D1。
- The game is an NBA playoff-only fantasy product with 10-player rosters. / 这是一个仅覆盖 NBA 季后赛阶段的 fantasy 产品，每队 10 人阵容。
- The old floating `Design Docs` button is intentionally removed from the player-facing shell. / 旧的悬浮 `Design Docs` 按钮已从玩家端外壳中移除。

## Naming And Routes | 命名与路由
- User-facing leaderboard language is `Standing`, not `League`. / 面向用户的排行榜文案使用 `Standing`，不要用 `League`。
- Main leaderboard page is `/standing`; legacy `/leagues` is redirect-only. / 主排行榜页面是 `/standing`；旧的 `/leagues` 仅保留跳转用途。
- Team identity should be shown as `Team Name`; do not reintroduce separate `Player Name` UI unless explicitly requested. / 队伍身份默认显示 `Team Name`，除非用户明确要求，否则不要重新引入单独的 `Player Name` UI。
- `/schedule` now uses April, May, and June month calendars as the main view. Each game renders as one row with away on the left, home on the right, a `Day1`-style badge in the date header, and an `R1G1`-style label under the score. / `/schedule` 现在以 4 月、5 月、6 月的月历作为主视图。每场比赛按单独一行展示，左侧客队、右侧主队，日期头显示 `Day1` 样式标记，比分下方显示 `R1G1` 样式标签。
- `/schedule` also shows a `Playoff Path` bracket under the calendars, aggregating each playoff series into a big-score elimination route view. / `/schedule` 也会在月历下方显示 `Playoff Path` 晋级路线图，把每个季后赛系列赛聚合成大比分淘汰路线视图。
- Final games in the schedule calendars should color the winning side green and the losing side red, while keeping the center score area white. / `schedule` 月历里的已结束比赛应把赢球一侧标绿、输球一侧标红，并保持中间比分区域为白底留白。
- Clicking a game row in the schedule calendars should open a matchup detail modal showing both teams' fantasy box score tables, including `PTS`, `REB`, `AST`, `STL`, `BLK`, `TOV`, and the fantasy total. / 点击 `schedule` 月历中的比赛行应打开对阵详情弹窗，显示双方球队的 fantasy 数据表，包含 `PTS`、`REB`、`AST`、`STL`、`BLK`、`TOV` 和 fantasy 总分。
- Schedule month calendars should hide any full week row that contains no games, so empty leading rows like April 1-12 do not render. / `schedule` 月历应隐藏整周都没有比赛的周行，因此像 4 月 1-12 这种前置空白两行不再渲染。
- Current playoff `gameId` parsing uses the two-digit series segment near the end of the id: `10-17` for Round 1, `20-23` for Round 2, `30-31` for Round 3, and `40` for the Finals. Schedule round badges, stage labels, and `Playoff Path` must stay aligned with that format. / 当前季后赛 `gameId` 的解析应使用靠近末尾的两位系列赛编号：`10-17` 表示第一轮，`20-23` 表示第二轮，`30-31` 表示分区决赛，`40` 表示总决赛。赛程轮次标签、阶段文案和 `Playoff Path` 都必须与这套格式保持一致。

## Live Gameplay Rules | 当前生效玩法规则
- `Day 1` is the real playoff opener on `2026-04-18`. / `Day 1` 是实际季后赛揭幕日，日期为 `2026-04-18`。
- `Points` stay hidden until the `Day 1` deadline passes. / `Points` 在 `Day 1` 截止前保持隐藏。
- Before the `Day 1` deadline, transfers are unlimited setup moves and do not consume playoff FT or `Total transactions`. / 在 `Day 1` 截止前，转会属于无限次建队调整，不消耗季后赛 FT，也不计入 `Total transactions`。
- After the `Day 1` deadline, each team gets `6` total playoff FT; every extra normal transfer costs `-50`. / `Day 1` 截止后，每支队伍整个季后赛共有 `6` 次 FT；额外普通转会每次扣 `-50`。
- `Wildcard` and `All-Star` stay locked until after the `Day 1` deadline. Each manager has one of each for the whole playoff run. / `Wildcard` 和 `All-Star` 在 `Day 1` 截止前保持锁定；每位玩家整个季后赛各有一张。
- If a chip is activated after normal transfers were already confirmed for the same gameday, those transfers stay but that gameday's FT usage and transfer penalties are cleared. / 如果同一比赛日里先确认了普通转会，之后再开 chip，这些转会仍保留，但该比赛日的 FT 消耗和转会罚分会被清零。
- There is no per-team player cap during the playoffs. / 季后赛阶段没有单支 NBA 球队选人上限。
- Play-in games (`005...`) are excluded from schedule, scoring, and standings. / 附加赛（`005...`）不计入赛程、得分和排行榜。
- There is no captain feature in gameplay; stored `captain_id` is backward-compatibility only and should be ignored. / 当前玩法没有 captain 功能；存储中的 `captain_id` 仅为兼容旧数据，应被忽略。
- Fantasy scoring is `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`. / Fantasy 计分规则是 `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`。
- Effective scoring counts up to 5 active players and must end in a valid `3BC + 2FC` or `2BC + 3FC` shape. Use starters first, then fill starter vacancies from bench order. / 有效得分最多统计 5 名实际计分球员，且最终必须满足 `3BC + 2FC` 或 `2BC + 3FC` 的合法阵型。优先使用首发，首发空位再按替补顺序补位。

## UI And Data Notes | UI 与数据说明
- New users should default `teamName` to `gameId`. Legacy `<gameId> Squad` team names should be normalized in UI display. / 新用户默认 `teamName` 应等于 `gameId`；历史上的 `<gameId> Squad` 默认队名在 UI 中应归一化显示。
- Standing rows should highlight the current logged-in user with a deeper blue background that remains highlighted on hover. / `Standing` 中当前登录用户所在行应使用更深的蓝色高亮，并且 hover 时保持高亮。
- The right sidebar on another manager's `Points` page should show that viewed manager's snapshot, not the current viewer's own profile. / 查看其他玩家的 `Points` 页面时，右侧信息栏应显示被查看玩家的资料，而不是当前登录用户自己的资料。
- `Points` lineup cards should highlight effective scoring players in yellow, and that highlight must stay aligned with the real scoring logic. / `Points` 阵容卡片应以黄色高亮实际计入得分的球员，并且该高亮必须与真实计分逻辑保持一致。
- The `/standings` API refreshes each roster's current scoring-period points before ranking, and the `Standing` page polls while visible so live ordering stays aligned with `Points`. / `/standings` API 会在排行前刷新每支队伍当前计分周期的分数，`Standing` 页面在可见时也会轮询，因此实时排名与 `Points` 保持一致。
- The Home page shows a daily leaders strip above the account card, using live official box scores to surface the current scoring day's top five `FC` and top five `BC` fantasy scorers with headshots. / Home 页会在账号卡片上方显示每日领跑模块，基于官方实时 box score 展示当前计分日 `FC` 和 `BC` 各前五 fantasy 得分球员，并带头像。
- Fantasy scores should render as whole numbers with no decimals across `Points`, `Standing`, sidebar stats, and Home daily leaders. / `Points`、`Standing`、右侧信息和 Home 每日领跑里的 fantasy 分数都应显示为整数，不带小数。
- On the transactions page, player-selection rows should open from the whole row, and if both FC and BC replacement slots are open the picker should allow any player and auto-assign to the matching slot. / 在 transactions 页面，球员选择应支持整行点击；当 FC 和 BC 替换槽同时打开时，选择器应允许选择任意球员并自动分配到对应位置。
- On the transactions summary cards, keep `FT Used` and remove the separate `FT Remaining` card. / transactions 顶部摘要卡保留 `FT Used`，去掉单独的 `FT Remaining` 卡片。
- Avoid extra descriptive UI copy unless explicitly requested or needed to prevent confusion. / 除非用户明确要求，或确实有助于避免误解，否则不要额外添加说明性 UI 文案。

## Risk And Operations | 风险与运维
- The current local SQLite DB and remote D1 DB were manually cleaned down to a single surviving account: `Test1`. / 当前本地 SQLite 和远端 D1 数据库都曾被手动清理到只保留一个账号：`Test1`。
- Because the site is live with real players, any future change that could affect live data or alter player progress must be surfaced before implementation and requires explicit approval. Pure UI changes are exempt. / 由于站点已上线且有真实玩家参与，任何可能影响线上数据或改变玩家进度的改动都必须先明确告知并获得批准；纯 UI 改动除外。
- `Agents.md` and `CONTEXT.md` must stay bilingual. / `Agents.md` 和 `CONTEXT.md` 必须继续保持中英文双语。

## Release Workflow | 发布流程
- Do not push or deploy by default. Only run `git push` or deployment commands when the user explicitly asks. / 默认不要执行 `git push` 或部署命令。只有用户明确要求时才执行。
- Final responses for deployable changes must still end with the exact command block the user should run next. / 只要改动涉及可部署代码，最终回复仍必须以用户下一步应执行的精确命令块结尾。
