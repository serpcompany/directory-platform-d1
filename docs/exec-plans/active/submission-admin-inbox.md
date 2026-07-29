# Notify and review badge-verified submissions

Status: active
Owner: submission intake and production operations
Created: 2026-07-30
Last updated: 2026-07-30

## Purpose and big picture

A visitor can submit a directory listing, must install and verify the supplied
`serp.software` badge, and then receives a clear queued-for-review result. Within a
few minutes of successful badge verification, the repository opens one private
GitHub Issue assigned to the configured reviewer. The issue contains the staged D1
record and exact review instructions. The reviewer uses the existing protected
`Review D1 submission` workflow to approve or decline it; that workflow updates D1,
publishes only an approved verified row, comments on the notification issue, and
closes it.

GitHub Issues are an operational notification and inbox only. D1 remains the sole
submission and catalog data store.

## Context and orientation

The public form is
`packages/web-core/src/forms/d1-submission-form.tsx`. Intake and badge state live in
`apps/serp.software/lib/submissions/repository.ts` and the normalized
`listing_submissions` tables. A successful badge check changes a row from
`pending_badge` to `verified`; it does not publish it.

The existing `.github/workflows/approve-d1-submission.yml` and
`scripts/d1-submission-approver.ts` are the protected production decision boundary.
The repository is private, GitHub Issues are enabled, and the sole direct repository
administrator is currently `devinschumacher`. The `production` GitHub environment
already contains the scoped Cloudflare credentials used by existing D1 workflows.

The new notification workflow will run every five minutes and on manual dispatch.
It will use the same production environment, serialize with other D1 mutation
workflows, and create assigned issues with `issues: write`. A forward-only D1 table
will record the external issue identity so the process is idempotent and auditable.

## Progress

- [x] 2026-07-30 02:45 JST Audited the D1 intake, badge-verification UI, protected
      reviewer workflow, GitHub repository visibility/issues/collaborators, and
      production secret placement.
- [x] 2026-07-30 02:55 JST Added the notification schema, notifier, workflow,
      reviewer issue lifecycle, and targeted contract tests; 34 D1 contract tests
      pass.
- [x] 2026-07-30 03:01 JST Proved normalized local submission storage, applied the
      new migration to existing isolated state, passed the full eight-stage harness,
      and captured the badge-required form and embed modal.
- [x] 2026-07-30 03:10 JST Repaired the stale Playwright server/expectation
      configuration exposed by PR CI; all 14 functional E2E tests pass against the
      local OpenNext Worker and D1.
- [ ] Configure the production reviewer, deploy the migration/application, exercise
      a live badge-verified submission, and prove its assigned issue can be declined
      without publishing.

## Surprises and discoveries

- Observation: the current repository is private and Issues are enabled, so pending
  submission details can be placed in a review issue without disclosing unapproved
  records publicly.
  Evidence: `gh api repos/serpcompany/directory-platform-d1` returned
  `private: true` and `has_issues: true`.
- Observation: there is one direct repository administrator,
  `devinschumacher`, and no repository watchers.
  Evidence: the GitHub collaborators and subscribers APIs returned that sole admin
  and an empty subscriber list. Assignment, rather than passive issue creation, is
  therefore required to make the notification concrete.
- Observation: the production Cloudflare credentials are environment secrets, and
  the production environment has a main-branch policy but no manual reviewer gate.
  Evidence: GitHub environment APIs list the five existing Cloudflare secret names
  and only a branch-policy protection rule.
- Observation: starting a preview against an existing isolated D1 state does not
  apply a newly added migration automatically.
  Evidence: the local submission was stored successfully, but a read-only
  `sqlite_schema` query did not find `listing_submission_notifications` until
  `pnpm d1:local:migrate` applied `0007_submission_notifications.sql`.
- Observation: the PR E2E job still targeted a removed `apps/starter` directory, ran
  the agent-only capture spec without its required environment, and expected an old
  autocomplete role/title.
  Evidence: GitHub run `30478305706` failed before server startup with
  `cd: can't cd to ../starter`; after targeting the guarded D1 Worker, local CI-mode
  Playwright exposed and fixed the two stale expectations, then passed 14/14 tests.
- Observation: a cold OpenNext Worker build on the GitHub E2E runner can exceed
  three minutes even though the same E2E journey starts in roughly 30 seconds
  locally.
  Evidence: GitHub run `30478933069` reached the new D1 Worker command but timed out
  at exactly 180 seconds before Playwright began; the dedicated Worker build job
  took nearly two minutes without the local D1 setup and preview startup.

## Decision log

- Decision: use assigned issues in the private
  `serpcompany/directory-platform-d1` repository for notifications.
  Rationale: this requires no new mail or Slack provider, preserves D1 as authority,
  and gives the admin an existing inbox with durable discussion history.
  Date: 2026-07-30.
- Decision: poll verified D1 rows from a scheduled GitHub Action rather than give the
  public Worker a GitHub token.
  Rationale: the Action can use the existing production Cloudflare environment
  credentials and its ephemeral `GITHUB_TOKEN`; no long-lived GitHub credential is
  added to the Worker.
  Date: 2026-07-30.
