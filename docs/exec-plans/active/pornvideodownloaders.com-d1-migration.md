# Migrate pornvideodownloaders.com into the D1 multisite platform

Status: active  
Owner: platform and catalog data  
Created: 2026-07-30  
Last updated: 2026-07-30

## Purpose and big picture

Add `pornvideodownloaders.com` as the second independently deployable site in this
monorepo. The public site must preserve the approved legacy catalog, presentation,
routes, search, RSS, sitemap, canonical URLs, redirects, analytics, and submission
behavior while reading catalog data only from its own Cloudflare D1 database. A
maintainer must be able to build, validate, back up, migrate, import, verify, deploy,
and roll back this site without selecting or mutating `serp.software`.

The result is observable when both sites pass isolated local D1 and browser checks,
the protected preview rehearsal succeeds, the protected production workflow deploys
the reviewed release commit, and live checks pass on
`https://pornvideodownloaders.com`.

## Context and orientation

The original application is `apps/serp.software`; this work adds the independent
`apps/pornvideodownloaders.com` Worker and activates its checked-in site contract.
The shared runtime and release tools now require an explicit active site.

The authoritative legacy source is the `main` branch of
`https://github.com/serpcompany/json-directory-template.git` at commit
`0326c8acd129b10625ee31c2700d11161f60e21f`. It is frozen in the detached checkout
`/Users/devin/dev/repos/json-directory-worktrees/pornvideodownloaders-main`.
The source site is `sites/pornvideodownloaders.com`. Legacy catalog files remain
external evidence and must never be copied into this repository or used at runtime.

Temporary evidence belongs under ignored
`tmp/migrations/pornvideodownloaders.com/`. Committed initial SQL and parity evidence
will use a site-specific directory under `d1/artifacts/`.

The first preflight found 286 listings and three categories. It reported 52 products
without an explicit product-level category and one category without a description.
The legacy site's checked-in `trial-products-json` adapter supplies the configured
`video-downloaders` category to records that omit categories; that behavior must be
proved from the frozen source and recorded as an explicit mapping rule before
artifact generation. The missing category description must be preserved as an empty
description unless a reviewed source change supplies text.

## Progress

- [x] 2026-07-30 06:35 JST Created isolated branch
  `codex/pornvideodownloaders-d1-migration` and worktree with isolated runtime state.
- [x] 2026-07-30 06:35 JST Froze GitHub `main` at
  `0326c8acd129b10625ee31c2700d11161f60e21f` and captured initial preflight evidence.
- [x] 2026-07-30 07:25 JST Completed the source inventory, resolved every preflight
  issue through documented legacy adapter semantics, and approved the
  field/asset/normalization maps.
- [x] 2026-07-30 07:25 JST Implemented and tested explicit per-site application, D1,
  Worker, artifact, publisher, submission, and workflow boundaries.
- [x] 2026-07-30 06:55 JST Generated deterministic initial SQL and parity evidence
  twice with byte-for-byte equality.
- [x] 2026-07-30 07:18 JST Proved fresh local migrations, checksum-protected
  idempotent import, exact D1 parity, tenant-only rows, fail-closed client site
  selection, and representative desktop/mobile public routes.
- [x] 2026-07-30 07:36 JST Passed `pnpm harness:check`: all eight gates,
  164 repository tests, 36 D1 contract tests, all four Worker configs, and both
  OpenNext Worker builds succeeded.
- [x] 2026-07-30 07:40 JST Added and passed the explicit
  `pnpm test:e2e:pornvideodownloaders` browser command: four exact-tenant desktop,
  route, sitemap/feed, and mobile checks succeeded against the isolated PVD Worker.
- [x] 2026-07-30 07:45 JST Completed the final independent migration-police review.
  It confirmed tenant/D1 isolation and found one release-blocking stale
  `serp.software` backup-retention path; the workflow and its test were corrected
  and retested.
- [x] 2026-07-30 07:46 JST Rebased the migration commit onto current
  `origin/main` (`208759a`); the branch is now exactly one migration commit ahead
  with no unrelated ancestor.
- [x] 2026-07-30 08:00 JST Provisioned isolated Cloudflare D1 databases:
  preview `pornvideo-downloaders-preview`
  (`f92694b0-af7d-4c13-91f2-ee0393af9bdd`) and production
  `pornvideo-downloaders-production`
  (`d934a6c2-b382-4c50-a220-1e9dc0e5f8e5`).
- [x] 2026-07-30 08:05 JST Provisioned `main`-only protected GitHub environments
  `pornvideodownloaders-preview` and `pornvideodownloaders-production`, and stored
  their account, D1, and Worker resource identities as environment secrets.
