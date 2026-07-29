# Add a private draft listing preview

Status: active
Owner: submission intake and production operations
Created: 2026-07-30
Last updated: 2026-07-30

## Purpose and big picture

An administrator reviewing a badge-verified submission should be able to click one
link in its assigned private GitHub Issue and see the submission rendered through
the same listing-detail components used by the public site. The page must visibly
identify itself as an unpublished draft, remain absent from navigation and sitemaps,
reject callers without the private review capability, and stop rendering after the
submission is approved or rejected.

The preview remains a D1 read. It does not create a draft catalog row, publish a
listing, or introduce a file-backed representation.

## Context and orientation

The live notification flow is documented in
`docs/exec-plans/completed/submission-admin-inbox.md`. Verified submissions live in
`listing_submissions` and normalized child tables. The scheduled
`scripts/d1-submission-notifier.ts` creates an assigned issue and records its identity
in `listing_submission_notifications`.

The public detail route at `apps/serp.software/app/products/[slug]/page.tsx` renders
`WebsiteDetailRoutePage` with the application’s real detail-page slots. The private
preview will reuse those slots but suppress public structured data and surround the
render with a clear review banner.

The existing GitHub login route is disabled by site configuration, and production
does not currently define an administrator identity/role system. The private issue
therefore acts as the delivery boundary for an opaque bearer capability. Only the
SHA-256 digest is stored in D1. Possession of the raw issue link authorizes the
preview, so the response must not send a referrer, be cached, or be indexed.

## Progress

- [x] 2026-07-30 04:04 JST Audited the current notification ledger, issue recovery,
      submission schema, auth configuration, public detail renderer, and production
      release boundary.
- [x] 2026-07-30 04:06 JST Added migration `0008`, notifier token generation,
      private-issue delivery, recovery rotation, digest upsert, and migration-race
      handling with passing targeted tests.
- [x] 2026-07-30 04:07 JST Added the fail-closed D1 preview repository, public
      detail-renderer reuse, draft banner, structured-data suppression, privacy
      headers, and source/model contract tests.
- [x] 2026-07-30 04:10 JST Proved correct/wrong capability behavior, visual
      rendering, privacy headers, status-based revocation, private issue delivery,
      and the complete repository harness locally.
- [ ] Merge, deploy through the protected workflow, and prove a live assigned issue
      opens a private preview that expires after decline.

## Surprises and discoveries

- Observation: GitHub authentication exists in the inherited application, but
  `sites/serp.software/site-config.ts` intentionally sets `showAuth: false`, and the
  live `/login` route returns 404.
  Evidence: the checked-in feature flag and a live route request on 2026-07-30.
- Observation: the existing public detail renderer is already slot-based and accepts
  a `WebsiteDetailMetadata` object, so a preview can reuse it without querying or
  creating a public listing.
  Evidence: `packages/web-core/src/website-routes/detail-page.tsx` and
  `apps/serp.software/app/products/[slug]/page.tsx`.
- Observation: the reviewer repository is private, so the GitHub Issue is a valid
  delivery boundary for the raw capability.
  Evidence: `gh repo view serpcompany/directory-platform-d1 --json visibility,isPrivate`
  returned `PRIVATE` and `true` on 2026-07-30.

## Decision log

- Decision: authorize the preview with a random 256-bit bearer capability delivered
  only inside the assigned private GitHub Issue.
  Rationale: it provides a one-click reviewer experience without enabling and
  provisioning a separate OAuth/role system. D1 stores only its SHA-256 digest, and
  the submission status revokes access after either decision.
  Date: 2026-07-30.
- Decision: store the capability digest on the existing notification ledger.
  Rationale: the capability belongs to the GitHub notification/review channel, not
  the public submission capability or catalog. A nullable forward migration safely
  accommodates the already-closed production acceptance issue.
  Date: 2026-07-30.
- Decision: render verified submission data directly through
  `WebsiteDetailRoutePage`, with no related/adjacent items and no JSON-LD.
  Rationale: the reviewer sees the actual current listing layout while the draft
  remains outside all public catalog predicates.
  Date: 2026-07-30.

## Plan of work

Milestone 1 adds migration `0008_submission_review_preview.sql`. It adds a nullable,
unique `preview_token_hash` to `listing_submission_notifications`. The notifier
generates a fresh opaque token for each verified row needing notification or
backfill, includes the private preview URL in the issue, and stores only the digest.
If issue creation succeeds but the D1 write fails, retry updates the existing issue
with a newly generated link and records the matching digest.

Milestone 2 adds a server-only submission preview query. It validates a submission
UUID and token at the route boundary, hashes the token, queries only a `verified`
submission whose GitHub notification digest matches, hydrates its resource links,
and maps it to `WebsiteDetailMetadata`. The page reuses the production detail slots,
shows an unpublished/admin-review banner, returns a generic not-found result for
invalid, missing, decided, or mismatched access, and emits no public JSON-LD.

