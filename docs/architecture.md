# Architecture

AgentBench Studio uses npm workspaces with three production boundaries:

- `packages/shared`: Zod contracts, fixed scoring, requirement aggregation and conclusion rules.
- `apps/server`: Fastify API, JSON storage, SSE, process lifecycle, Playwright/axe/Lighthouse and reports.
- `apps/web`: React local-tool UI. It never starts commands directly and only talks to `/api`.

Each run owns `data/runs/<id>`. Configuration, mutable state and final results are written atomically. Only one run may be active. The server owns child-process cleanup on success, failure, cancellation and shutdown.

The test DSL is a strict discriminated union. No DSL value is evaluated as JavaScript or interpreted as a shell command.
