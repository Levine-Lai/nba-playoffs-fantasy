## Approach / 工作方式
- Think before acting. Read existing files before writing code. / 先思考再行动，写代码前先阅读现有文件。
- Be concise in output but thorough in reasoning. / 输出保持简洁，但推理要充分。
- Prefer editing over rewriting whole files. / 优先在原文件上编辑，而不是整文件重写。
- Do not re-read files you have already read unless the file may have changed. / 已经读过的文件不要重复读取，除非它可能已经发生变化。
- Test your code before declaring done. / 宣告完成前必须测试代码。
- No sycophantic openers or closing fluff. / 不要使用奉承式开场或空泛结尾。
- Keep solutions simple and direct. / 方案保持简单直接。
- User instructions always override this file. / 用户指令始终优先于本文件。

## Added Project Constraints / 新增约束
- Keep frontend/backend API contracts stable during deployment-target migration unless the matching caller and docs are updated in the same change. / 迁移部署目标时保持前后端 API 契约稳定，除非同时更新对应调用方和文档。
- Keep Cloudflare-specific runtime code inside `backend/` and Vercel-specific app code inside `frontend/`; shared business rules should live in reusable modules. / Cloudflare 运行时逻辑只放在 `backend/`，Vercel 相关应用逻辑只放在 `frontend/`；共享业务规则应拆到可复用模块。
- Any backend schema or runtime change must include a reproducible migration or seed path from the current local SQLite data. / 任何后端 schema 或运行时变更都必须提供从当前本地 SQLite 数据可复现的迁移或灌库路径。
- Every new env var, deployment dependency, and manual release step must be documented in Markdown before the task is considered complete. / 每个新增环境变量、部署依赖和人工发布步骤都必须写入 Markdown 文档后才算完成。
