# Project Context | 项目上下文

This file is the project's cross-conversation memory. Update it after every meaningful code, rules, schema, routing, or deployment-flow change so a new chat can recover the important context quickly. / 本文件是项目的跨会话记忆。每次有重要代码、规则、schema、路由或部署流程变更后，都要更新它，方便在新对话里快速恢复关键上下文。

## Current Product Shape | 当前产品形态
- Frontend lives in `frontend/` and is deployed on Vercel. / 前端位于 `frontend/`，部署在 Vercel。
- Backend lives in `backend/` and runs on Cloudflare Workers + D1. / 后端位于 `backend/`，运行在 Cloudflare Workers + D1。
- The game is a playoff-only NBA fantasy product with 10-player rosters. / 这是一个仅限季后赛阶段的 NBA fantasy 产品，每队 10 人阵容。
- The old floating `Design Docs` button is removed from the main app shell and should stay out of the player-facing UI unless explicitly brought back. / 旧的悬浮 `Design Docs` 按钮已经从主应用外壳移除，除非明确要求恢复，否则不要重新出现在玩家端 UI。
- The `Help` page is frontend-owned and should show both playoff-rule bullets and the scoring table. / `Help` 页面由前端维护，需同时展示季后赛规则要点和计分表。

## Naming And Route Conventions | 命名与路由约定
- User-facing leaderboard language is `Standing`, not `League`. / 面向用户的排行榜文案使用 `Standing`，不要用 `League`。
- Main leaderboard page is `/standing`. / 主排行榜页面是 `/standing`。
- Legacy `/leagues` now exists only as a redirect and should not receive new feature work. / 旧的 `/leagues` 现在只保留跳转用途，不应继续承载新功能开发。
- Team identity should be shown as `Team Name`; do not reintroduce separate `Player Name` UI unless explicitly requested. / 队伍身份展示为 `Team Name`；除非明确要求，不要重新引入单独的 `Player Name` UI。
- The `/schedule` page now uses month-calendar views for April, May, and June instead of the old gameday list; each game shows matchup logos, the score-only center label, the `Day X` tag on the date row, and an `R? G?` marker below the score, while unguaranteed placeholder games (such as conditional G5/G6/G7) stay hidden until the series state makes them certain. / `/schedule` 页面现已改为 4 月、5 月、6 月的月历视图，替代旧的按比赛日列表；每场比赛展示对阵双方 logo、仅比分的中间标签、日期行右侧的 `Day X` 标记，以及比分下方的 `R? G?` 标记；同时像条件成立前的 G5/G6/G7 这类尚未确定的占位赛程会继续隐藏，直到系列赛进展确认它们必然发生。

## Live Gameplay Rules | 当前生效玩法规则
- `Day 1` is the real playoff opener on `2026-04-18`. / `Day 1` 是实际季后赛揭幕日，日期为 `2026-04-18`。
- `Points` stay hidden until the `Day 1` deadline passes. / 在 `Day 1` 截止前，`Points` 保持隐藏。
- Before the `Day 1` deadline, transfers are unlimited setup moves and do not consume playoff FT. / 在 `Day 1` 截止前，转会属于不限次数的建队调整，不消耗季后赛 FT。
- Before the `Day 1` deadline, transfers also do not count toward `Total transactions`. / 在 `Day 1` 截止前，转会也不计入 `Total transactions`。
- After the `Day 1` deadline, each team gets `6` total playoff FT for the entire postseason. / `Day 1` 截止后，每支队伍整个季后赛总共只有 `6` 次 FT。
- Once those `6` FT are gone, each extra normal transfer costs `-50`. / `6` 次 FT 用完后，每一次额外普通转会扣 `-50`。
- `Wildcard` and `All-Star` must remain locked until after the `Day 1` deadline. / `Wildcard` 和 `All-Star` 必须在 `Day 1` 截止后才解锁。
- Each manager has one `Wildcard` and one `All-Star` chip for the full playoff run, matching regular-season chip behavior. / 每位玩家整个季后赛各有一张 `Wildcard` 和一张 `All-Star`，行为与常规赛芯片一致。
- If `Wildcard` or `All-Star` is activated after normal transfers were already confirmed for the same gameday, those confirmed transfers stay, but that gameday's FT usage and transfer penalties are cleared. / 如果同一比赛日里已经先确认了普通转会，之后再激活 `Wildcard` 或 `All-Star`，这些已确认转会会保留，但该比赛日已记录的 FT 消耗和转会罚分会被清零。
- There is no per-team player cap during the playoffs. / 季后赛阶段没有单支 NBA 球队选人上限。
- Play-in games (`005...`) are excluded from schedule, scoring, and standings logic. / 附加赛（`005...`）不纳入赛程、计分和排名逻辑。
- There is no captain feature in the game: no captain selection UI, no captain marker, and no captain score multiplier. / 当前没有 captain 功能：没有 captain 选择 UI、没有 captain 标记、也没有 captain 分数倍率。
- Fantasy scoring weights are `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`. / Fantasy 计分权重是 `PTS x1 + REB x1 + AST x2 + STL x3 + BLK x3 - TOV x1`。
- Standings should display effective scoring, including penalties and valid negative totals. / 排名页应展示有效得分，包含罚分和合法负分结果。
- Effective scoring follows valid lineup-shape rules: count up to 5 scoring players, use starters first, fill starter vacancies from bench order when needed, and keep the final counted group valid as either `3BC + 2FC` or `2BC + 3FC`. / 有效得分遵循合法阵容结构规则：最多统计 5 名得分球员，优先使用首发；若首发里有未上场导致空位，则按替补顺序补位；最终被统计的 5 人必须仍满足 `3BC + 2FC` 或 `2BC + 3FC`。

