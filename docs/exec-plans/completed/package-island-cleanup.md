# Remove package islands and retire the legacy CLI

Status: completed
Owner: repository architecture and engineering harness
Created: 2026-07-30
Last updated: 2026-07-30

## Purpose and big picture

Remove workspace packages, content records, dependency edges, environment inputs, and
release machinery that no longer support either production directory. After this work,
`serp.software` and `pornvideodownloaders.com` must install, validate, build as
OpenNext Workers, and pass their public browser smoke coverage with no runtime or D1
behavior change.

The public `llmstxt-cli` package is a product retirement, not an incidental deletion.
Its source, checked-in registry, Changesets configuration, release workflow, tests,
documentation, and hook exclusions are retired together as a distinct milestone.

## Context and orientation

The repository operates two isolated Next.js OpenNext Workers. Each site reads its
catalog from its own D1 binding. Package cleanup must not change the D1 repository
boundary, site registry, Worker identity, Wrangler templates, or production authority.

The full repository harness composes documentation health, the D1 architecture guard,
D1 contracts, TypeScript boundaries, lint, repository tests, Worker configuration
validation, and both Worker builds. Pull-request CI additionally runs Biome over every
changed supported file. PR #22 proved that the local Turbo lint graph can omit root
scripts, so the local full harness must gain an equivalent changed-file read-only
Biome check before broader deletion.

High-confidence private islands are the newsletter package, the rate-limiting package,
three legacy website MDX records, and the form-state hook. The hooks package remains
live through its debounce hook. The content package remains live through docs, legal
pages, guides, and extension updates. The validators package is not a wholesale island:
the active console-log validation script imports one of its rules, so redundant
validator entry points can be removed only after the live rule is preserved or moved.

The `retirement-evidence` directory outside this repository contains recovery bundles
and bare mirrors and is retained through at least 2026-10-28 by a separate active plan.
This work neither deletes nor relocates it.

## Progress

- [x] 2026-07-30 21:29 JST Record the clean baseline: frozen install, workspace list,
  full harness, and both explicit Worker builds.
- [x] 2026-07-30 21:31 JST Add a CI-equivalent read-only Biome step to the local full
  harness and prove its command contract with repository tests.
- [x] 2026-07-30 21:34 JST Remove private package islands and stale manifests,
  aliases, environment inputs, hook exports, and redundant validator code; regenerate
  the lockfile and pass the full harness.
- [x] 2026-07-30 21:38 JST Retire `llmstxt-cli`, its registry, release workflow,
  Changesets surface, tests, documentation, and hook exclusions; pass the full harness.
- [x] 2026-07-30 21:43 JST Run public browser smoke coverage for both sites, perform a
  defect-first review, and record final evidence.
- [x] 2026-07-30 21:56 JST Re-run the publication review from feature branch
  `agent/package-island-cleanup`: frozen install, focused harness tests, package-graph
  checks, fast/full harness, final scope audit, and current-base verification all pass.

## Surprises and discoveries

- Observation: the validators package still supplies the console-log rule used by an
  active pre-commit script.
  Evidence: the validation script imports the rule directly from the package source,
  while the apparently dormant aggregate validator runner is not invoked by Lefthook
  or the repository harness.
- Observation: both app environment configuration modules still read newsletter and
  Upstash variables even though no application imports or feature consumes them.
  Evidence: repository-wide searches find those reads only in the two environment
  configuration modules and the packages proposed for removal.
- Observation: the full harness builds both Workers already, but the plan keeps an
  explicit second Worker-build command as baseline and final evidence because Worker
  compatibility is the principal runtime compilation boundary.
  Evidence: the harness runner's final step invokes the aggregate Worker build.
- Observation: a repository-wide read-only Biome check cannot be added as a passing
  baseline without expanding this cleanup into unrelated formatting work.
  Evidence: `pnpm exec biome check --no-errors-on-unmatched .` checked 579 files and
  reported 108 errors plus 9 warnings in pre-existing application and script sources.
- Observation: the package audit found redundant app-level dependencies on the hooks
  and observability packages, although both packages remain live through web-core and
  the design system respectively.
  Evidence: neither app imports those packages directly; their actual consumers
  declare the workspace dependencies and the post-removal Worker builds pass.
- Observation: root harness commands depended on Vitest supplied only by the retired
  CLI package, and root TypeScript scripts used an undeclared hoisted tsx binary.
  Evidence: after physical CLI cleanup, the harness could not resolve Vitest from a
  frozen install; declaring both root-used tools directly restores install isolation.
- Observation: the remaining Upstash lockfile entry is not a direct application
  dependency.
  Evidence: `pnpm why @upstash/redis --recursive` reports it only as an optional peer
  installed for Drizzle ORM in each app.
