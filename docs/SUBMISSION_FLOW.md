# Submission flow

The public `/submit` page queries active categories from D1. Its client form sends a
validated request to `POST /api/submissions`, which writes the submission, resource
links, FAQs, and creation event to normalized D1 staging tables. The response includes
an opaque capability token; only its SHA-256 digest is stored.

The submitter installs either generated badge and selects **Verify installed badge**.
`POST /api/submissions/<id>/verify` authenticates the capability, enforces attempt and
cooldown limits, and performs a bounded server-side fetch of the submitted public
website. Verification succeeds only when the expected badge image links to the future
listing URL without `nofollow`. Successful verification changes the staging status to
`verified`; it does not make the listing public. The form tells the submitter that the
administrator will be notified within a few minutes.

A scheduled and manually dispatchable
`.github/workflows/notify-d1-submissions.yml` reads verified rows that have no
notification ledger entry. It creates or recovers one issue in the private
`serpcompany/directory-platform-d1` repository, assigns the reviewer configured in
`SUBMISSION_REVIEWER_GITHUB_LOGIN`, and stores the issue number and URL in
`listing_submission_notifications`. The issue contains the normalized submission,
badge timestamp, and review instructions, but D1 remains authoritative.

The assigned maintainer reviews the issue and manually runs
`.github/workflows/approve-d1-submission.yml` from `main`. The workflow requires the
`approve-serp.software-submission-production` confirmation and protected production
environment. It retains a pre-change D1 export, applies migrations, verifies the row
is badge-verified, atomically promotes its normalized data into the catalog, and
records publication and submission audit events.
The same protected workflow can reject a pending or verified row without creating a
listing. After either successful decision, it comments on and closes the matching
review issue.

The public form is implemented in
`packages/web-core/src/forms/d1-submission-form.tsx`; the server-only write boundary is
`apps/serp.software/lib/submissions/repository.ts`. Submission intake does not use
GitHub Issues or catalog files as data sources; an assigned private issue is only the
admin notification and inbox.
