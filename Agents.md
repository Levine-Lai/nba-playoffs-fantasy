## Approach | 工作方式
- Think before acting. / 先思考再行动。
- Be concise in output but thorough in reasoning. / 输出保持简洁，但思考要充分。
- Do not re-read files you have already read unless the file may have changed. / 除非文件可能已变化，否则不要重复读取已经看过的文件。
- No sycophantic openers or closing fluff. / 不要使用讨好式开场或冗余客套结尾。
- Keep solutions simple and direct. / 方案保持简单直接。
- User instructions always override this file. / 用户指令始终优先于本文件。

## Added Project Constraints | 项目附加约束
- Keep frontend/backend API contracts stable during deployment-target migration unless the matching caller and docs are updated in the same change. / 在部署目标迁移期间，前后端 API 契约必须保持稳定；除非同一次变更里同步更新对应调用方和文档。
- Keep Cloudflare-specific runtime code inside `backend/` and Vercel-specific app code inside `frontend/`; shared business rules should live in reusable modules. / Cloudflare 专属运行时代码放在 `backend/`，Vercel 专属应用代码放在 `frontend/`；共享业务规则应放在可复用模块中。
- Any backend schema or runtime change must include a reproducible migration or seed path from the current local SQLite data. / 任何后端 schema 或运行时变更，都必须提供从当前本地 SQLite 数据可复现的迁移或 seed 路径。
- Every new env var, deployment dependency, and manual release step must be documented in Markdown before the task is considered complete. / 每一个新增环境变量、部署依赖、人工发布步骤，都必须先写入 Markdown 文档，任务才算完成。
- If a planned change could affect existing live game data or alter any current player's game progress, the impact must be explicitly called out before making the change, and no such change may proceed until the user approves it. Pure UI or interaction-only changes are excluded. / 如果计划中的修改会影响线上已有游戏数据，或改变任何现有玩家的游戏进程，必须在修改前明确指出影响，并在获得用户同意后才能执行。纯 UI 或交互层修改不受此限制。
- If a change affects deployable code, database schema, rules, or seeded data, the final response must end with the exact release commands the user should run next. / 如果变更影响可部署代码、数据库 schema、规则或 seed 数据，最终回复必须以用户下一步应执行的精确发布命令结尾。
- Do not automatically run `git push` or deployment commands. Only push or deploy when the user explicitly asks for it. / 不要自动执行 `git push` 或部署命令。只有用户明确要求时才能 push 或部署。
- Even when push/deploy has already been executed by the agent, the final response must clearly state which push/deploy steps were performed and still end with the exact command sequence the user would run themselves, preferably as one copyable block. / 即使 agent 已经执行了 push 或部署，最终回复也必须清楚说明已执行了哪些步骤，并且仍然要以一段用户可直接复制的精确命令块结尾。
- Maintain a root-level `CONTEXT.md` as the project's cross-conversation memory file. After every meaningful code or rules change, update it with the high-value context needed to continue work in a fresh chat. / 在项目根目录维护 `CONTEXT.md` 作为跨会话记忆文件。每次有重要代码或规则变更后，都要更新其中对新会话继续工作最关键的上下文。
- `CONTEXT.md` should stay concise and current: summarize the latest architecture decisions, live gameplay rules, route/API naming conventions, pending risks, and the most recent release-relevant changes; remove or rewrite stale notes instead of only appending. / `CONTEXT.md` 必须保持精炼且最新：总结最新架构决策、当前生效的玩法规则、路由/API 命名规范、待处理风险，以及最近与发布相关的变更；不要只追加内容，而要删除或改写过时说明。
- All future additions or edits to `Agents.md` and `CONTEXT.md` must be written in both Chinese and English. / 以后对 `Agents.md` 和 `CONTEXT.md` 的所有新增或修改，都必须同时提供中英文版本。
