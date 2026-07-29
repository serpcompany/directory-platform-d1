# Replace GitHub issue submissions with verified D1 intake

Status: active  
Owner: serp.software application and D1 release pipeline  
Created: 2026-07-30  
Last updated: 2026-07-30

## Purpose and big picture

The public `https://serp.software/submit` experience must create a private, normalized
D1 submission rather than opening a GitHub issue. The submitter receives the exact
featured badge markup, installs it on the submitted website, and asks the application
to verify it. Only a successful server-side badge check makes the record eligible for
maintainer review. Publication remains a separate, protected production operation, so
untrusted public input can never become a public listing by itself.

A user can observe completion by submitting through the live form, seeing a pending
badge state, installing the badge, and seeing a verified/awaiting-review state. A
maintainer can approve a verified submission through a protected workflow and then
observe the new D1-backed listing route. No part of this path depends on GitHub Issues
or a catalog JSON/YAML runtime.

## Context and orientation

The existing public catalog schema is in `d1/migrations/`, and server-side catalog
access is isolated under `apps/serp.software/lib/catalog/`. The current form is
`packages/web-core/src/forms/github-issue-submit-form.tsx`; it only builds a prefilled
issue URL. The old public `serpcompany/serp.software` repository owns that issue
surface and a stale badge workflow. The private `serpcompany/directory-platform-d1`
repository owns the deployed Worker and production D1 database.

“Submission” means private staging data. “Verified” means that a bounded server-side
fetch found the expected dofollow badge link on the submitted public site. “Approved”
means a maintainer used the protected production workflow to atomically promote the
verified record into the public catalog tables.

Repository constraints:

- D1 is the sole catalog and submission data store.
- Browser code calls route handlers and never imports the D1 binding.
- Runtime values use prepared statements and bound parameters.
- Repeatable resources and FAQs are normalized rows, not serialized blobs.
- Production migrations and publication run only through protected GitHub Actions.
- Existing unrelated dirty-worktree changes belong to the preceding harness work and
  must be preserved.

## Progress

- [x] 2026-07-30 22:30 JST Audited the public form, old public repository, reusable
  workflow, D1 catalog, Worker bindings, and release boundary; confirmed the current
  issue workflow is stale and cannot update the live D1 catalog.
- [x] 2026-07-30 02:00 JST Added failing then passing contract tests for creation, status authorization, badge
  verification, public-catalog isolation, and maintainer approval.
- [x] 2026-07-30 02:05 JST Added and locally migrated normalized submission, child,
  audit, and rate-limit tables plus the server-only repository.
- [x] 2026-07-30 02:14 JST Replaced the GitHub issue form with D1 create/status/verify
  APIs and UI; real local HTTP evidence showed capability privacy, failed-verification
  isolation, normalized children, and zero public listings for the staged slug.
- [x] 2026-07-30 02:15 JST Added a protected, auditable maintainer approval path that promotes only verified
  rows and preserves publication provenance.
- [x] 2026-07-30 02:16 JST Removed obsolete GitHub issue submission code, workflows, templates, tests, and
  live configuration references.
- [x] 2026-07-30 02:18 JST Proved local schema, API, UI capture, catalog isolation,
  approval transaction, Worker build, and the full eight-stage harness.
- [ ] Commit and push the reviewed source.
- [ ] Back up and migrate production D1, deploy the Worker, and verify live behavior.
- [ ] Disable the old repository’s issue intake and Pages deployment after live
  verification.

## Surprises and discoveries

- Observation: The old public repository has Issues enabled but has never received an
  issue, and its badge workflow invokes a different repository’s stale JSON-writing
  reusable workflow.
  Evidence: GitHub repository settings and
  `.github/workflows/verify-badge.yml` in `serpcompany/serp.software`.
- Observation: The private repository already contains a D1-aware proposal workflow,
  but the public repository does not call it and its Actions access policy does not
  permit that integration.
  Evidence: `.github/workflows/reusable-verify-badge.yml` and GitHub Actions access
  settings.
- Observation: The deployed Worker already has the correct `DB` binding in local,
  preview, and production Wrangler configuration, so intake needs schema and
  application work rather than a second storage product.
  Evidence: `wrangler.jsonc`, `wrangler.preview.jsonc`, and
  `wrangler.production.jsonc`.

## Decision log

- Decision: Store submissions, resources, FAQs, verification attempts, and audit
  events in normalized D1 tables.
  Rationale: This prevents a new hidden JSON/YAML catalog and makes submission state
  queryable and auditable.
  Date: 2026-07-30.
- Decision: Return a high-entropy capability token once and store only its SHA-256
  digest. Require the token for public status and verification operations.
  Rationale: Submission details are private and the site has no submitter account or
  email identity.
  Date: 2026-07-30.