- Decision: retain the protected manual workflow as the approve/decline boundary.
  Rationale: notification is automatic, while catalog publication remains an
  explicit administrator decision with the existing backup and confirmation gates.
  Date: 2026-07-30.

## Plan of work

Milestone 1 adds a forward-only `listing_submission_notifications` table and a
tested notifier script. The script validates that it is running on `main` in the
dedicated workflow, selects verified submissions without a GitHub notification,
hydrates their normalized fields, creates or recovers one issue identified by an
opaque submission marker, assigns the configured reviewer, and records the issue in
D1.

Milestone 2 adds the scheduled/manual workflow. It uses the protected production
environment, least-privilege GitHub permissions, the shared D1 concurrency group,
and a repository variable for the reviewer login. It treats a not-yet-applied
migration as a safe no-op so a schedule cannot race the release that introduces the
table.

Milestone 3 updates the protected reviewer workflow so a successful approve or
decline decision comments on and closes the corresponding open issue. The D1
decision remains authoritative even if GitHub issue housekeeping must be retried.
The submit UI will state that successful verification queues the item and notifies
the administrator within a few minutes.

Milestone 4 runs targeted tests, the full harness, and local browser evidence. After
reviewed source is on `main`, configure the reviewer repository variable, deploy
through the protected production release, manually run the notifier once, and
exercise a disposable production submission through verification and decline.

## Concrete commands

All commands run from `/Users/devin/dev/repos/directory-platform-d1`.

    pnpm exec vitest run scripts/d1-submission-notifier.test.ts \
      scripts/d1-submission-approver.test.ts \
      packages/web-core/src/forms/d1-submission-form.test.ts
    pnpm test:d1
    pnpm test:repo
    pnpm typecheck
    pnpm harness:check
    pnpm agent:dev
    pnpm agent:ui:capture -- --path /submit

Production setup and execution must use GitHub and the existing protected
workflows, never a local production D1 command:

    gh variable set SUBMISSION_REVIEWER_GITHUB_LOGIN \
      --repo serpcompany/directory-platform-d1 --body devinschumacher
    gh workflow run build-and-deploy.yml --repo serpcompany/directory-platform-d1 \
      --ref main -f site_id=serp.software \
      -f confirmation=deploy-serp.software-production
    gh workflow run notify-d1-submissions.yml \
      --repo serpcompany/directory-platform-d1 --ref main

Success means the deployment workflow applies the new migration and deploys the
Worker, the notification run creates an assigned issue for a verified disposable
submission, and the protected review workflow closes that issue after declining it.

## Validation and acceptance

- Stored submission: API/repository tests and local D1 runtime evidence show form
  fields, resource links, FAQs, state, and events in normalized D1 tables.
- Badge gate: browser evidence shows the embed modal after save; verifier tests and
  runtime evidence show only a live expected dofollow badge changes the state to
  `verified`.
- Admin notification: notifier unit tests prove selection, hydration,
  assignment, idempotent issue recovery, and D1 recording. A live GitHub run and
  assigned issue prove external delivery.
- Review and decision: approver tests prove approve publishes a verified row and
  decline does not. A live declined test submission proves the production issue is
  commented on and closed with no public listing.
- Architecture: `pnpm harness:check` proves JSON catalogs and GitHub Issue-backed
  submission intake remain absent.

## Idempotence and recovery

The notification table has one row per submission/channel. Workflow concurrency
prevents overlapping notifier or review mutations. If issue creation succeeds but
the D1 record fails, the next run searches for the hidden submission marker and
records the existing issue instead of creating another. If D1 has not received the
new migration yet, notification exits successfully without mutation and the next
scheduled run retries.

Approve and decline are already idempotent in D1. Issue commenting/closure happens
only after a successful D1 decision and can be retried manually if GitHub is
temporarily unavailable. Production migration and deployment retain the existing
pre-change D1 backup. Restoring D1 or reverting a Worker still requires fresh
production authority under `docs/DEPLOY_RUNBOOK.md`.

## Interfaces and dependencies

- New D1 table: `listing_submission_notifications`.
- New CLI: `scripts/d1-submission-notifier.ts`.
- New workflow: `.github/workflows/notify-d1-submissions.yml`.
- Repository variable: `SUBMISSION_REVIEWER_GITHUB_LOGIN`.
- Existing Cloudflare environment secrets and D1 HTTP API.
- GitHub REST Issues API through the workflow `GITHUB_TOKEN`.
- Existing `approve-d1-submission.yml` and `d1-submission-approver.ts`.

## Important artifacts

- Badge-required form:
  `.runtime/directory-platform-d1-main/artifacts/ui/submission-badge-required/after.png`.
- Badge embed modal:
  `.runtime/directory-platform-d1-main/artifacts/ui/submission-admin-notification/badge-modal.png`.
- Local D1 evidence submission:
  `f457bf03-764b-4a86-875c-9a563da501cc`, status `pending_badge`, with one resource
  link and one FAQ in isolated runtime state.
- Populate this section with production workflow run URLs, the live review issue, and
  the declined submission status during release validation.

## Outcomes and retrospective

Complete this after the requirement-by-requirement audit. Record notification
latency, live workflow behavior, the disposable test cleanup/decline result, and any
residual operational risks.