- [x] 2026-07-30 08:10 JST Opened reviewed release PR
  `https://github.com/serpcompany/directory-platform-d1/pull/12`; build, type,
  unit, and explicit second-site browser checks passed on the initial run.
- [ ] Rehearse the protected preview backup/migrate/import/verify/deploy/recovery flow.
- [ ] Merge the reviewed release, run the protected production workflow, verify the
  public domain, and monitor the observation window.
- [ ] Complete cleanup and move this plan to `docs/exec-plans/completed/`.

## Surprises and discoveries

- Observation: The ordinary legacy checkout is clean but one commit ahead of GitHub
  `main`; that commit transfers `serp.software` ownership and deletes its legacy
  runtime, so it is not the user-referenced source cutoff.
  Evidence: local `HEAD` is `783724e81f452ccea8595466cce690f26a46870a`;
  `git ls-remote origin refs/heads/main` returned
  `0326c8acd129b10625ee31c2700d11161f60e21f`.
- Observation: Preflight exits nonzero because 52 of 286 products omit explicit
  categories, while the legacy site uses a source adapter with a site-level
  `video-downloaders` category.
  Evidence:
  `tmp/migrations/pornvideodownloaders.com/preflight.json` and frozen
  `sites/pornvideodownloaders.com/site-config.ts`.
- Observation: This migration worktree was created from local commit `d15c9fc`, one
  commit ahead of `origin/main` (`052b62a`). The ancestor contains the completed
  human-badge ExecPlan and is not part of this migration.
  Evidence: `git rev-list --left-right --count origin/main...HEAD` returned `0 1`
  before migration edits.
- Observation: The current legacy deployment publishes `launchbuzz.io` and exposes
  286 listing sitemap URLs, three category routes plus featured, eight page sitemap
  URLs, and JSON Feed content at `/rss.xml`.
  Evidence: live HTTP capture on 2026-07-30 and the frozen generated app.
- Observation: The frozen source references 91 local catalog media paths; 25 are
  absent from both its checked-in and generated public trees. They are pre-existing
  source gaps, not migration drops. The platform's generic listing fallback icon was
  added to the second app to avoid a separate fallback 404.
  Evidence: `tmp/migrations/pornvideodownloaders.com/asset-inventory.json` and the
  local Worker request log.
- Observation: The first browser run rendered the server HTML but the client error
  boundary because shared client code read `process.env` indirectly, preventing
  Next.js from inlining `NEXT_PUBLIC_SITE_ID`.
  Evidence: browser console error `SITE_ID or NEXT_PUBLIC_SITE_ID is required`.
  Direct public-environment access plus the site-bound Next config fixed hydration;
  the rerun had the full 286-product UI and no horizontal overflow at 390 px.
- Observation: Fresh local D1 parity is 286 listings, three categories, 519 category
  memberships, 286 primary memberships, 1,752 FAQs, 138 media rows, 1,971 resource
  links, six featured listings, publication version 1, and checksum
  `5f692bca14184318a5517a0713efde0fd6af1629424291be538faaace96c4f8a`.
  Evidence: site-explicit local import and enhanced verification on 2026-07-30.
- Observation: The first reusable multisite Playwright alias still started the
  default `serp.software` Worker unless callers supplied a long web-server override;
  after making `E2E_SITE_ID` select the local D1 commands and port, its initial PVD
  fixture also exposed a stale SERP title and truncated slug.
  Evidence: the wrong process was
  `scripts/d1-local-guard.ts preview --site serp.software`; the corrected explicit
  command uses `321tube-downloader` / `321tube Video Downloader` and passed all four
  tests.
- Observation: `origin/main` advanced from `052b62a` to `208759a` while this work was
  in progress. Its tree is byte-identical to local base `d15c9fc`; only the
  squash-merge commit identity differs.
  Evidence: `git diff --stat d15c9fc origin/main` produced no output after
  `git fetch origin --prune`.
- Observation: The final independent audit found that generalized backups now write
  to a site/environment namespace, while the existing SERP production workflow
  still retained `.wrangler/backups/<sha>.sql`. Because missing artifacts are fatal,
  that would have stopped every SERP release before migration.
  Evidence: corrected retention path is
  `.wrangler/backups/serp-software/production/<sha>.sql`, and the focused workflow
  and release tests pass.

## Decision log

- Decision: Use migration SOP Option B with an explicit application/Worker boundary
  and a distinct local, preview, and production D1 database for
  `pornvideodownloaders.com`.
  Rationale: The user explicitly wants proof that this repository is a multisite
  monorepo. Separate databases, bindings, protected environments, confirmations,
  backups, and deployments give site-level isolation and avoid an unapproved shared
  physical D1 tenancy design.
  Date: 2026-07-30.