- Observation: both retained local D1 state directories pass agent isolation checks
  but do not contain a verifiable publication state, so local browser smoke would
  require the excluded migrate/import initialization.
  Evidence: both agent doctor commands pass, while both local D1 verify commands fail
  before executing browser assertions. No migrate or import command was run.

## Decision log

- Decision: use the full repository harness as the primary test seam and public
  Playwright smoke coverage as the user-visible runtime seam.
  Rationale: these are the highest existing boundaries and avoid tests coupled to the
  location of deleted files.
  Date: 2026-07-30
- Decision: add a changed-file read-only Biome check to the full harness, covering
  committed changes from `origin/main` plus staged, unstaged, and untracked local files.
  Rationale: a whole-repository check currently reports 108 pre-existing errors. The
  changed-file boundary matches protected CI while still checking work before commit.
  Date: 2026-07-30
- Decision: split private-island cleanup from CLI retirement.
  Rationale: private dead code and public package retirement have different rollback
  and acceptance surfaces.
  Date: 2026-07-30
- Decision: preserve the live console-log validation behavior while collapsing
  redundant validator packaging.
  Rationale: deleting the package without moving the rule would silently weaken the
  pre-commit harness.
  Date: 2026-07-30
- Decision: leave retirement recovery evidence untouched.
  Rationale: its retention deadline and recovery authority belong to a separate active
  retirement plan.
  Date: 2026-07-30

## Plan of work

Milestone 1 records the current install, workspace graph, harness, and Worker builds.
Any baseline failure is recorded before modification rather than attributed to cleanup.

Milestone 2 adds a read-only Biome step to the full harness with an exported harness
step contract covered by the existing repository-test boundary. Harness documentation
is updated so local completion policy matches observable execution.

Milestone 3 removes the newsletter and rate-limiting packages, stale app dependencies,
unused Upstash catalog entries, unused app environment reads, stale Turbo environment
keys, the three legacy website records, the form-state hook export, and CLI data aliases.
The validator aggregate commands and unused rules are removed only after the live
console-log rule is moved into the active validation scripts. The lockfile is then
regenerated and the full harness is run.

Milestone 4 retires the CLI source and registry, its public package metadata,
CLI-specific tests and docs, the release workflow, Changesets configuration and root
dependencies, repository assertions for that release path, and CLI-specific hook
exclusions. Remaining workflow tests continue to protect active production Worker
concurrency and install isolation.

Milestone 5 runs the full harness, explicit Worker builds, both public browser smoke
suites, and a complete defect-first diff review. The plan moves to completed only when
all acceptance evidence is recorded.

## Concrete commands

Run from `/Users/devin/dev/repos/json-project-folder/directory-platform-d1`.

    pnpm install --frozen-lockfile
    pnpm -r list --depth -1
    pnpm harness:check
    pnpm worker:build

The baseline succeeds with exit code zero and lists the current workspaces.

During harness work:

    pnpm exec vitest run scripts/harness/biome-changed.test.ts scripts/pr-review-workflow.test.ts
    pnpm harness:check

The focused tests prove the read-only Biome step is present and CI remains read-only.

After each package-graph milestone:

    pnpm install
    pnpm install --frozen-lockfile
    pnpm harness:check
    pnpm worker:build

The install changes only the expected manifest and lockfile graph. Every validation
command exits zero.

Final runtime validation used the live, read-only public sites because initializing the
retained local D1 directories would have required excluded local data mutations:

    PLAYWRIGHT_BASE_URL=https://serp.software \
      PLAYWRIGHT_WEB_SERVER_COMMAND=true pnpm test:e2e:smoke
    PLAYWRIGHT_BASE_URL=https://pornvideodownloaders.com \
      PLAYWRIGHT_WEB_SERVER_COMMAND=true pnpm test:e2e:pornvideodownloaders

The suites exercised home, category, listing, search, RSS, sitemap, and tenant-specific
public behavior without starting a mutating local initialization command.

## Validation and acceptance

- The local harness catches changed-file Biome drift: focused harness contract test
  and `pnpm harness:check`.
- Private islands and stale dependency/configuration edges are gone without unresolved
  imports: frozen install, TypeScript boundary, repository lint, and package list.
- Both sites retain Worker compatibility and explicit identity: Worker configuration
  validation and both explicit Worker builds.
- D1-only catalog and tenant boundaries remain unchanged: architecture guard and D1
  contract suite.
- Public behavior remains unchanged: the existing SERP smoke suite and dedicated PVD
  multisite smoke suite.
- CLI publishing is retired as a coherent product surface: repository workflow tests,
  package list, and a repository-wide search for CLI and Changesets references.