## Data And State Notes | 数据与状态说明
- Registration still uses `account` plus unique `gameId`. / 注册仍使用 `account` 加唯一 `gameId`。
- New users should default `teamName` to `gameId`. / 新用户的默认 `teamName` 应等于 `gameId`。
- Old `teamName` values that look like `<gameId> Squad` should be treated as legacy defaults and normalized in UI display. / 旧的、形如 `<gameId> Squad` 的 `teamName` 视为历史默认值，UI 展示时应做归一化处理。
- Standing rows should highlight the current logged-in user with a deeper blue background that stays highlighted on hover. / 排名列表中当前登录用户应使用更深的蓝色高亮背景，并在鼠标悬停时保持高亮。
- The right-side profile panel intentionally hides `Total Players` and `Standard transfer cost` to keep the personal info area focused on actionable stats. / 右侧个人信息面板故意隐藏 `Total Players` 和 `Standard transfer cost`，让信息区域聚焦在可操作数据上。
- On the transactions page, player-selection rows should open the candidate modal from the whole row, not just the headshot, and when both FC and BC replacement slots are open the picker should allow any player and auto-assign to the matching position slot. / 在 transactions 页面里，`Player Selection` 的整行都应能打开候选球员弹窗，而不只是头像；当 FC 和 BC 替换槽同时打开时，选择器应允许点击任意球员，并自动分配到对应位置的空槽。
- On the transactions page, the main submit button should turn yellow whenever there are unconfirmed transfer drafts, and stay in its default style when the roster is unchanged. / 在 transactions 页面里，只要存在未确认的转会草稿，主提交按钮就应变成黄色；如果阵容仍未变动，则保持默认样式。
- On the transactions summary cards, keep `FT Used` and remove the separate `FT Remaining` card to avoid duplicate FT information. / 在 transactions 顶部摘要卡片里，保留 `FT Used`，去掉单独的 `FT Remaining` 卡片，避免 FT 信息重复展示。
- Avoid adding extra descriptive UI copy unless it is explicitly requested or required to prevent confusion; keep player-facing text minimal. / 不要额外添加说明性 UI 文案，除非用户明确要求或确实有助于避免误解；面向玩家的文字尽量保持精简。
- `captain_id` still exists in storage only for backward compatibility; gameplay should ignore it. / `captain_id` 仍保留在存储层，仅用于兼容历史数据；玩法逻辑应忽略它。
- The current local SQLite DB and remote D1 DB were manually cleaned down to a single surviving account: `Test1`. / 当前本地 SQLite 和远程 D1 数据库都曾手动清理到仅保留一个账号：`Test1`。
- Batch transfer budget validation now uses the final post-confirm roster total instead of failing on an intermediate upgrade step before a balancing downgrade. / 批量转会的预算校验现在基于确认后的最终阵容总价，而不是在中途先升级后降级的过程中提前失败。
- Standing tie-breaks now work as: higher points first, then fewer `Total transactions`, then alphabetical order by displayed team identity. Existing player totals are normalized from transfer history so pre-`Day 1` setup moves no longer count. / standing 的同分排序现在是：先比积分高低，再比 `Total transactions` 更少者优先，最后按展示队名的字母顺序排序。现有玩家的总转会数会根据转会历史自动归一化，因此 `Day 1` 前的建队转会不再计入。
- Because the site is now live with real players, any future change that could impact existing live data or alter a current player's game progress must be surfaced before implementation and requires explicit user approval; pure UI or interaction changes are exempt. / 由于网站已正式上线且已有真实玩家参与，今后任何可能影响线上现有数据或改变玩家游戏进程的修改，都必须在实施前先提示并获得用户明确同意；纯 UI 或交互调整不受此限制。
- `Agents.md` and `CONTEXT.md` are now maintained bilingually; future additions and edits must include both Chinese and English. / `Agents.md` 和 `CONTEXT.md` 现已改为双语维护；后续新增和修改都必须同时提供中英文。

## Release Workflow | 发布流程
- Do not push or deploy by default. Only run `git push` or deployment steps when the user explicitly asks for them. / 默认不要执行 push 或部署。只有用户明确要求时，才运行 `git push` 或部署步骤。
- The final response must state what was deployed and still include the exact reproducible command block for the user. / 最终回复必须说明已部署了什么，并且仍然提供一段用户可复现执行的精确命令块。

## Keep Updated | 维护原则
- Replace stale entries instead of growing this file endlessly. / 发现过时内容时要替换，不要让这个文件无限追加膨胀。
- Prefer durable decisions and current known behavior over temporary debugging notes. / 优先记录长期有效的决策和当前已确认行为，而不是临时调试笔记。