- Decision: Freeze the public GitHub `main` commit
  `0326c8acd129b10625ee31c2700d11161f60e21f`, not the local source checkout's
  unpublished successor.
  Rationale: This is the exact authoritative branch the user linked, and a detached
  checkout makes its source hashes reproducible.
  Date: 2026-07-30.
- Decision: No production or preview database mutation will be run locally.
  Rationale: The deploy runbook requires protected GitHub workflows, site-specific
  confirmation phrases, backups, clean reviewed commits, and environment approval.
  Date: 2026-07-30.
- Decision: Preserve `launchbuzz.io` as the sole `product-launch-websites` listing.
  Rationale: Although the source README calls the catalog adult-only, the frozen
  source explicitly contains this record and the current public product and category
  routes publish it. Excluding it would create an unexplained parity drop. The source
  inconsistency is accepted and must remain visible in the normalization report.
  Date: 2026-07-30.
- Decision: Map the 52 records without explicit categories to only
  `video-downloaders`, and use adapter index semantics for the first six featured
  records unless a record has an explicit `featured` value.
  Rationale: This is the exact checked-in `trial-products-json` transformation in the
  frozen source; adding `adult` would invent a membership absent from current public
  behavior.
  Date: 2026-07-30.
- Decision: Preserve the empty `video-downloaders` category description.
  Rationale: The preflight warning reflects the frozen source. Inventing descriptive
  copy would violate fact-preserving migration; the empty value is valid in D1.
  Date: 2026-07-30.
- Decision: Before PR or deployment, rebase or rebuild the migration branch on a
  reviewed `main` that already contains `d15c9fc`, or otherwise remove that unrelated
  ancestor from the migration branch.
  Rationale: Production must not silently ship an unrelated unmerged commit; the
  protected workflow must run from a clean reviewed `main` release commit.
  Date: 2026-07-30.
- Decision: Adopt the platform's D1-staged, badge-verified, private notification, and
  protected approval workflow for new submissions; preserve the source's public
  social links as presentation metadata.
  Rationale: Catalog authority and publication provenance must remain in D1 for both
  sites. A GitHub issue is a reviewer notification, never an alternate catalog.
  Date: 2026-07-30.
- Decision: Preserve the 25 missing catalog media references and document them rather
  than inventing or substituting source media.
  Rationale: The authoritative source contains the references but no corresponding
  files. Silent substitution would break content parity; the UI's existing media
  failure behavior remains applicable.
  Date: 2026-07-30.

## Plan of work

### Milestone 1: source evidence and mapping

Inventory legacy config, content, assets, catalog shape, generated adapter semantics,
routes, redirects, analytics, forms, SEO, RSS, sitemap, and current public behavior.
Write `source-inventory.md`, `field-map.md`, `normalization-report.json`,
`asset-inventory.json`, `route-samples.txt`, and `rollback-plan.md`. Update preflight
or add a mapping-stage parser so the site-level category rule is explicit, validated,
and test-covered rather than silently inferred. Acceptance is zero unexplained
issues, zero unexplained drops, source commit plus SHA-256 hashes on every report,
and a documented cutoff/delta policy.

### Milestone 2: multisite platform boundaries

Audit every hard-coded site, Worker, D1, artifact, publisher, submission, and workflow
boundary. Implement an explicit exhaustive site definition selected at server/build
boundaries, never a default. Create the second app/Worker boundary and checked-in
presentation configuration. Parameterize local state, Wrangler configuration,
artifact selection, parity verification, publication schemas, remote plans,
submission workflows, and protected confirmations. Add cross-site tests proving
queries and mutations cannot cross tenant or database boundaries and that failure or
rollback of one site cannot select the other.

### Milestone 3: deterministic initial artifact

Parse only the frozen external source into precise types and map it directly to
site-specific SQL batches and committed parity evidence. Preserve source order,
adapter category semantics, the first six featured records unless explicit record
flags override that legacy rule, publication date `2026-05-03`, repeatable ordering,
and all supported fields. Use deterministic stable IDs derived from reviewed site ID
and source identity, collision checks, bounded batches, and a checksum-protected
idempotent import. Generate twice in separate temporary output roots and require
byte-for-byte equality.

### Milestone 4: local parity and runtime evidence

Initialize only the new site's isolated local D1, apply fresh migrations, import, and
verify exact counts, slugs, memberships, primary categories, repeatables, checksums,
publication state, and audit rows. Independently run route, search, RSS, sitemap,
canonical, redirect, branding, analytics, submission, desktop, mobile, missing
binding, and wrong-environment checks. Re-run `serp.software` checks to prove no
regression or shared state.

### Milestone 5: reviewed release and protected deployment