- Decision: Badge verification changes only the staging state; protected maintainer
  approval performs publication.
  Rationale: A backlink proves site control, not listing quality or safety.
  Date: 2026-07-30.
- Decision: Reuse the existing production release authorization, backup, migration,
  and provenance model for approval.
  Rationale: Public input must not create a second, less-protected production mutation
  channel.
  Date: 2026-07-30.

## Plan of work

Milestone 1 defines pure request/response schemas and tests the four boundaries:
create, authenticated status, badge verification, and protected approval. Tests first
prove that an unverified record cannot be approved and that verification does not
alter public catalog eligibility.

Milestone 2 adds a forward-only migration, Drizzle schema declarations, and a
server-only submission repository. Creation validates category and slug uniqueness,
stores normalized children in one D1 batch, and returns an opaque access capability.
Status and verification look up the row by submission id plus token digest.

Milestone 3 adds route handlers and a bounded verifier. The verifier rejects
non-public targets and unsafe redirects, enforces timeout/content-type/body-size
limits, and requires the expected badge image inside an anchor to the future listing
URL without `nofollow`. Attempts are cooldown- and count-limited.

Milestone 4 replaces the client form. The first action creates a pending submission
and displays light/dark badge markup. The second action verifies the installed badge
and displays precise pending, failed, verified, or awaiting-review states. The UI no
longer opens GitHub.

Milestone 5 adds a manually dispatched, production-environment-protected approval
workflow and deterministic approval script. It confirms the remote D1 identity,
retains a backup, migrates first, validates the row is verified, then atomically
creates the listing and normalized children while recording publication provenance
and marking the submission approved.

Milestone 6 removes the obsolete GitHub issue intake code and documentation, runs
local schema/API/UI/approval proof and the full harness, then performs the authorized
production backup, migration, deployment, and live checks. Only after the live form
works will the old repository’s Issues and Pages submission surface be disabled.

## Concrete commands

Run from `/Users/devin/dev/repos/directory-platform-d1`:

    pnpm exec vitest run <new submission contract and repository tests>
    pnpm d1:local:migrate
    pnpm d1:local:verify
    pnpm agent:dev
    pnpm exec playwright test <submission UI/API scenario>
    pnpm worker:build
    pnpm harness:check

Expected observations are: all submission tests pass; local D1 contains the new
tables; an unverified submission is absent from public catalog queries; a valid badge
moves it to verified; approval creates exactly one public listing and is idempotent;
the Worker build and full harness exit zero.

Production commands are run only through the protected workflows documented in
`docs/DEPLOY_RUNBOOK.md`. Expected evidence includes the retained pre-change export,
successful migration/verification steps, deployed version id, live API/UI behavior,
and an unchanged catalog count before approval.

## Validation and acceptance

- D1-only intake: inspect the schema and query a created row plus normalized children.
- Capability privacy: status and verification reject missing/incorrect tokens without
  revealing record existence.
- Badge gate: fixtures cover missing badge, wrong destination, `nofollow`, oversized
  response, unsafe target/redirect, timeout, and success.
- Publication isolation: public catalog counts/routes do not change at create or
  verify time.
- Protected approval: unverified approval fails; verified approval is atomic,
  provenance-recorded, and safe to retry.
- UI: browser evidence shows create, badge instructions, verification failure, and
  verified awaiting-review states without a GitHub navigation.
- Legacy removal: repository search finds no submission dependency on GitHub Issues,
  proposals, or catalog JSON/YAML.
- Production: live `/submit`, API, D1 migration, and Worker deployment are verified
  after backup, while ordinary public catalog routes remain healthy.

## Idempotence and recovery

Creation rejects duplicate active slugs and uses stable submission ids. Verification
updates one authorized row and can be safely retried within explicit attempt and
cooldown limits. Approval records the submission id as the source identity and rejects
an already-approved or already-published slug; a retry reports the completed state
instead of duplicating children.

Before any production mutation, retain a D1 export. If migration succeeds but Worker
deployment fails, the additive schema is inert and the prior Worker continues to read
the existing catalog. If the new Worker fails before approval, roll back the Worker
version; pending submissions remain private. Publication recovery follows the
existing run provenance and D1 backup procedure. Re-enabling the old issue flow is
not a rollback mechanism.

## Interfaces and dependencies

Required interfaces include submission Zod schemas, a server-only D1 repository,
`POST /api/submissions`, `GET /api/submissions/:id`,
`POST /api/submissions/:id/verify`, a bounded badge scanner/fetcher, and a protected
approval CLI/workflow. Dependencies remain Next.js route handlers, the OpenNext
Cloudflare `DB` binding, D1 prepared statements/batches, Web Crypto, and the existing
Worker release tooling.

## Important artifacts

This section will link the migration, test evidence, local browser capture, production
workflow run, retained backup identity, deployed Worker version, and live-route
checks as they are produced.

## Outcomes and retrospective

Pending implementation and evidence.
