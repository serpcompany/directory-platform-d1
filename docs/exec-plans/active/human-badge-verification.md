# Make badge verification understandable and reliable

Status: active
Owner: submission intake
Created: 2026-07-30
Last updated: 2026-07-30 05:49 JST

## Purpose and big picture

Someone verifying a submitted listing must be able to tell whether SERP Software
reached the submitted page, whether it found the badge, and what they should do next.
Raw internal codes such as `fetch_failed` must never be presented as if they mean the
badge was absent. A temporary verifier/network failure must remain retryable without
consuming the limited number of content-verification attempts.

## Context and orientation

`apps/serp.software/lib/submissions/badge-verifier.ts` fetches the submitted URL and
scans returned HTML. `apps/serp.software/app/api/submissions/[id]/verify/route.ts`
persists the result through
`apps/serp.software/lib/submissions/repository.ts`. The client experience lives in
`packages/web-core/src/forms/d1-submission-form.tsx`.

The current `fetch_failed` code conflates timeouts, connection failures, HTTP error
statuses, and redirect failures. The client then inserts that raw code into
“Badge not verified,” which falsely implies that the page was fetched and scanned.
D1 remains the only submission store. Production changes are deployed only by the
protected GitHub Actions workflow in `docs/DEPLOY_RUNBOOK.md`.

## Progress

- [x] 2026-07-30 05:18 JST Reproduced and traced the ambiguous `fetch_failed` path in
  the verifier, route, repository, and client.
- [x] 2026-07-30 05:34 JST Implemented typed, distinct fetch and scan outcomes,
  actionable persistent client diagnostics, and exact-URL instructions.
- [x] 2026-07-30 05:34 JST Proved reachable-without-badge and unreachable-site
  behavior through the local OpenNext Worker, D1 API, restored UI, and screenshots.
- [x] 2026-07-30 05:49 JST Passed the repository harness and the complete Playwright
  suite, including a restore-and-retry browser test for the new diagnostic.
- [ ] Pass GitHub review checks.
- [ ] Deploy through the protected workflow and verify production behavior.

## Surprises and discoveries

- Observation: `fetch_failed` currently represents DNS/TLS/connection failure,
  timeout, non-2xx HTTP status, missing redirect location, and too many redirects.
  Evidence: `verifyFeaturedBadge()` returns that one code from each of those branches.
- Observation: every failed fetch increments the permanent ten-attempt counter.
  Evidence: `finishVerification()` unconditionally increments
  `verification_attempts`.
- Observation: the UI says to install the badge on “a public page,” but the verifier
  checks only the exact submitted website URL.
  Evidence: `verifyFeaturedBadge(state.website, targets)` and the modal instructions.
- Observation: local Workerd reports an unresolvable hostname as a generic `Error`,
  while Node commonly uses `TypeError`.
  Evidence: the first local Worker run classified an `.invalid` hostname as
  `verification_service_error`; after classification was based on the failing phase,
  the same Worker/D1 journey returned `site_unreachable` with zero attempts consumed.

## Decision log

- Decision: Keep SSRF validation, the 30-second cooldown, manual redirect validation,
  the response-size bound, and the ten-attempt content-failure limit.
  Rationale: Those are security/resource controls. The quality defect is ambiguous
  classification and permanent charging of transient infrastructure failures.
  Date: 2026-07-30
- Decision: Store stable diagnostic codes in the existing
  `last_verification_error` column; do not add a schema migration.
  Rationale: The column already owns the latest verifier outcome and can hold precise
  codes such as `http_403`. This preserves restored-session diagnostics without a
  second source of truth.
  Date: 2026-07-30

## Plan of work

First, replace the catch-all fetch outcome with stable codes for timeout,
unreachable site, HTTP status, redirect failure, non-HTML response, and oversized
HTML while preserving the existing badge scan outcomes.

Second, centralize client-facing explanations so each code produces a plain-language
title, explanation, and next action. Render the result inside the verification dialog
next to the button, identify the exact URL being checked, and never show raw codes.

Third, make only actual HTML scan failures consume the limited attempt counter.
Network, timeout, HTTP, redirect, and response-format failures still update the last
check time and remain subject to the cooldown.

Finally, exercise all result classes with deterministic fetch mocks, run the local
OpenNext Worker and browser journey, run the full harness and Playwright suite, merge
after protected checks, deploy through the production workflow, and perform a
disposable live D1 submission check followed by protected rejection.

## Concrete commands

Run from `/Users/devin/dev/repos/directory-platform-d1`:

```bash
pnpm exec vitest run \
  apps/serp.software/lib/submissions/badge-verifier.test.ts \
  packages/web-core/src/forms/d1-submission-form.test.ts
pnpm --filter serp.software typecheck
pnpm harness:fast
pnpm agent:dev
pnpm harness:check
CI=1 pnpm test:e2e
```

Expected observations include distinct deterministic results for badge absent,
nofollow, wrong destination, timeout, connection failure, HTTP error, redirect
failure, non-HTML, oversized response, and successful verification. Browser evidence
must show the exact checked URL and an actionable message without internal codes.

## Validation and acceptance

- “Badge missing” is shown only after a successful HTML fetch and scan:
  verifier tests plus local browser/API evidence.
- Timeout, unreachable site, HTTP status, and redirect problems have distinct,
  actionable copy: verifier and presentation tests plus rendered browser evidence.
- No raw `fetch_failed`, snake-case code, or parenthesized internal reason is visible:
  presentation test and browser snapshot.
- Transient fetch failures do not consume content attempts but remain cooled down:
  focused attempt-policy test and repository SQL contract assertion.
- Successful badge HTML still verifies and moves the row to `verified`:
  verifier test and existing D1 contract tests.
- The production Worker passes its protected deployment workflow; live `/submit/`
  demonstrates at least one fetched-but-missing result and one unreachable result.

## Idempotence and recovery

Focused tests and local runtime checks are safe to rerun. Local disposable submissions
must be removed from isolated local D1. Production disposable submissions are rejected
through `.github/workflows/approve-d1-submission.yml`, never deleted directly.
Production deployment is retried only from reviewed `main`. The deployment workflow
retains a D1 backup, although this change has no schema migration. A Worker regression
is recovered by reverting the merged commit and redeploying reviewed `main`; D1 rows
and existing stable error strings remain compatible.

## Interfaces and dependencies

- `verifyFeaturedBadge()` returns a typed success or stable failure code.
- `finishVerification()` applies an explicit attempt-consumption policy.
- `POST /api/submissions/[id]/verify` returns the updated D1-backed state.
- The client maps persisted verifier codes to a user-facing diagnostic.
- Cloudflare Worker `fetch`, `AbortSignal.timeout`, and the `DB` D1 binding remain the
  runtime dependencies.

## Important artifacts

- `.runtime/directory-platform-d1-main/artifacts/human-badge-missing.png`
- `.runtime/directory-platform-d1-main/artifacts/human-badge-unreachable.png`
- `.runtime/directory-platform-d1-main/logs/runtime.log`
- `CI=1 pnpm test:e2e`: 15 passed, including
  `apps/e2e/tests/submission-verification.spec.ts`
- `pnpm harness:check`: repository tests, type checks, lint, architecture and D1
  contracts, documentation checks, Cloudflare configuration, and Worker build passed
- PR checks, production deployment, and protected cleanup runs remain pending.

## Outcomes and retrospective

Pending implementation and acceptance evidence.
