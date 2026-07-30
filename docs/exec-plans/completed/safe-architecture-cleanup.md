# Remove stale tooling and concentrate deployment configuration

Status: completed
Owner: repository architecture
Created: 2026-07-30
Last updated: 2026-07-30

## Purpose and big picture

Reduce misleading root-level repository surface without changing either production
site, D1 data, Worker identity, or deployment behavior. After this work:

- obsolete Cursor and contributor tooling is absent;
- the existing `llmstxt-cli` registry snapshot builds without attempting to read the
  intentionally removed legacy catalog source;
- checked-in Wrangler templates are grouped under `configs/wrangler/<site-id>/`;
- local, preview, and production environment isolation remains mechanically checked.

The shared D1 runtime, data-operations implementation, and site-target authority are
explicitly deferred. Those deeper changes should follow a separate engineering
harness effort that makes repository knowledge, architectural constraints, isolated
runtime evidence, and remediation-oriented checks more complete.

## Context and orientation

The repository operates `serp.software` and `pornvideodownloaders.com` as isolated
OpenNext Workers. `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, and
`docs/BUILD_PIPELINE.md` are the current architectural authority. There is no
`CONTEXT.md` or `docs/adr/` directory.

Six checked-in Wrangler templates currently occupy the repository root. The
configuration file directory is significant: Wrangler resolves the Worker entrypoint,
asset directory, and D1 migration directory relative to the checked-in configuration.
Remote release commands materialize ignored, environment-specific configurations at
the repository root; commit `17f8789` intentionally established that generated
placement. This plan moves checked-in templates but preserves generated configuration,
state, and backup locations.

The `packages/cli/data/registry.json` snapshot contains 725 records and has SHA-256
`c162e182cce17cddb5309b18c73e7d77665899355b84189dffcc289a60b58643`.
`packages/cli/scripts/build-registry.ts` still reads
`packages/content/data/websites`, which was intentionally removed when the repository
became D1-only. The CLI release workflow therefore fails before packaging. This plan
preserves the snapshot byte-for-byte and removes the stale regeneration step. Whether
the CLI, Changesets, and their release workflow remain owned by this repository is a
separate product/support decision.

No command in this plan authorizes Cloudflare access, a Worker deployment, or D1
mutation.

## Progress

- [x] 2026-07-30 16:44 JST — Recorded a clean baseline at `7dce793`; all four
  checked-in remote Wrangler templates validated and 33 focused architecture/D1
  tests passed.
- [x] 2026-07-30 17:00 JST — Reviewed OpenAI's harness-engineering guidance and
  recorded the harness prerequisite for the deferred deepening work.
- [x] 2026-07-30 17:00 JST — Removed stale contributor and Cursor tooling,
  regenerated the lockfile, and proved no live consumer remains.
- [x] 2026-07-30 17:01 JST — Preserved the 725-record CLI registry snapshot at its
  original checksum; CLI build, tests, and typecheck passed.
- [x] 2026-07-30 17:05 JST — Relocated checked-in Wrangler templates, rebased
  generated root configuration, passed both site doctors, and built both Workers.
- [x] 2026-07-30 17:08 JST — `pnpm harness:check` passed all eight deterministic
  gates: 234 repository tests passed, one was intentionally skipped, and both
  OpenNext Worker builds completed.
- [x] 2026-07-30 17:20 JST — Follow-up review moved ignored materialized configs
  from the repository root into `.wrangler/generated/`; focused tests and Wrangler
  dry runs confirmed the rebased paths.

## Surprises and discoveries

- Observation: The failed CLI build is not a transient missing checkout artifact.
  The source directory it expects was deliberately deleted by the D1-only
  architecture change.
  Evidence: commit `0b289ec`, `packages/cli/scripts/build-registry.ts`, and the current
  absence of `packages/content/data/websites`.

- Observation: A different legacy website-MDX directory still contains three files
  at `packages/content/websites/data`, while the bundled CLI registry has 725 records.
  Treating those three files as the registry authority would silently replace the
  published snapshot.
  Evidence: file inventory and the recorded registry count/checksum above.

- Observation: Ignored generated Wrangler configuration was previously moved from
  `.wrangler/generated/` to the repository root to fix OpenNext path resolution.
  Evidence: commit `17f8789`.

- Observation: `.cursorrules` repeats a small subset of `AGENTS.md`, while
  `.all-contributorsrc` still names “JSON Directory Template” and has no README,
  workflow, or configuration consumer.
  Evidence: repository-wide reference scan.

- Observation: The ignored `.runtime/manifest.json` belonged to the checkout's old
  filesystem location and correctly caused both site doctors to fail closed.
  Evidence: `pnpm agent:doctor` reported paths escaping the current worktree.
  Reinitializing through `pnpm worktree:init -- safe-architecture-cleanup` made the
  runtime local and both doctors passed.

## Decision log

- Decision: Implement only architecture-review candidates 1, 2, and 3 now.
  Rationale: The user selected the low-risk cleanup scope and deferred deeper module
  changes until the engineering harness is strengthened.
  Date: 2026-07-30.

- Decision: Preserve `packages/cli/data/registry.json` byte-for-byte and remove its
  stale build-time regeneration rather than guessing a new source.
  Rationale: This restores the existing package build without changing CLI data or
  external behavior.
  Date: 2026-07-30.

- Decision: Put tracked templates under
  `configs/wrangler/<site-id>/<environment>.jsonc`.
  Rationale: Checked-in configuration gains locality by site and environment while
  remaining centrally discoverable.
  Date: 2026-07-30.

- Decision: Group ignored generated configuration under `.wrangler/generated/` and
  keep `.wrangler/state` and `.wrangler/backups` unchanged.
  Rationale: The earlier failure came from paths that were not rebased for the
  generated config's directory. Explicitly rebasing all path-bearing fields preserves
  OpenNext and Wrangler behavior without leaving generated files at the root.
  Date: 2026-07-30.

- Decision: Defer shared D1 runtime, data-operations, and site-target deepening until
  a separate harness-strengthening plan exists.
  Rationale: The next architecture phase should first establish repository-local
  design documentation, mechanically enforced dependency direction, isolated runtime
  evidence, and recurring documentation/quality checks, following the principles in
  OpenAI's “Harness engineering” article.
  Date: 2026-07-30.

## Plan of work

Milestone 1 removes `.all-contributorsrc`, `.cursorrules`, the three contributor
commands, and the three unused contributor dependencies. Regenerating the pnpm
lockfile must be the only dependency metadata change. The milestone is complete when
a repository-wide scan finds no contributor-tool or Cursor-rule consumer and the
fast harness passes.

Milestone 2 removes the stale CLI registry generator and its package command, leaving
the checked-in snapshot untouched. The CLI build, test, and typecheck must pass, and
the snapshot's count and checksum must equal the baseline. This milestone does not
decide whether the CLI should eventually be retired.

Milestone 3 moves the six tracked Wrangler templates under
`configs/wrangler/<site-id>/`. Paths inside the templates must become relative to
their new directory. Template validation must understand the checked-in location,
while materialized remote configuration must be rebased under
`.wrangler/generated/`. Update the exhaustive site target registry, checked-in site
configuration, app build/preview commands, tests, and current documentation
atomically.

Milestone 4 runs focused tests, both Worker builds, and the full non-deployment
harness. Review the diff and verify `git status` contains only intended source and
documentation changes.

## Concrete commands

All commands run from:

    /Users/devin/dev/repos/json-project-folder/directory-platform-d1

Dependency cleanup and residue checks:

    pnpm install --lockfile-only
    rg -n 'all-contributors|contributors:(add|generate|check)|cursorrules' \
      --glob '!pnpm-lock.yaml' .
    pnpm harness:fast

The scan should return no live source/configuration consumer.

CLI acceptance:

    shasum -a 256 packages/cli/data/registry.json
    node -e "const r=require('./packages/cli/data/registry.json'); console.log(r.length)"
    pnpm --filter ./packages/cli build
    pnpm --filter ./packages/cli test
    pnpm --filter ./packages/cli typecheck

The checksum must remain
`c162e182cce17cddb5309b18c73e7d77665899355b84189dffcc289a60b58643`
and the count must remain 725.

Wrangler acceptance:

    pnpm worker:config:validate
    pnpm exec vitest run \
      scripts/worker-release.test.ts \
      scripts/d1-cutover.test.ts \
      scripts/pornvideodownloaders-workflow.test.ts \
      scripts/worktree-harness.test.ts
    pnpm agent:doctor
    pnpm agent:pornvideodownloaders:doctor
    pnpm worker:build

Full acceptance:

    pnpm harness:check
    git diff --check
    git status --short

No command should contact or mutate a remote D1 database or deploy a Worker.

## Validation and acceptance

- Root cleanup is accepted when neither deleted file exists, no source/configuration
  references contributor tooling, and the lockfile contains none of the removed direct
  dependencies.
- CLI containment is accepted when its build/test/typecheck pass and registry
  checksum/count are unchanged.
- Wrangler relocation is accepted when all checked-in config paths resolve from their
  new location, the generated remote config remains rooted correctly, both sites pass
  configuration validation and doctor checks, and both Worker builds succeed.
- The complete change is accepted only when `pnpm harness:check` passes and no
  production or D1 operation has run.

## Idempotence and recovery

File moves and reference edits are safe to retry. `pnpm install --lockfile-only`
regenerates dependency metadata deterministically from the manifests. Tests may
rewrite ignored generated Wrangler configuration; those files are disposable and not
source authority.

If Wrangler relocation fails, restore the six tracked templates to their former root
paths and revert path-consumer changes together. Never retain a half-moved state. If
the CLI build changes the registry snapshot, restore the snapshot from Git before
continuing and correct the package build path; do not regenerate it from the
three-file legacy directory.

Rollback is a source revert. No backup, deployment rollback, or D1 recovery is
required because this plan performs no external mutation.

## Interfaces and dependencies

The affected source contracts are `SiteTarget.local.configPath`,
`SiteTarget.remote.previewConfigPath`, `SiteTarget.remote.productionConfigPath`,
`CheckedInSiteConfig.deploy`, the two app package build/preview commands, and the
Wrangler `main`, `assets.directory`, and `d1_databases[].migrations_dir` fields.

The relevant dependencies are pnpm, Wrangler, OpenNext, Vitest, the repository
harness, and the protected workflow adapters. Cloudflare resources are out of scope.

## Important artifacts

- Architecture report:
  `/var/folders/w0/zx_5mkt90n7bmrcy34y97sk40000gn/T/architecture-review-20260730-164422.html`
- Harness-engineering reference:
  `https://openai.com/index/harness-engineering/`