Run the full harness, inspect the complete diff, commit and push the migration branch,
obtain review, and merge to `main`. Through site-specific protected workflows only:
create/confirm isolated preview and production resources, retain backups, apply
migrations, import only into expected empty publication state, verify exact parity,
deploy the Worker, and exercise the public route checklist. A verification failure
stops deployment. Preserve the legacy deployment through the agreed observation
window.

### Milestone 6: closure

Confirm no copied catalog or JSON runtime exists, update architecture/data/development
and deploy documentation, retain rollback artifacts, record final workflow URLs and
live evidence, archive or supersede the legacy deployment after the observation
window, and move this plan to completed.

## Concrete commands

Run commands from:

```text
/Users/devin/dev/repos/directory-platform-d1-worktrees/pornvideodownloaders-d1-migration
```

Source identity and preflight:

```bash
git -C /Users/devin/dev/repos/json-directory-worktrees/pornvideodownloaders-main rev-parse HEAD
pnpm migration:preflight -- \
  --source-root /Users/devin/dev/repos/json-directory-worktrees/pornvideodownloaders-main \
  --site-id pornvideodownloaders.com \
  --output tmp/migrations/pornvideodownloaders.com/preflight.json
```

The first command must print the frozen commit. The final mapping-aware preflight
must report `readyForMapping: true`, 286 listings, three categories, and no
unexplained issues.

Local and repository acceptance commands:

```bash
pnpm worktree:doctor
pnpm d1:pornvideodownloaders:local:migrate
pnpm d1:pornvideodownloaders:local:import
pnpm d1:pornvideodownloaders:local:verify
pnpm harness:fast
pnpm test:e2e:smoke
pnpm harness:check
```

Remote plan commands must remain read-only and print the selected site, Worker,
database name/ID, environment, artifact, expected checksum, and intended action.
Exact protected mutation commands and workflow inputs will be recorded only after
their interfaces exist and pass tests. No local command may accept preview or
production credentials.

## Validation and acceptance

- Source authority: frozen commit and all source file SHA-256 hashes in preflight,
  mapping, normalization, asset, and committed parity evidence.
- Data parity: exact listing/category slug sets, counts, membership order, one primary
  active category per public listing, repeatable order/counts, row checksums,
  publication checksum/version, and audit provenance from a fresh local D1.
- Isolation: tests select both sites explicitly and reject unknown/missing identities;
  each site resolves distinct app, Worker, D1, artifact, confirmation, protected
  environment, local state, and remote target values.
- Runtime: captured home, representative product/category, search hit/empty, RSS,
  sitemap, canonical, and redirect evidence on desktop and mobile; missing/wrong D1
  environments fail closed.
- Release: reviewed clean `main` commit, retained preview/production backups, protected
  workflow logs showing migrate/import/verify before deploy, and post-release live
  route evidence.
- Regression: `pnpm harness:check` and existing `serp.software` local/runtime checks
  pass from the release commit.

## Idempotence and recovery

Local and remote initial import may initialize an empty publication state or no-op on
the exact expected checksum; it must refuse a different existing publication. Each
site uses its own D1 database, so retry and rollback commands must require the site
and environment explicitly and print the resolved target before mutation.

Before preview or production mutation, retain a D1 export in the protected workflow.
If import or exact verification fails, stop before Worker deployment. If Worker
deployment fails after valid D1 verification, roll back the Worker version without
overwriting D1. If D1 is wrong, stop publication, inspect the retained export, obtain
fresh production approval, restore through the reviewed Cloudflare procedure, and
repeat exact verification. Keep the existing legacy deployment available until the
observation window closes.

The isolated source checkout and generated temporary evidence are reproducible from
the recorded commit. Never use the legacy catalog as a rollback after D1 publications
begin.

## Interfaces and dependencies

Expected interfaces include an exhaustive server-side site definition; site-bound
catalog/submission repositories; site-specific Wrangler build/deploy configuration;
site-explicit local D1 guard and agent runtime manifests; site-bound initial artifact
and parity schemas; site-bound publisher/approver/notifier/release commands; protected
GitHub workflow inputs, environments, and confirmations; and shared page behavior
from `packages/web-core`.

External dependencies are the frozen GitHub source, Cloudflare Workers and distinct
D1 resources, DNS/custom domain control, GitHub protected environments/secrets, and
review/merge authority. The ExecPlan does not grant any of those mutation
permissions.

## Important artifacts

- Ignored preflight:
  `tmp/migrations/pornvideodownloaders.com/preflight.json`
- Frozen source:
  `/Users/devin/dev/repos/json-directory-worktrees/pornvideodownloaders-main`
- Committed parity report, workflow runs, backups, browser evidence, and live-route
  checks: to be added as milestones complete.

## Outcomes and retrospective

In progress. Final outcomes must compare the live second-site result with the purpose
above, cite exact validation and protected workflow evidence, describe the
observation window, and list residual risks or harness improvements.
