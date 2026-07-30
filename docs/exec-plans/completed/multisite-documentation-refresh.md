# Refresh the multisite migration and operations documentation

Status: completed

Owner: repository documentation and harness

Created: 2026-07-30

Last updated: 2026-07-30

## Purpose and big picture

Make the repository describe the platform that actually exists after
`pornvideodownloaders.com` became the second D1-backed site. A maintainer should be
able to use the documented process to migrate a third legacy JSON directory without
rediscovering the platform boundaries, Cloudflare safety checks, idempotence proof,
responsive-runtime checks, or cleanup steps. Documentation health should reject the
specific single-site claims that became stale during the second-site migration.

## Context and orientation

The active site registry is `scripts/site-targets.ts`. It defines
`serp.software` and `pornvideodownloaders.com`, including local and remote Wrangler
configuration, protected environments, confirmation phrases, import artifacts, and
parity reports. Each site has its own app, checked-in presentation configuration,
Worker, and D1 database; shared rendering lives in `packages/web-core`.

`docs/MIGRATION_SOP.md` is the authoritative source-migration process.
`docs/DEPLOY_RUNBOOK.md` governs Cloudflare operations. `AGENTS.md`,
`docs/ONBOARDING.md`, and `docs/BUILD_PIPELINE.md` orient contributors. The migration
skill turns those documents into an agent workflow. `scripts/harness/docs-health.ts`
checks documentation contracts without granting write or deployment authority.

This change is documentation and harness maintenance only. It must not mutate
Cloudflare resources, D1 databases, GitHub environments, or production Workers.

## Progress

- [x] 2026-07-30 09:30 JST Audited the current site registry, package scripts,
  workflows, and authoritative docs; found multiple one-site claims that survived
  the existing documentation health check.
- [x] 2026-07-30 09:40 JST Updated the migration SOP, agent map, onboarding,
  development, harness, architecture, build, deploy, submission, quality, and
  migration-skill guidance to the current two-site platform and reusable next-site
  process; `pnpm docs:check` passed.
- [x] 2026-07-30 09:40 JST Added registry-derived site coverage and retired-assertion
  checks with focused omission and regression tests; the targeted six-test
  `scripts/harness-docs.test.ts` suite passed.
- [x] 2026-07-30 09:43 JST Ran formatting, documentation, focused documentation
  tests, the four-stage fast harness, the eight-stage full harness, and final diff
  checks. The full harness passed 196 repository tests with one intentional skip,
  validated all four remote configurations, and built both Workers.

## Surprises and discoveries

- Observation: `pnpm docs:check` could pass while the migration SOP, onboarding
  guide, build pipeline, quality score, and root agent map described a one-site
  repository.
  Evidence: `scripts/harness/docs-health.ts` checked file presence, local links, and
  phase headings but did not compare active sites with the prose.
- Observation: deployment, publication, notification, and approval workflows are
  already multisite-aware, while `docs/SUBMISSION_FLOW.md` still names only the
  `serp.software` tenant and confirmation phrase.
  Evidence: workflow inputs and matrices include both registry sites.
- Observation: the first fast-harness run failed at TypeScript resolution because
  the primary checkout had not installed workspace links for the second app after
  fast-forwarding to the multisite commit.
  Evidence: TypeScript reported the missing
  `apps/pornvideodownloaders.com/node_modules`; `pnpm install --frozen-lockfile`
  restored workspace links without tracked-file changes, and `pnpm harness:fast`
  then passed all four stages.
- Observation: both OpenNext builds retain the known generated-bundle duplicate
  `options` key warning.
  Evidence: both Workers built successfully in `pnpm harness:check`; the warning is
  generated output and was already recorded by the second-site migration plan.

## Decision log

- Decision: Treat `scripts/site-targets.ts` as the machine-readable source of truth
  for active site identities in documentation health.
  Rationale: A new registry entry should force the core operating documents to be
  updated in the same change.
  Date: 2026-07-30
- Decision: Keep named root aliases as conveniences while documenting explicit
  `--site <site-id>` selection as the canonical lower-level contract.
  Rationale: Existing aliases are useful, but every new site must be deliberately
  registered rather than receiving an implicit default.
  Date: 2026-07-30
