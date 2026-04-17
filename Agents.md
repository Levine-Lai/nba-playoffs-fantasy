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
