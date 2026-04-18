## Approach
- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

## Added Project Constraints
- Keep frontend/backend API contracts stable during deployment-target migration unless the matching caller and docs are updated in the same change.
- Keep Cloudflare-specific runtime code inside `backend/` and Vercel-specific app code inside `frontend/`; shared business rules should live in reusable modules.
- Any backend schema or runtime change must include a reproducible migration or seed path from the current local SQLite data.
- Every new env var, deployment dependency, and manual release step must be documented in Markdown before the task is considered complete.
- If a change affects deployable code, database schema, rules, or seeded data, the final response must end with the exact release commands the user should run next.
- After finishing and validating code changes, automatically run the required `git push` and deployment commands unless the user explicitly says not to push or not to deploy.
- Even when push/deploy has already been executed by the agent, the final response must clearly state which push/deploy steps were performed and still end with the exact command sequence the user would run themselves, preferably as one copyable block.
- Maintain a root-level `CONTEXT.md` as the project's cross-conversation memory file. After every meaningful code or rules change, update it with the high-value context needed to continue work in a fresh chat.
- `CONTEXT.md` should stay concise and current: summarize the latest architecture decisions, live gameplay rules, route/API naming conventions, pending risks, and the most recent release-relevant changes; remove or rewrite stale notes instead of only appending.
