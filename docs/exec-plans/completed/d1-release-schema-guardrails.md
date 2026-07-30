# Make D1 Worker releases schema-safe and reproducible

Status: completed
Owner: Worker release safety and repository documentation
Created: 2026-07-31
Last updated: 2026-07-31
Completed: 2026-07-31

## Purpose and big picture

A maintainer or fresh coding agent should be able to release either site without
guessing whether `worker-only` is safe. Before any Worker deploy, the protected
workflow will prove, using a read-only query against the exact configured D1 database,
that every migration required by the checked-out Worker commit is already applied.
If that proof is missing, malformed, or incomplete, deployment stops and tells the
operator to rerun the reviewed commit as `database-and-worker`.

The operating documents will separately explain release-mode selection, immutable
backup/migration/import/verification ordering, functional route smoke tests, and
bounded D1 analytics QA. Historical preview-only evidence will remain intact while a
dated addendum records the later authorized production rollout.

## Context and orientation

The protected release workflows are
`.github/workflows/build-and-deploy.yml` for `serp.software` production and
`.github/workflows/deploy-pornvideodownloaders.yml` for PVD preview/production.
Both expose `worker-only` and `database-and-worker`. The latter currently retains a
backup, applies `d1/migrations/`, performs an idempotent bootstrap import, verifies
catalog parity, and then deploys. A Worker-only run skips all database mutation, but
currently has no proof that its code and the deployed schema agree.

Wrangler records each applied migration filename in D1's `d1_migrations` table.
`scripts/worker-release.ts` already materializes the exact protected target config,
checks workflow identity, branch, commit, confirmation, and a clean checkout, and
runs guarded remote commands. It is the narrow boundary for a new read-only
`check-schema` operation. Repository migrations are the declaration of the minimum
schema expected by the Worker commit; compatibility means every checked-in `.sql`
migration name is present remotely. Extra remote migrations are allowed so a Worker
rollback can use a forward-compatible database.

`packages/data-ops/` is the shared query authority. Site adapters acquire the
validated binding but contain no catalog SQL. SERP has no preview target; this plan
does not invent one.

Cloudflare D1 documentation confirms that applied migration names are stored in
`d1_migrations`, that D1 query metadata distinguishes rows scanned from rows
returned, and that DDL/index maintenance may write rows. Those facts govern the
preflight and analytics instructions; experimental `wrangler d1 insights` output is
not made a hard automated release dependency.

## Progress

- [x] 2026-07-31 01:45 JST Read the handoff, repository contracts, current release
  implementation/tests, local planning/review skills, and current Cloudflare D1 and
  Wrangler guidance; created feature branch
  `codex/d1-release-docs-guardrails`.
- [x] 2026-07-31 01:50 JST Added a deterministic, read-only, fail-closed
  schema-compatibility operation. Workflow and release-boundary tests prove all three
  deployment jobs stop before OpenNext deployment when compatibility fails.
- [x] 2026-07-31 01:51 JST Corrected release-mode, package-ownership, QA, benchmark,
  and completed-plan documentation; added semantic documentation-health assertions.
- [x] 2026-07-31 01:54 JST Ran focused tests, documentation checks, the fast and full
  frozen-install harness, a read-only Wrangler 4.110.0 result-envelope check, and the
  repository review workflow. All final gates passed.

## Surprises and discoveries

- Observation: Both workflows default to `worker-only`, even though a missing
  migration can make a Worker commit fail at runtime.
  Evidence: both workflow inputs declare `default: worker-only`; neither workflow
  currently runs a remote schema inspection before its unconditional deploy step.
- Observation: The existing release boundary can perform the compatibility check
  without adding Cloudflare authority.
  Evidence: `scripts/worker-release.ts` already validates the protected workflow,
  main SHA, exact site confirmation, target secrets, and generated Wrangler config
  before any remote command.
- Observation: Treating an extra remote migration as incompatibility would obstruct
  ordinary Worker rollback after a forward migration.
  Evidence: the deploy runbook explicitly says a valid forward migration should not
  be restored merely because an application deploy fails.
- Observation: Route smoke tests and database-efficiency checks prove different
  things.
  Evidence: HTTP success does not expose D1 `rows_read`, `rows_written`, query count,
  or query shape; Cloudflare documents those in D1 metadata/analytics.
- Observation: Wrangler 4.110.0 returns a successful read-only D1 query as an array
  containing `results`, `success: true`, and `meta`; a missing migration ledger exits
  nonzero with an object-shaped error.
  Evidence: read-only local executions against existing isolated state returned both
  shapes. Unit fixtures cover the success array, unsuccessful arrays, object payload,
  missing results, and invalid JSON.