Milestone 3 adds private-route response headers and tests for the migration, token
digest, issue link, recovery, query predicates, route authorization, noindex/no-store
behavior, and draft rendering. Run the full harness and capture an isolated local
preview before review.

Milestone 4 merges reviewed source, runs the protected production backup/migration/
verify/deploy workflow, creates and badge-verifies a disposable production
submission, confirms its assigned issue contains a working preview, declines it, and
confirms the same link no longer renders the draft.

## Concrete commands

All commands run from `/Users/devin/dev/repos/directory-platform-d1`.

    pnpm exec vitest run scripts/d1-submission-notifier.test.ts \
      apps/serp.software/lib/submissions/review-preview.test.ts
    pnpm d1:local:migrate
    pnpm test:d1
    pnpm test:repo
    pnpm typecheck
    pnpm worker:build
    pnpm harness:check
    pnpm agent:dev

Production changes must run only from reviewed `main`:

    gh workflow run build-and-deploy.yml \
      --repo serpcompany/directory-platform-d1 \
      --ref main \
      -f site_id=serp.software \
      -f confirmation=deploy-serp.software-production

Success requires a retained production backup, migration `0008`, D1 parity
verification, Worker deploy, and a disposable live review whose private preview is
available while `verified` and unavailable after `reject`.

## Validation and acceptance

- One-click review: the assigned GitHub Issue has a clearly labeled private draft
  preview link before the approve/reject instructions.
- Visual fidelity: the preview renders the submitted name, description, content,
  logo/video, category, and resource links using the same detail slots as a public
  listing, plus a draft banner.
- Authorization: malformed IDs/tokens, wrong tokens, submissions without a matching
  notification capability, and non-verified statuses render only generic not-found.
- Privacy: the route is absent from sitemaps and navigation, suppresses JSON-LD, and
  sends private/no-store, no-referrer, and noindex headers/metadata.
- D1 ownership: submission data and the capability digest are read from normalized
  D1 tables; no draft catalog row or catalog file is introduced.
- Lifecycle: a protected approve or reject changes submission status and therefore
  immediately revokes preview access.
- Regression: the targeted tests, full harness, D1-backed PR E2E, and production
  route checks pass.

## Idempotence and recovery

The nullable column is a forward-only migration safe for the existing notification
row. New capability digests are unique. A notifier retry after an interrupted D1
write finds the issue by the submission marker, replaces its preview link with a new
token, and upserts the matching digest; the abandoned token never authorizes D1.

Notifier selection includes verified notification rows whose preview digest is
missing, allowing a safe one-time backfill. Once a digest exists, later schedules do
not rotate the working link. Approval or rejection revokes the page through the
status predicate without a separate cleanup mutation.

Production deployment retains the standard pre-change D1 backup. Restoring or
changing production still requires fresh authority under `docs/DEPLOY_RUNBOOK.md`.

## Interfaces and dependencies

- D1 migration: `d1/migrations/0008_submission_review_preview.sql`.
- Ledger field: `listing_submission_notifications.preview_token_hash`.
- Notifier helpers for token generation, SHA-256, issue rendering, and ledger upsert.
- Server-only query in `apps/serp.software/lib/submissions/`.
- Private route:
  `/admin/submissions/<submission-id>/preview/<review-capability>/`.
- Existing `WebsiteDetailRoutePage` and application detail-page slots.
- Existing protected notifier, approval, and deployment workflows.

## Important artifacts

- Targeted Vitest on 2026-07-30: 14 tests passed across the notifier and preview
  contracts.
- `pnpm d1:local:migrate`: migration `0008_submission_review_preview.sql` applied to
  the isolated local identity.
- `pnpm harness:fast`: all four checks passed.
- `pnpm harness:check`: all eight checks passed, including 36 D1 contract tests,
  130 repository tests with one intentional skip, Cloudflare configuration
  validation, lint, type boundaries, and the OpenNext Worker build.
- `CI=1 pnpm test:e2e`: all 14 Chromium browser tests passed.
- Local Worker preview at `http://127.0.0.1:8837`: correct capability returned 200
  with the submitted name, content, logo, category, and resource link; wrong
  capability returned 404.
- Local headers: `Cache-Control: private, no-store, max-age=0`,
  `Referrer-Policy: no-referrer`, and
  `X-Robots-Tag: noindex, nofollow, noarchive`.
- Local lifecycle: changing the staged D1 status from `verified` to `rejected`
  changed the formerly valid preview from 200 to 404.
- Screenshot:
  `.runtime/directory-platform-d1-main/artifacts/private-submission-draft-preview.png`.
- Add PR/CI URLs, deployment run, live private issue, and post-decision revocation
  evidence after release.

## Outcomes and retrospective

Complete after the requirement-by-requirement audit.