- Recovery evidence remains untouched: repository diff contains no retirement-evidence
  operation and no update to its active retention plan.
- No deployment, package publish, or local/remote D1 schema or catalog mutation occurs.
  Public browser validation is read-only.

## Idempotence and recovery

Install, lint, typecheck, tests, Worker builds, and browser smoke commands are safe to
retry. Package deletion is recorded in Git and recoverable by reverting the relevant
milestone commit or patch; no remote package unpublish is attempted. Lockfile generation
is repeated from the final manifests and verified with a frozen install.

If a private-package consumer is discovered, restore that package and its exact manifest
edge before continuing. If a public CLI obligation is discovered, stop the CLI milestone,
record it under Surprises, and leave its release surface intact until the obligation is
resolved. Do not use the recovery evidence, deploy a Worker, or mutate any D1 database
as a rollback mechanism.

## Interfaces and dependencies

The affected interfaces are the root harness step list, workspace package manifests,
application environment declarations, TypeScript path aliases, hooks package exports,
active validation scripts, Turbo task environment inputs, Lefthook command exclusions,
the public CLI binary/package contract, Changesets release configuration, and GitHub
release workflow.

The preserved interfaces are the site target registry, server-only D1 catalog and
submission repositories, `DB` and `D1_RUNTIME_ENV` binding contracts, checked-in
Wrangler templates, public site routes, and protected Worker release workflows.

## Important artifacts

- GitHub issue #23 contains the accepted product and testing specification.
- The completed safe architecture cleanup records the starting architecture at merged
  commit `8a3f271`.
- This plan records command output and residual risk as milestones complete.

## Publication review evidence

The final uncommitted implementation was moved intact from `main` to
`agent/package-island-cleanup`. A fresh fetch confirmed that `HEAD`, `origin/main`, and
their merge base were still `8a3f2714f879a269fb32c29aa68927b629edcd39`.

The evidence-first review ran:

    pnpm install --frozen-lockfile
    pnpm exec vitest run scripts/harness/biome-changed.test.ts scripts/pr-review-workflow.test.ts
    pnpm why @upstash/redis --recursive
    pnpm -r list --depth -1
    pnpm harness:fast
    pnpm harness:check
    git diff --check

The frozen install resolved all 14 workspaces from the checked-in lockfile. The focused
suite passed 2 files and 8 tests. `pnpm why` confirmed the remaining Upstash package is
only Drizzle ORM's optional peer in each app. The fast harness passed in 16.2 seconds,
and the full harness passed all nine steps in 41.6 seconds, including 43 test files,
233 passing tests, one skipped test, Worker configuration validation, and both
OpenNext Worker builds.

The final path audit found no changes under D1 migrations/publications/artifacts,
Wrangler templates, the active site registry, protected Worker/D1 workflows, or the
external retirement-evidence plan. The retained console-log rule differs from its
deleted source only in its ownership header comments; its executable body is
unchanged. Both app trees changed, so `.github/workflows/pr-review.yml` selects the
pull-request E2E job. That clean-runner result remains the authoritative evidence not
available from the uncommitted local checkout.

## Outcomes and retrospective

The repository now has 14 workspaces instead of 18. The newsletter, rate-limiting,
validators, and public CLI packages are gone; the content package retains only live
collections, and the hooks package retains its consumed debounce export. Both apps no
longer declare the removed packages, redundant direct hooks/observability edges,
Upstash Redis, unused CLI aliases, or retired environment inputs.

The CLI retirement removed its 725-entry registry, source, tests, docs, Changesets
surface, and package-release workflow as one rollback boundary. No npm unpublish or
other external mutation was attempted. Root harness ownership is stronger because
Vitest and tsx are now declared by the root commands that use them.

The full harness now has nine deterministic steps. Its changed-file Biome step checked
15 supported changed files and matches pull-request CI while avoiding 108 unrelated
pre-existing repository-wide Biome failures. The final full harness passed 43 test
files with 233 tests passed and one skipped, all Worker configuration checks, and both
OpenNext Worker builds. Frozen installation passed from the regenerated lockfile.

Read-only live browser evidence passed all 8 SERP parity interactions and all 4 PVD
tenant/D1 smoke checks. Local browser evidence remains unavailable without initializing
the retained local D1 state, which was deliberately not done. Protected pull-request
checks remain the publication-time evidence because this implementation did not create,
push, or merge a branch.

The only repeated build warning is the pre-existing duplicate `options` key reported
inside generated OpenNext bundles; it is unchanged from baseline and does not fail
either Worker build. The external retirement recovery record remains untouched and
retained through at least 2026-10-28.
