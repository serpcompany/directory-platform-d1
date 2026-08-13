# Harness quality evidence

Status: active  
Responsible area: repository harness  
Last verified: 2026-08-13
Validation: `pnpm harness:check`

This is an evidence ledger, not a subjective score. “Partial” means a named,
actionable capability remains.

| Category | Status | Evidence | Known gap / next improvement |
|---|---|---|---|
| Repository legibility | Passing | `pnpm docs:check` | Keep the registry-derived multisite documentation contract current as sites grow. |
| Architecture integrity | Passing | `scripts/architecture-guard.test.ts` | Expand import-direction checks if packages are split further. |
| Type safety | Passing | `pnpm typecheck` | Continue reducing inherited loose types. |
| D1 migration safety | Partial | `pnpm test:d1` and two isolated site targets | Separate reusable schema releases from initial bootstrap, require expand/contract compatibility, and serialize production publications with Worker promotion. |
| Documentation freshness | Passing | `pnpm docs:check` and registry-derived site coverage | Add scheduled external-reference review if snapshots are introduced. |
| Worktree isolation | Partial | `scripts/worktree-harness.test.ts` and `pnpm worktree:doctor` | Add a two-live-runtime integration test. |
| Runtime visibility | Partial | `pnpm agent:manifest`, `agent:logs`, `agent:evidence` | Add structured event querying and trace collection. |
| Browser visibility | Partial | `pnpm agent:ui:capture`, site smoke suites, and mobile hero-containment assertions | Add scripted before/after interaction sequences. |
| Cloudflare compatibility | Partial | `pnpm worker:config:validate`, `pnpm worker:build`, and immutable-candidate research | Promote a tested production-bound Worker version ID without rebuilding, with protected pre-activation proof. |
| Source migration safety | Passing | `pnpm migration:preflight`, deterministic artifact generation, and two completed cutovers | Prove the updated SOP with a third-site dry run and consider a safe scaffold for repetitive boundaries. |
| Security hygiene | Partial | guarded local/remote identities | Add a dedicated secret scanner. |
| Agent workflow quality | Passing | root/nested `AGENTS.md`, GitHub issue configuration, domain docs, triage labels, and repo skills | Add skill scenario evaluations as workflows mature. |
| Continuous cleanup | Passing | `pnpm docs:garden` and `harness-gardening.yml` | Add deterministic dead-export and dependency audits when selected. |

Update the status only with executable or inspectable evidence. Record regressions
instead of deleting the row.
