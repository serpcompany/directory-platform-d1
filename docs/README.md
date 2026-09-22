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
| [D1 replacement transfer](./D1_REPLATFORM.md) | Active | replacement database parity | 2026-09-23 | `pnpm test:d1` |
| [Development](./DEVELOPMENT.md) | Active | local development | 2026-07-30 | `pnpm harness:fast` |
| [Build pipeline](./BUILD_PIPELINE.md) | Active | release engineering | 2026-07-30 | `pnpm worker:build` |
| [Deploy runbook](./DEPLOY_RUNBOOK.md) | Active | release engineering | 2026-07-30 | `pnpm worker:config:validate` |
| [Submission flow](./SUBMISSION_FLOW.md) | Active | catalog publication | 2026-07-30 | `pnpm test:d1` |
| [Visitor capabilities](./CAPABILITIES.md) | Inventory draft | product and release confidence | 2026-08-13 | `pnpm docs:check` |
| [Confidence system](./CONFIDENCE_SYSTEM.md) | Active map | product and release engineering | 2026-08-13 | `pnpm docs:check` |
| [Maintainer onboarding](./ONBOARDING.md) | Active | repository orientation | 2026-07-30 | `pnpm docs:check` |
| [Live Visitor baseline](./LIVE_VISITOR_BASELINE.md) | Point-in-time research | product and release engineering | 2026-08-13 | `pnpm docs:check` |

## Agent operating system

| Document | Status | Responsible area | Last verified | Validation |
|---|---|---|---|---|
| [Harness](./HARNESS.md) | Active | agent feedback/runtime | 2026-07-30 | `pnpm harness:fast` |
| [Migration SOP](./MIGRATION_SOP.md) | Approved process | migration safety | 2026-07-30 | `pnpm migration:preflight` |
| [Quality score](./QUALITY_SCORE.md) | Active | evidence ledger | 2026-07-30 | `pnpm harness:check` |
| [Issue tracker](./agents/issue-tracker.md) | Active configuration | planning and tickets | 2026-08-13 | `pnpm docs:check` |
| [Triage labels](./agents/triage-labels.md) | Active configuration | issue workflow | 2026-08-13 | `pnpm docs:check` |
| [Domain docs](./agents/domain.md) | Active configuration | shared vocabulary | 2026-08-13 | `pnpm docs:check` |

Root navigation and non-negotiable rules live in [`AGENTS.md`](../AGENTS.md).
Active specs, decision maps, tickets, dependencies, and acceptance evidence live in
GitHub Issues for `serpcompany/directory-platform-d1`.
