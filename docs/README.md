# Documentation index

Status: active  
Responsible area: repository harness  
Last verified: 2026-07-30  
Validation: `pnpm docs:check`

## Stable system documentation

| Document | Status | Responsible area | Last verified | Validation |
|---|---|---|---|---|
| [Architecture](./ARCHITECTURE.md) | Active | application architecture | 2026-07-30 | `pnpm test:repo` |
| [Data model](./DATA_MODEL.md) | Active | catalog persistence | 2026-07-30 | `pnpm test:d1` |
| [Development](./DEVELOPMENT.md) | Active | local development | 2026-07-30 | `pnpm harness:fast` |
| [Build pipeline](./BUILD_PIPELINE.md) | Active | release engineering | 2026-07-30 | `pnpm worker:build` |
| [Deploy runbook](./DEPLOY_RUNBOOK.md) | Active | release engineering | 2026-07-30 | `pnpm worker:config:validate` |
| [Submission flow](./SUBMISSION_FLOW.md) | Active | catalog publication | 2026-07-30 | `pnpm test:d1` |
| [Maintainer onboarding](./ONBOARDING.md) | Active | repository orientation | 2026-07-30 | `pnpm docs:check` |

## Agent operating system

| Document | Status | Responsible area | Last verified | Validation |
|---|---|---|---|---|
| [Harness](./HARNESS.md) | Active | agent feedback/runtime | 2026-07-30 | `pnpm harness:fast` |
| [Migration SOP](./MIGRATION_SOP.md) | Approved process | migration safety | 2026-07-30 | `pnpm migration:preflight` |
| [Quality score](./QUALITY_SCORE.md) | Active | evidence ledger | 2026-07-30 | `pnpm harness:check` |
| [Active execution plans](./exec-plans/active/README.md) | Active index | substantial work | 2026-07-30 | `pnpm docs:check` |
| [Completed execution plans](./exec-plans/completed/README.md) | Archive index | decision history | 2026-07-30 | `pnpm docs:check` |

Root navigation and non-negotiable rules live in [`AGENTS.md`](../AGENTS.md).
ExecPlan requirements live in [`PLANS.md`](../PLANS.md).