- Observation: The first full harness run stopped at changed-file formatting for
  three new test/check files.
  Evidence: Biome identified only deterministic formatter differences. Formatting
  those exact files and rerunning produced a 10-of-10 harness pass; no lint rule or
  test gate was weakened.

## Decision log

- Decision: Declare Worker schema requirements as the complete set of checked-in
  `d1/migrations/**/*.sql` names relative to `d1/migrations`, and require that set to
  be a subset of remotely applied `d1_migrations.name` values.
  Rationale: this automatically covers future migrations without a one-index
  hard-code, fails when a requirement is absent, and permits forward-schema Worker
  rollback. Duplicate or malformed remote rows fail closed.
  Date: 2026-07-31.
- Decision: Run the same read-only schema check immediately before every Worker
  deploy. In `worker-only`, it is the compatibility preflight; in
  `database-and-worker`, it proves migrations completed before deployment.
  Rationale: one unconditional gate is easier to audit and preserves
  backup → migration → import → parity verification → schema compatibility → deploy.
  Date: 2026-07-31.
- Decision: Keep functional route QA procedural in this change and make D1 analytics
  explicitly operator-verifiable rather than grant new credentials or depend on the
  experimental insights command.
  Rationale: the workflows currently have deployment authority, not a reviewed
  analytics credential/interface. Adding that authority would expand scope. The
  runbook can require a bounded, timestamped evidence record and quantitative
  rollback thresholds without pretending ordinary route checks prove efficiency.
  Date: 2026-07-31.
- Decision: Add semantic documentation-health assertions for current release-mode,
  schema-preflight, and completed-plan-path guidance.
  Rationale: ordinary Markdown link validation did not catch a stale path written as
  inline code or contradictory operational guidance.
  Date: 2026-07-31.

## Plan of work

Milestone 1 adds exported migration-name comparison helpers and the guarded
`check-schema` command. Unit tests will prove exact/subset success, missing,
duplicate, malformed, query-failure, and unauthorized cases. Workflow tests will
require the check after database verification and before deployment, with protected
credentials, for SERP production and both PVD jobs.

Milestone 2 rewrites the release-mode sections in `docs/DEPLOY_RUNBOOK.md` and
`docs/BUILD_PIPELINE.md`, identifies `packages/data-ops/` as shared query authority,
and defines representative functional and quantitative D1 QA. It corrects
`docs/DATA_OPS_BENCHMARK.md` and appends the later authorized production evidence to
the completed live-metrics plan without changing its original preview-only claims.
Documentation health gains narrow semantic checks.

Milestone 3 runs focused Vitest files, `pnpm docs:check`, `pnpm harness:fast`, the
complete `pnpm harness:check`, and the repository-local `review-change` checklist.
The final diff is reread, the plan is completed and moved under `completed/`, and no
remote command is executed.

## Concrete commands

Run from
`/Users/devin/dev/repos/json-project-folder/directory-platform-d1`:

    pnpm exec vitest run scripts/worker-release.test.ts \
      scripts/build-and-deploy-workflow.test.ts \
      scripts/pornvideodownloaders-workflow.test.ts \
      scripts/harness-docs.test.ts
    pnpm docs:check
    pnpm harness:fast
    pnpm install --frozen-lockfile
    pnpm harness:check

Apply `.agents/skills/review-change/SKILL.md` to the complete diff after those
commands. Success is zero failing tests/checks, both OpenNext builds passing, and a
clean status except for this branch's intended files.

No invocation of a workflow, remote Wrangler command, Cloudflare API mutation,
deployment, push, or PR is part of this plan.

## Validation and acceptance

- A unit fixture whose applied names contain all repository migrations passes; extra
  applied migrations also pass.
- Missing, duplicate, malformed, empty, unsuccessful, or unparseable remote results
  throw before an OpenNext deploy invocation and include remediation to choose
  `database-and-worker`.
- The schema command uses `wrangler d1 execute ... --remote --command SELECT ... --json`
  against the exact materialized target and contains no SQL mutation verb.
- Workflow tests prove the unconditional schema step follows verification for a
  database-and-Worker run and precedes Worker deploy in all three jobs.
- Existing assertions for manual/main-only invocation, exact confirmation, protected
  environment, scoped credentials, backup retention, mutation opt-in, and operation
  ordering continue passing unchanged.
- Documentation health fails if the runbook loses both release modes, fail-closed
  schema guidance, `packages/data-ops/` ownership, or the completed live-evidence
  path.