- Decision: Do not perform any external deployment or database operation.
  Rationale: The requested outcome is current, durable documentation, and production
  mutation requires separate runbook authority.
  Date: 2026-07-30

## Plan of work

First update the root agent map and migration SOP so their architecture, commands,
evidence, and cleanup steps match the current platform. Then align onboarding,
development, harness, build, deployment, submission, quality-score, and migration
skill guidance. Preserve site-specific facts where they are operationally necessary,
but express reusable boundaries with `<site-id>` placeholders and registry references.

Next extend documentation health so every active registry site must be named in the
core multisite documents and known retired one-site assertions are rejected. Add
targeted tests showing the guard fails when a registered site is omitted.

Finally run formatting or lint checks relevant to edited files, `pnpm docs:check`,
targeted repository tests, and `pnpm harness:check`. Review `git diff` and move this
plan to `docs/exec-plans/completed/` only after all acceptance evidence is recorded.

## Concrete commands

Run from `/Users/devin/dev/repos/directory-platform-d1`:

    pnpm docs:check
    pnpm vitest run scripts/harness-docs.test.ts
    pnpm harness:check
    git diff --check
    git diff --stat

Success means all commands exit zero, the documentation health output identifies the
active sites it checked, and the final diff contains no runtime or deployment
configuration mutation.

## Validation and acceptance

- The migration SOP states that two isolated D1-backed sites are active and provides
  a complete, reusable third-site workflow.
- Core contributor docs name both active sites and point to the registry instead of
  asserting a single deployable app.
- The deploy and submission docs match current workflow inputs, environments,
  confirmations, backups, and site selection.
- The SOP records credential identity validation, empty and populated preview
  rehearsal, checksum-idempotent retry, real mobile containment evidence, and branch
  or worktree cleanup.
- Documentation health derives site IDs from the registry and fails if a core
  multisite document omits an active site or restores a known stale assertion.
- The full non-deployment harness passes.

## Idempotence and recovery

All edits are local and reviewable on `codex/refresh-multisite-docs`. Validation is
read-only and safe to rerun. If a check fails, update the affected document or guard
and rerun the smallest failing command before the full harness. Rollback is a normal
Git revert of this branch; no database backup or Cloudflare recovery is involved.

## Interfaces and dependencies

- Active site contract: `siteIds`, `SiteId`, `SiteTarget`, and `siteTargets` in
  `scripts/site-targets.ts`.
- Documentation validator: `checkDocumentation()` in
  `scripts/harness/docs-health.ts`.
- Repository test: `scripts/harness-docs.test.ts`.
- Authoritative process docs: `docs/MIGRATION_SOP.md`,
  `docs/DEPLOY_RUNBOOK.md`, `docs/HARNESS.md`, and `docs/DEVELOPMENT.md`.
- External systems are descriptive only: GitHub protected environments, Cloudflare
  Workers, and Cloudflare D1.

## Important artifacts

- Current active site registry: [`scripts/site-targets.ts`](../../../scripts/site-targets.ts)
- Migration SOP: [`docs/MIGRATION_SOP.md`](../../MIGRATION_SOP.md)
- Documentation guard: [`scripts/harness/docs-health.ts`](../../../scripts/harness/docs-health.ts)

## Outcomes and retrospective

The authoritative migration and operating docs now describe the actual two-site
platform and the deliberate work required for a third site. The reusable process
incorporates the second cutover's important lessons: explicit registry selection,
read-only Cloudflare identity verification, two-pass preview idempotence, real mobile
containment evidence, and safe post-merge cleanup.

Documentation health now reads the active registry and requires every registered
site in the six core multisite documents. Focused tests prove it reports an omitted
site and retired single-site language. `pnpm docs:check`, `pnpm harness:fast`, and
`pnpm harness:check` passed after a frozen install restored missing workspace links.

No runtime, database, Wrangler, workflow, or Cloudflare resource changed. The only
residual build signal is the pre-existing generated duplicate-`options` warning
recorded above. A future third-site dry run remains the best next proof of the revised
SOP and may justify a safe scaffold for the repetitive per-site boundaries.
