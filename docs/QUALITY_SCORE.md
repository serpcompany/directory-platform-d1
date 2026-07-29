# Harness quality evidence

Status: active  
Responsible area: repository harness  
Last verified: 2026-07-30  
Validation: `pnpm harness:check`

This is an evidence ledger, not a subjective score. “Partial” means a named,
actionable capability remains.

| Category | Status | Evidence | Known gap / next improvement |
|---|---|---|---|
| Repository legibility | Passing | `pnpm docs:check` | Keep indexes current as docs grow. |
| Architecture integrity | Passing | `scripts/architecture-guard.test.ts` | Expand import-direction checks if packages are split further. |
| Type safety | Passing | `pnpm typecheck` | Continue reducing inherited loose types. |
| D1 migration safety | Passing | `pnpm test:d1` | Generalize tenant literals before a second site. |
| Documentation freshness | Passing | `pnpm docs:check` | Add scheduled external-reference review if snapshots are introduced. |
| Worktree isolation | Partial | `scripts/worktree-harness.test.ts` and `pnpm worktree:doctor` | Add a two-live-runtime integration test. |
| Runtime visibility | Partial | `pnpm agent:manifest`, `agent:logs`, `agent:evidence` | Add structured event querying and trace collection. |
| Browser visibility | Partial | `pnpm agent:ui:capture` and `pnpm test:e2e:smoke` | Add scripted before/after interaction sequences. |
| Cloudflare compatibility | Passing | `pnpm worker:config:validate` and `pnpm worker:build` | Preserve protected remote workflows. |
| Source migration safety | Passing | `pnpm migration:preflight` and its unit tests | Build a deterministic tenant artifact generator only after tenancy design. |
| Security hygiene | Partial | guarded local/remote identities | Add a dedicated secret scanner. |
| Agent workflow quality | Passing | root/nested `AGENTS.md`, `PLANS.md`, repo skills | Add skill scenario evaluations as workflows mature. |
| Continuous cleanup | Passing | `pnpm docs:garden` and `harness-gardening.yml` | Add deterministic dead-export and dependency audits when selected. |

Update the status only with executable or inspectable evidence. Record regressions
instead of deleting the row.