- The runbook gives an unambiguous decision: select `database-and-worker` whenever
  the reviewed commit contains an unapplied migration or compatibility cannot be
  established; otherwise `worker-only` is permissible.
- Post-release guidance defines home/category/detail plus search/RSS/sitemap/redirect
  functional checks separately from a bounded D1 window recording request count,
  query count/shape, calls per route, latency, rows read, rows written, and rollback
  evidence.
- For the catalog optimization, warm home/category/detail requests target no more
  than two D1 rows per route and no stable hydration/aggregate query shape; any
  unexpected application write or return of the retired broad query shapes stops the
  rollout and triggers Worker rollback review. Expected one-time migration/index
  writes are attributed to the database-and-Worker workflow window.
- The completed plan records the 2026-07-31 production migration and Worker runs,
  retained backup artifact IDs, catalog counts, related-seek evidence, and controlled
  nine-request warm results already supplied by the handoff.

## Idempotence and recovery

The schema preflight only selects migration names and is safe to retry. Generated
Wrangler configuration remains ignored. A failed or inconclusive check makes no
remote change and leaves the prior Worker active. The operator should review the
pending migrations and rerun the same main commit through
`database-and-worker`; that path retains a backup before mutation.

If database mutation succeeds but deployment fails, do not restore automatically:
retain the backup, diagnose Worker compatibility, and prefer a reviewed Worker
rollback because forward migrations may remain valid. Restoring D1 requires separate
explicit production authority.

Local code/docs changes are recoverable by reverting this feature branch. No remote
state is changed by implementation or validation.

## Interfaces and dependencies

- `scripts/worker-release.ts`: `check-schema` CLI operation and pure migration-set
  validation.
- `.github/workflows/build-and-deploy.yml`: unconditional protected SERP schema gate.
- `.github/workflows/deploy-pornvideodownloaders.yml`: unconditional protected PVD
  preview/production schema gates.
- `d1/migrations/`: minimum Worker schema declaration.
- D1 `d1_migrations(name)`: applied migration evidence.
- Existing Cloudflare secrets, protected environments, site confirmations, and
  materialized Wrangler configs remain unchanged.
- `scripts/harness/docs-health.ts`: semantic handoff-documentation assertions.

## Important artifacts

- Source optimization issue: `https://github.com/serpcompany/directory-platform-d1/issues/23`
- Optimization implementation: `https://github.com/serpcompany/directory-platform-d1/pull/26`
- Evidence merge: `https://github.com/serpcompany/directory-platform-d1/pull/27`
- PVD production run:
  `https://github.com/serpcompany/directory-platform-d1/actions/runs/30560826641`
- SERP production run:
  `https://github.com/serpcompany/directory-platform-d1/actions/runs/30561183257`
- Cloudflare D1 migrations:
  `https://developers.cloudflare.com/d1/reference/migrations/`
- Cloudflare D1 metrics:
  `https://developers.cloudflare.com/d1/observability/metrics-analytics/`

## Outcomes and retrospective

Every protected Worker release now executes a read-only schema proof and its deploy
command in one `set -euo pipefail` shell step. The proof uses the exact site,
environment, materialized Wrangler configuration, protected confirmation, main SHA,
and D1 identity already governed by `scripts/worker-release.ts`. It emits only site,
environment, status, and migration counts; subprocess output and binding/credential
values are not reflected on failure. Repository migrations are minimum requirements,
while extra forward migrations remain compatible for Worker rollback.

The deploy and build runbooks now teach manual post-merge dispatch, release-mode
selection, database operation order, SERP's intentional lack of preview, functional
smoke coverage, and bounded D1 analytics evidence. The benchmark and completed live
metrics plan now accurately record the later production migration/deployments without
rewriting the earlier preview-only authority.

Final evidence:

- focused release/docs tests: 36 passed;
- documentation health: passed;
- fast harness: 5 of 5 checks passed in 8.6 seconds;
- frozen install: lockfile unchanged and installation succeeded;
- full harness: 10 of 10 checks passed in 42.0 seconds, including 241 repository
  tests with one existing skip, configuration validation, and both OpenNext builds;
- read-only Wrangler 4.110.0 local result: nine applied migration rows in the exact
  array/`success`/`meta` envelope expected by the parser;
- `git diff --check`: passed.

No application route implementation changed, so Playwright would not exercise this
release guard. The focused workflow tests, command failure tests, real local Wrangler
envelope, and both Worker builds are the authoritative runtime evidence. Quantitative
production analytics remains a manual post-release gate because no reviewed
analytics credential was added. No Worker was deployed, no remote D1 operation ran,
and no Cloudflare identity, binding, confirmation, environment, or target changed.
