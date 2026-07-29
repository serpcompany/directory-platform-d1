# Establish the repository harness and migration SOP

Status: completed  
Owner: repository harness  
Created: 2026-07-30  
Last updated: 2026-07-30

## Purpose and big picture

Make future work resumable and mechanically verifiable, and give maintainers a safe,
accurate process for migrating other external JSON-directory sites into the D1
architecture later. No additional site is migrated by this plan.

A maintainer can observe the result through the repository docs and skills, the
read-only migration preflight, isolated worktree/runtime commands, and passing
fast/full harness commands.

## Context and orientation

The current production site is D1-only but still single-site at application,
publisher, Wrangler, artifact, and workflow boundaries. The external legacy checkout
contains site-specific product/category files. Those files are migration evidence,
not inputs that may be copied into this repository.

The source harness-engineering guidance is at
`/Users/devin/dev/repos/serp/docs/harness-engineering`. This implementation adapts its
principles to an existing product rather than rebuilding the repository as a neutral
starter template.

## Progress

- [x] 2026-07-30 01:36 JST — Read repository instructions and the complete harness
      engineering README/PRD.
- [x] 2026-07-30 01:40 JST — Inspected current docs, commands, D1 boundaries, and the
      external legacy site layouts.
- [x] 2026-07-30 01:44 JST — Added repository knowledge, ExecPlan, migration, runtime,
      worktree, and review contracts.
- [x] 2026-07-30 01:45 JST — Added deterministic docs, migration-preflight, and
      worktree tests.
- [x] 2026-07-30 01:46 JST — Fast harness passed.
- [x] 2026-07-30 01:51 JST — Full harness passed; post-build catalog-file search,
      diff checks, and requirement audit passed.

## Surprises and discoveries

- Observation: `pnpm lint` mutated 28 application files because the application lint
  script used `biome check --write`.
  Evidence: the initial lint run produced a 28-file formatting diff.
  Resolution: reversed only that generated diff and separated read-only `lint` from
  explicit `lint:fix`.

- Observation: D1 tables contain `site_id`, but the surrounding runtime and release
  contracts remain hard-coded to `serp.software`.
  Evidence: catalog repository, publisher schema, Wrangler identities, workflows, and
  artifact names.
  Resolution: the SOP requires a tenancy decision and platformization before a second
  in-repo site.

## Decision log

- Decision: build a product-adapted harness rather than reproduce the neutral starter
  template PRD.
  Rationale: replacing the existing application/stack would contradict the request to
  preserve production behavior.
  Date: 2026-07-30.

- Decision: make migration preflight external-source-only and read-only by default.
  Rationale: inspecting legacy catalogs must not re-establish them as a repository
  data source.
  Date: 2026-07-30.

- Decision: default future in-repo sites to isolated Workers and D1 databases unless a
  separate shared-tenancy design proves otherwise.
  Rationale: this preserves blast-radius, deployment, backup, and rollback isolation.
  Date: 2026-07-30.

- Decision: preserve branches when destroying harness-created worktrees.
  Rationale: runtime cleanup should not discard recoverable Git work.
  Date: 2026-07-30.

## Plan of work

1. Establish concise agent navigation, indexed docs, ExecPlan infrastructure, and
   repo-local repeatable skills.
2. Document the source-to-D1 migration phases, evidence, tenancy prerequisite,
   Cloudflare release, rollback, and cleanup.
3. Add a parser-style preflight that inventories an external source without copying
   it.
4. Add fast/full checks, remediation, docs health, machine-readable runtime state,
   logged preview, evidence collection, and isolated worktree state.
5. Test the harness itself, run it against a real legacy site read-only, then run the
   full existing repository/Worker gate.

## Concrete commands

Run from `/Users/devin/dev/repos/directory-platform-d1`:

```bash
pnpm docs:check
pnpm migration:preflight -- \
  --source-root /Users/devin/dev/repos/json-directory \
  --site-id browserextensions.io
pnpm agent:manifest
pnpm agent:doctor
pnpm harness:fast
pnpm harness:check
```

Expected observations: docs health passes; the real-source preflight reports 292
listings, 16 categories, hashes, and no issues; the runtime identifies only the
synthetic local D1 binding; both harness profiles pass without remote access.

## Validation and acceptance

- Migration SOP completeness: `pnpm docs:check` verifies required phases and links.
- No site migration: Git diff contains no source catalog or new D1 import artifact.
- Preflight correctness: synthetic valid/invalid fixtures plus real external source.
- Worktree isolation: unit tests prove state separation, collision handling, and
  escaping-path diagnosis; doctor verifies initialized worktrees.
- Runtime legibility: manifest/doctor commands expose identity and remediation.
- D1 safety: architecture guard and D1 contract suite.
- Repository compatibility: typecheck, lint, repository tests, Wrangler validation,
  and OpenNext Worker build through `pnpm harness:check`.

## Idempotence and recovery

Docs/checks are read-only. Preflight writes only when `--output` is explicit and
refuses a missing output directory. Runtime initialization recreates only ignored
instance directories. Worktree creation refuses a dirty controller, existing path, or
existing branch; destroy removes only a registered managed worktree and preserves its
branch.

No remote Cloudflare operation exists in this plan. Revert the plan’s Git diff to
remove the harness. Runtime artifacts under `.runtime/` are ignored and disposable.

## Interfaces and dependencies

- Root scripts in `package.json`.
- `scripts/harness/*` for feedback, runtime, UI capture, and worktrees.
- `scripts/migration/preflight.ts` for legacy boundary parsing.
- Existing Vitest, TypeScript, Biome, Playwright, Wrangler, and OpenNext tools.
- Repository-local docs and skills as the knowledge system.

## Important artifacts

- `docs/MIGRATION_SOP.md`
- `docs/HARNESS.md`
- `docs/QUALITY_SCORE.md`
- `PLANS.md`
- `.agents/skills/`
- `scripts/harness/`
- `scripts/migration/preflight.ts`

## Outcomes and retrospective

The repository now has a concise agent map with nested local rules, indexed knowledge,
an ExecPlan system, repo-local migration/plan/review skills, fast and full deterministic
feedback loops, scheduled gardening, machine-readable runtime state, logged preview,
UI evidence capture, and guarded worktree isolation.

The migration SOP covers tenancy prerequisites, source freeze, mapping, deterministic
artifacts, local parity, Cloudflare provisioning, release, cleanup, and rollback. The
read-only preflight was exercised against `browserextensions.io`: 292 listings, 16
categories, four source hashes, zero issues, and zero warnings. No site was imported
and no D1 artifact or production state changed.

Final evidence:

- `pnpm harness:check`: eight checks passed in 22.2 seconds.
- repository suite: 22 files passed, 132 tests passed, one skipped.
- D1 suite: 20 tests passed.
- TypeScript: eight tasks passed.
- read-only lint and workspace validation passed with no findings.
- Wrangler preview/production configuration validation passed.
- OpenNext Worker build completed.
- post-build search found no catalog or search-index files.
- `git diff --check` passed.

The OpenNext bundle still emits its existing generated third-party duplicate-key
warning; the Worker build succeeds. The quality ledger records remaining improvements:
two-live-runtime integration, scripted before/after browser interactions, structured
trace/metric querying, a secret scanner, and broader deterministic dead-code audits.