- Prior generated-config path fix: commit `17f8789`
- D1-only architecture change: commit `0b289ec`

## Outcomes and retrospective

The selected safe cleanups are complete:

- `.all-contributorsrc`, `.cursorrules`, three unused contributor commands, and their
  three direct dependencies were removed.
- The stale CLI registry generator and `build:registry` command were removed.
  `packages/cli/data/registry.json` remains byte-for-byte unchanged at 725 records and
  SHA-256
  `c162e182cce17cddb5309b18c73e7d77665899355b84189dffcc289a60b58643`.
  A repository test now keeps the release workflow on the checked-in snapshot.
- Six checked-in Wrangler templates now live under
  `configs/wrangler/<site-id>/`. All consumers and current documentation point to the
  new paths. Template paths are relative to their checked-in location; release
  materialization explicitly rebases Worker, asset, schema, and migration paths for
  ignored configs under `.wrangler/generated/`.
- `pnpm --filter ./packages/cli build`, CLI tests/typecheck, both site doctors,
  focused release/workflow tests, `git diff --check`, and the full repository harness
  passed. The final full gate reported 234 passing tests, one intentionally skipped
  test, valid Wrangler configuration, and successful Worker builds for both sites.
- No Worker was deployed and no local or remote D1 database was mutated.

Residual decisions are deliberately separate. The repository still needs a product
ownership decision for the legacy CLI, Changesets, and release workflow. OpenNext
build output still reports an upstream generated-bundle duplicate `options` key
warning, but both builds complete.

Before shared D1 runtime, data-operations, or site-target deepening, create a new
harness-strengthening ExecPlan. At minimum it should define a repository-local design
document index and beliefs, mechanically checked dependency direction, generated
schema/reference documentation, isolated runtime journeys with queryable evidence,
quality scoring for the affected modules, and recurring documentation/architecture
garbage collection. This follows the legibility, system-of-record, enforceable
invariant, feedback-loop, and entropy-control principles reviewed from OpenAI's
“Harness engineering” article.
